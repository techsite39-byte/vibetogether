import { Router } from 'express'
import { categories as defaultCategories } from '../../../src/data/categories.js'
import { events as defaultEvents } from '../../../src/data/events.js'
import { normalizeWhatsAppNumber } from '../services/whatsapp.js'

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const eventIdPattern = /^[a-z0-9-]{1,80}$/
const rateLimitWindowMs = 15 * 60 * 1000
const rateLimitMaxRequests = 5

function createRateLimiter() {
  const clients = new Map()

  return function rateLimitBookingEnquiries(request, response, next) {
    const now = Date.now()
    const clientKey = request.ip ?? request.socket.remoteAddress ?? 'unknown'
    const current = clients.get(clientKey)
    const entry =
      !current || now - current.windowStartedAt >= rateLimitWindowMs
        ? { windowStartedAt: now, count: 0 }
        : current

    entry.count += 1
    clients.set(clientKey, entry)

    if (clients.size > 10000) {
      for (const [key, value] of clients) {
        if (now - value.windowStartedAt >= rateLimitWindowMs) {
          clients.delete(key)
        }
      }
    }

    if (entry.count > rateLimitMaxRequests) {
      response.set('Retry-After', String(Math.ceil(rateLimitWindowMs / 1000)))
      response.status(429).json({
        message: 'Too many booking requests. Please try again later.',
      })
      return
    }

    next()
  }
}

function normalizeText(value, field, maxLength) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.normalize('NFKC').trim()
  const hasUnsafeCharacters = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0)
    return (
      character === '<' ||
      character === '>' ||
      codePoint <= 31 ||
      codePoint === 127
    )
  })
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    hasUnsafeCharacters
  ) {
    return null
  }

  if (field === 'name' && !/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u.test(normalized)) {
    return null
  }

  return normalized
}

async function validateBookingEnquiry(body, eventRepository) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Please provide valid booking details.' }
  }

  const name = normalizeText(body.name, 'name', 80)
  const normalizedMobile = normalizeWhatsAppNumber(body.mobile)
  const mobile = normalizedMobile ? `+${normalizedMobile}` : ''
  const eventId =
    typeof body.eventId === 'string' && eventIdPattern.test(body.eventId)
      ? body.eventId
      : ''
  const categoryId =
    typeof body.categoryId === 'string' &&
    eventIdPattern.test(body.categoryId)
      ? body.categoryId
      : ''
  const gender = body.gender
  if (
    body.whatsappConsent !== undefined &&
    typeof body.whatsappConsent !== 'boolean'
  ) {
    return { error: 'WhatsApp communication consent must be selected explicitly.' }
  }

  if (!name) {
    return { error: 'Enter a valid full name.' }
  }
  if (!mobile || mobile.replace(/\D/g, '').length < 7 || mobile.replace(/\D/g, '').length > 15) {
    return { error: 'Enter a valid mobile number with 7 to 15 digits.' }
  }
  if (gender !== 'Male' && gender !== 'Female') {
    return { error: 'Select Male or Female.' }
  }

  let enquirySelection
  if (body.categoryId !== undefined) {
    const selectedCategory = defaultCategories.find(
      (category) => category.id === categoryId,
    )
    if (!selectedCategory) {
      return { error: 'Choose one valid category of interest.' }
    }
    enquirySelection = {
      eventId: '',
      event: '',
      categoryId: selectedCategory.id,
      category: selectedCategory.title,
    }
  } else {
    if (!eventId) {
      return { error: 'Select an available event.' }
    }
    const selectedEvent = await eventRepository.findById(eventId)
    if (!selectedEvent) {
      return { error: 'The selected event is not available.' }
    }
    enquirySelection = {
      eventId: selectedEvent.id,
      event: selectedEvent.title,
      categoryId: '',
      category: '',
    }
  }

  if (typeof body.requestId !== 'string' || !requestIdPattern.test(body.requestId)) {
    return { error: 'The booking request could not be verified. Please retry.' }
  }

  return {
    value: {
      requestId: body.requestId,
      name,
      mobile,
      ...enquirySelection,
      gender,
      whatsappConsent: body.whatsappConsent === true,
      whatsappConsentAt: body.whatsappConsent === true ? new Date() : null,
      createdAt: new Date(),
      source: 'Website booking journey',
      status: 'pending',
    },
  }
}

