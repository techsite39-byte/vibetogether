import { Router } from 'express'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { categories as defaultCategories } from '../../../src/data/categories.js'
import { events as defaultEvents } from '../../../src/data/events.js'

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const eventIdPattern = /^[a-z0-9-]{1,80}$/
const rateLimitWindowMs = 15 * 60 * 1000
const rateLimitMaxRequests = 5

function normalizeMobileNumber(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const parsed = parsePhoneNumberFromString(value.trim())
  return parsed?.isValid() ? parsed.number : ''
}

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
  const email = body.email === undefined || body.email === ''
    ? ''
    : normalizeText(body.email, 'email', 254)?.toLowerCase() ?? null
  const normalizedMobile = normalizeMobileNumber(body.mobile)
  const mobile = normalizedMobile
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
  if (email === null || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: 'Enter a valid email address or leave it blank.' }
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
      email,
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
  razorpayPayments,
  razorpayConfigured = false,
  diwaliOfferService,
  whatsappNotifications,
}) {
  if (
    !repository ||
    typeof repository.save !== 'function' ||
    typeof repository.findByRequestId !== 'function' ||
    typeof repository.markDemoPaid !== 'function' ||
    typeof repository.markDemoFailed !== 'function'
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
  function serializeEnquiry(enquiry, pricing) {
    return {
      reference: enquiry.reference ?? '',
      requestId: enquiry.requestId,
      name: enquiry.name,
      mobile: enquiry.mobile,
      email: enquiry.email ?? '',
      category: enquiry.category,
      event: enquiry.event,
      gender: enquiry.gender,
      createdAt: enquiry.createdAt,
      status: enquiry.status,
      paymentStatus: enquiry.paymentStatus ?? 'unpaid',
      paymentAmount: pricing?.paymentAmount ?? enquiry.paymentAmount ?? 299,
      paymentAmountPaise: pricing?.paymentAmountPaise ?? enquiry.paymentAmountPaise ?? 29_900,
      regularPrice: pricing?.regularPrice ?? enquiry.regularPrice ?? 299,
      offerPrice: pricing?.offerPrice ?? enquiry.offerPrice ?? 249,
      diwaliOfferApplied: pricing?.diwaliOfferApplied ?? Boolean(enquiry.diwaliOfferApplied),
      offerActivationAt: pricing?.offerActivationAt ?? enquiry.offerActivationAt ?? null,
      offerExpiresAt: pricing?.offerExpiresAt ?? enquiry.offerExpiresAt ?? null,
      paymentProvider: enquiry.paymentProvider ?? '',
      paymentReference: enquiry.paymentReference ?? '',
      paymentOrderId: enquiry.paymentOrderId ?? '',
      razorpayPaymentId: enquiry.razorpayPaymentId ?? '',
      paidAt: enquiry.paidAt ?? null,
      paymentVerifiedAt: enquiry.paymentVerifiedAt ?? null,
      paymentFailureReason: enquiry.paymentFailureReason ?? '',
      paymentAttemptedAt: enquiry.paymentAttemptedAt ?? null,
      whatsappConsent: Boolean(enquiry.whatsappConsent),
      razorpayConfigured,
      whatsappConsentAt: enquiry.whatsappConsentAt ?? null,
      whatsappOptedOutAt: enquiry.whatsappOptedOutAt ?? null,
      whatsappNotification: {
        messageType: enquiry.whatsappNotification?.messageType ?? 'booking_confirmation',
        bookingReference: enquiry.whatsappNotification?.bookingReference ?? enquiry.reference ?? '',
        status: enquiry.whatsappNotification?.status ?? 'skipped',
        attemptCount: enquiry.whatsappNotification?.attemptCount ?? 0,
        lastAttemptAt: enquiry.whatsappNotification?.lastAttemptAt ?? null,
        deliveredAt: enquiry.whatsappNotification?.deliveredAt ?? null,
        failureReason: enquiry.whatsappNotification?.failureReason ?? '',
      },
    }
  }

  async function notifyWithoutAffectingPayment(requestId, type) {
    try {
      await whatsappNotifications?.notify?.(requestId, type)
    } catch {
      console.error('WhatsApp notification processing failed.')
    }
  }

  async function getCurrentPricing(enquiry) {
    if (
      enquiry &&
      (
        (enquiry.paymentOrderId && enquiry.paymentStatus !== 'failed') ||
        ['paid', 'demo_paid'].includes(enquiry.paymentStatus)
      )
    ) {
      return null
    }
    return diwaliOfferService?.getPricing?.() ?? null
  }

  async function getUpdatedEnquiry(requestId, fallback) {
    try {
      return await repository.findByRequestId(requestId) ?? fallback
    } catch {
      return fallback
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

      const pricing = await diwaliOfferService?.getPricing?.()
      const result = await repository.save({
        ...validation.value,
        ...(pricing ?? {}),
      })
      response.status(result.duplicate ? 200 : 201).json({
        message: 'Your booking request has been received.',
        duplicate: result.duplicate,
        booking: serializeEnquiry(
          result.enquiry,
          await getCurrentPricing(result.enquiry) ?? pricing,
        ),
      })
    } catch (error) {
      if (error.status === 409) {
        response.status(409).json({
          message:
            'This request was already submitted with different details. Please retry with a new request.',
        })
        return
      }

      console.error('Booking enquiry persistence failed:', {
        name: error?.name ?? 'UnknownError',
        code: error?.code ?? '',
      })
      response.status(503).json({
        message: "We're temporarily unable to process your booking. Please try again shortly.",
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
      let enquiry = await repository.findByRequestId(requestId)
      if (!enquiry) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
        await notifyWithoutAffectingPayment(requestId, 'booking_confirmation')
        enquiry = await getUpdatedEnquiry(requestId, enquiry)
      } else if (enquiry.paymentStatus === 'failed') {
        await notifyWithoutAffectingPayment(requestId, 'payment_assistance')
        enquiry = await getUpdatedEnquiry(requestId, enquiry)
      }
      const pricing = await getCurrentPricing(enquiry)
      response.set('Cache-Control', 'no-store')
      response.json({ booking: serializeEnquiry(enquiry, pricing) })
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
    if (razorpayConfigured) {
      response.status(404).json({ message: 'Demo payments are disabled while Razorpay Checkout is configured.' })
      return
    }

    try {
      const result = await repository.markDemoPaid(requestId)
      if (!result) {
        response.status(404).json({ message: 'Booking enquiry not found or no longer payable.' })
        return
      }
      await notifyWithoutAffectingPayment(requestId, 'booking_confirmation')
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

  router.post('/:requestId/razorpay-order', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    if (!razorpayConfigured || typeof razorpayPayments?.createOrder !== 'function') {
      response.status(503).json({ message: 'Razorpay Checkout is not configured on the booking server.' })
      return
    }

    try {
      const result = await razorpayPayments.createOrder(requestId)
      if (!result) {
        response.status(409).json({ message: 'This booking session is no longer payable.' })
        return
      }
      if (result.pending) {
        response.status(202).json({
          message: 'The payment order is still being checked. Check its status before retrying.',
          pending: true,
          booking: serializeEnquiry(result.booking),
        })
        return
      }
      response.json(result)
    } catch (error) {
      response.status(error.status ?? 500).json({
        message: error.message || 'Razorpay could not create the payment order.',
      })
    }
  })

  router.post('/:requestId/verify-payment', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    const fields = request.body
    if (
      !fields ||
      typeof fields.razorpay_payment_id !== 'string' ||
      typeof fields.razorpay_order_id !== 'string' ||
      typeof fields.razorpay_signature !== 'string'
    ) {
      response.status(400).json({ message: 'Razorpay payment ID, order ID, and signature are required.' })
      return
    }

    try {
      const result = await razorpayPayments?.verifyPayment?.(requestId, fields)
      if (!result) {
        response.status(409).json({ message: 'The payment could not be matched to this booking session.' })
        return
      }
      if (result.pending) {
        response.status(202).json({
          message: 'The payment is not captured yet. Check its status before retrying.',
          pending: true,
          booking: serializeEnquiry(result.booking),
        })
        return
      }
      if (result.booking.paymentStatus === 'paid') {
        await notifyWithoutAffectingPayment(requestId, 'booking_confirmation')
      }
      const booking = await getUpdatedEnquiry(requestId, result.booking)
      response.json({
        verified: true,
        duplicate: result.duplicate,
        booking: serializeEnquiry(booking),
      })
    } catch (error) {
      response.status(error.status ?? 500).json({
        message: error.message || 'Razorpay payment verification failed.',
      })
    }
  })

  router.post('/:requestId/razorpay-status', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    try {
      const result = await razorpayPayments?.checkStatus?.(requestId)
      if (!result) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      if (result.booking.paymentStatus === 'paid') {
        await notifyWithoutAffectingPayment(requestId, 'booking_confirmation')
      } else if (result.booking.paymentStatus === 'failed') {
        await notifyWithoutAffectingPayment(requestId, 'payment_assistance')
      }
      const booking = await getUpdatedEnquiry(requestId, result.booking)
      response.set('Cache-Control', 'no-store').json({
        pending: Boolean(result.pending),
        duplicate: Boolean(result.duplicate),
        booking: serializeEnquiry(booking),
      })
    } catch (error) {
      response.status(error.status ?? 502).json({
        message: error.message || 'Razorpay payment status could not be checked.',
      })
    }
  })

  router.post('/:requestId/razorpay-failure', async (request, response) => {
    const { requestId } = request.params
    const { orderId, paymentId = '', outcome = 'failed' } = request.body ?? {}
    if (!requestIdPattern.test(requestId) || typeof orderId !== 'string' || !orderId) {
      response.status(400).json({ message: 'A valid booking and Razorpay order are required.' })
      return
    }
    if (paymentId && typeof paymentId !== 'string') {
      response.status(400).json({ message: 'Razorpay payment ID is invalid.' })
      return
    }
    if (!['failed', 'cancelled'].includes(outcome)) {
      response.status(400).json({ message: 'Payment outcome must be failed or cancelled.' })
      return
    }
    try {
      const result = await razorpayPayments?.recordFailure?.(requestId, {
        orderId,
        paymentId,
        outcome,
      })
      if (!result) {
        response.status(409).json({ message: 'The payment outcome could not be matched to this booking.' })
        return
      }
      if (result.pending) {
        response.status(202).json({ pending: true, booking: serializeEnquiry(result.booking) })
        return
      }
      if (result.booking.paymentStatus === 'paid') {
        await notifyWithoutAffectingPayment(requestId, 'booking_confirmation')
      } else if (result.booking.paymentStatus === 'failed') {
        await notifyWithoutAffectingPayment(requestId, 'payment_assistance')
      }
      const booking = await getUpdatedEnquiry(requestId, result.booking)
      response.json({ booking: serializeEnquiry(booking) })
    } catch (error) {
      response.status(error.status ?? 502).json({
        message: error.message || 'Razorpay payment outcome could not be recorded.',
      })
    }
  })

  router.post('/:requestId/demo-payment-failure', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    if (razorpayConfigured) {
      response.status(404).json({ message: 'Demo payments are disabled while Razorpay Checkout is configured.' })
      return
    }
    const outcome = request.body?.outcome
    if (!['failed', 'cancelled'].includes(outcome)) {
      response.status(400).json({ message: 'Provide a failed or cancelled demo payment outcome.' })
      return
    }

    try {
      const enquiry = await repository.markDemoFailed(requestId, outcome)
      if (!enquiry) {
        response.status(409).json({ message: 'This payment can no longer be marked as failed.' })
        return
      }
      if (enquiry.paymentStatus === 'failed') {
        await notifyWithoutAffectingPayment(requestId, 'payment_assistance')
      }
      const booking = await getUpdatedEnquiry(requestId, enquiry)
      response.json({ booking: serializeEnquiry(booking) })
    } catch {
      response.status(503).json({
        message: 'Payment status could not be saved. Verify it before retrying.',
      })
    }
  })

  return router
}