export function createBookingEnquiriesRouter({
  events = defaultEvents,
  eventRepository,
  repository,
  whatsappService,
}) {
  if (
    !repository ||
    typeof repository.save !== 'function' ||
    typeof repository.findByRequestId !== 'function' ||
    typeof repository.markDemoPaid !== 'function'
  ) {
    throw new Error('A booking enquiry repository is required.')
  }

  const router = Router()
  const rateLimit = createRateLimiter()
  const selectedEventRepository =
    eventRepository ??
    {
      async findById(id) {
        return events.find((event) => event.id === id) ?? null
      },
    }
  function serializeEnquiry(enquiry) {
    return {
      reference: enquiry.reference ?? '',
      requestId: enquiry.requestId,
      name: enquiry.name,
      mobile: enquiry.mobile,
      category: enquiry.category,
      event: enquiry.event,
      gender: enquiry.gender,
      createdAt: enquiry.createdAt,
      status: enquiry.status,
      paymentStatus: enquiry.paymentStatus ?? 'unpaid',
      paymentAmount: enquiry.paymentAmount ?? 299,
      paymentProvider: enquiry.paymentProvider ?? '',
      paymentReference: enquiry.paymentReference ?? '',
      paidAt: enquiry.paidAt ?? null,
      whatsappConsent: Boolean(enquiry.whatsappConsent),
      whatsappConsentAt: enquiry.whatsappConsentAt ?? null,
      whatsappOptedOutAt: enquiry.whatsappOptedOutAt ?? null,
      whatsappNotification: {
        messageType: enquiry.whatsappNotification?.messageType ?? 'booking_confirmation',
        bookingReference: enquiry.whatsappNotification?.bookingReference ?? enquiry.reference ?? '',
        status: enquiry.whatsappConsent
          ? enquiry.whatsappNotification?.status ?? 'pending'
          : 'skipped',
        attemptCount: enquiry.whatsappNotification?.attemptCount ?? 0,
        lastAttemptAt: enquiry.whatsappNotification?.lastAttemptAt ?? null,
        deliveredAt: enquiry.whatsappNotification?.deliveredAt ?? null,
      },
    }
  }

  async function sendInitialConfirmation(enquiry) {
    if (
      !enquiry.whatsappConsent ||
      typeof repository.claimWhatsAppAttempt !== 'function' ||
      typeof repository.completeWhatsAppAttempt !== 'function' ||
      typeof whatsappService?.sendBookingConfirmation !== 'function'
    ) {
      return enquiry
    }

    const claimed = await repository.claimWhatsAppAttempt(enquiry.requestId)
    if (!claimed) {
      return enquiry
    }
    let result
    try {
      const settings = typeof repository.getWhatsAppSettings === 'function'
        ? await repository.getWhatsAppSettings()
        : {}
      result = await whatsappService.sendBookingConfirmation(claimed, settings)
    } catch {
      result = {
        status: 'failed',
        reason: 'WhatsApp confirmation could not be sent. An administrator can retry it.',
      }
    }
    try {
      return await repository.completeWhatsAppAttempt(enquiry.requestId, result) ?? claimed
    } catch {
      console.error('WhatsApp notification status could not be saved.')
      return claimed
    }
  }

  router.post('/', rateLimit, async (request, response) => {
    try {
      const validation = await validateBookingEnquiry(
        request.body,
        selectedEventRepository,
      )
      if (validation.error) {
        response.status(400).json({ message: validation.error })
        return
      }

      const result = await repository.save(validation.value)
      let savedEnquiry = result.enquiry
      if (!result.duplicate) {
        try {
          savedEnquiry = await sendInitialConfirmation(savedEnquiry)
        } catch {
          console.error('WhatsApp confirmation attempt could not be completed.')
        }
      }
      response.status(result.duplicate ? 200 : 201).json({
        message: 'Your booking request has been received.',
        duplicate: result.duplicate,
        booking: serializeEnquiry(savedEnquiry),
      })
    } catch (error) {
      if (error.status === 409) {
        response.status(409).json({
          message:
            'This request was already submitted with different details. Please retry with a new request.',
        })
        return
      }

      console.error('Booking enquiry persistence failed.')
      response.status(503).json({
        message: 'We could not save your request right now. Please try again.',
      })
    }
  })

  router.get('/:requestId', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }

    try {
      const enquiry = await repository.findByRequestId(requestId)
      if (!enquiry) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      response.set('Cache-Control', 'no-store')
      response.json({ booking: serializeEnquiry(enquiry) })
    } catch {
      console.error('Booking enquiry lookup failed.')
      response.status(503).json({
        message: 'Booking details are temporarily unavailable. Please try again.',
      })
    }
  })

  router.post('/:requestId/whatsapp-opt-out', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    try {
      const enquiry = await repository.optOutWhatsApp?.(requestId)
      if (!enquiry) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      response.json({ booking: serializeEnquiry(enquiry) })
    } catch {
      console.error('WhatsApp opt-out could not be saved.')
      response.status(503).json({ message: 'WhatsApp preferences could not be updated. Please try again.' })
    }
  })

  router.post('/:requestId/demo-payment', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }

    try {
      const result = await repository.markDemoPaid(requestId)
      if (!result) {
        response.status(404).json({ message: 'Booking enquiry not found or no longer payable.' })
        return
      }
      response.status(200).json({
        message: 'Demo payment recorded. No real payment was processed.',
        duplicate: result.duplicate,
        booking: serializeEnquiry(result.enquiry),
      })
    } catch {
      console.error('Demo booking payment persistence failed.')
      response.status(503).json({
        message: 'Demo payment could not be recorded. Please try again.',
      })
    }
  })

  return router
}
