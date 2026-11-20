import { Router } from 'express'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { categories as defaultCategories } from '../../../src/data/categories.js'
import { events as defaultEvents } from '../../../src/data/events.js'
import {
  BOOKING_TICKET_TYPES,
  DEFAULT_TICKET_TYPE,
  DIWALI_OFFER_PRICE,
  DIWALI_REGULAR_PRICE,
  FIXED_BOOKING_AMOUNT,
  calculateTicketPricing,
} from '../services/diwaliOffer.js'
import {
  isRealPaidBookingStatus,
  normalizeBookingPaymentStatus,
} from '../../../src/utils/paymentStatus.js'

const defaultOfferPricing = {
  regularPrice: FIXED_BOOKING_AMOUNT,
  offerPrice: FIXED_BOOKING_AMOUNT,
  diwaliOfferApplied: false,
  offerActivationAt: null,
  offerExpiresAt: null,
}

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

function normalizeMemberNames(value, count) {
  if (value === undefined) {
    return Array(count).fill('')
  }
  if (!Array.isArray(value) || value.length > count) {
    return null
  }

  const names = value.map((name) => {
    if (typeof name !== 'string') {
      return null
    }
    const trimmed = name.normalize('NFKC').trim()
    return trimmed ? normalizeText(trimmed, 'memberName', 80) : null
  })
  if (names.some((name) => name === null)) {
    return null
  }
  return [...names, ...Array(count - names.length).fill('')]
}

function normalizeMemberMobiles(value, count, defaultCountry = 'IN') {
  if (value === undefined || !Array.isArray(value)) {
    return Array(count).fill('')
  }
  const mobiles = value.slice(0, count).map((mobile) => {
    if (typeof mobile !== 'string' || !mobile.trim()) {
      return ''
    }
    const trimmed = mobile.trim()
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry)
    if (parsed?.isValid()) {
      return parsed.number
    }
    if (!trimmed.startsWith('+')) {
      const withPlus = parsePhoneNumberFromString(`+${trimmed}`, defaultCountry)
      if (withPlus?.isValid()) {
        return withPlus.number
      }
    }
    return trimmed
  })
  return [...mobiles, ...Array(Math.max(0, count - mobiles.length)).fill('')]
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
  const hasGenderCounts = body.maleCount !== undefined || body.femaleCount !== undefined
  if (hasGenderCounts && (
    !Number.isInteger(body.maleCount) || body.maleCount < 0 || body.maleCount > 10 ||
    !Number.isInteger(body.femaleCount) || body.femaleCount < 0 || body.femaleCount > 10
  )) {
    return { error: 'Enter valid Male and Female ticket counts.' }
  }
  const maleCount = hasGenderCounts
    ? body.maleCount
    : (body.gender === 'Male' ? (body.ticketQuantity ?? 1) : 0)
  const femaleCount = hasGenderCounts
    ? body.femaleCount
    : (body.gender === 'Female' ? (body.ticketQuantity ?? 1) : 0)
  const ticketQuantity = hasGenderCounts
    ? maleCount + femaleCount
    : (body.ticketQuantity ?? 1)
  if (!hasGenderCounts && body.gender === 'Mixed') {
    return { error: 'Select Male and Female counts for a mixed booking.' }
  }
  if (hasGenderCounts && body.ticketQuantity !== undefined && body.ticketQuantity !== ticketQuantity) {
    return { error: 'Male and Female counts must equal the total ticket quantity.' }
  }

  let maleMemberNames = normalizeMemberNames(body.maleMemberNames, maleCount)
  let femaleMemberNames = normalizeMemberNames(body.femaleMemberNames, femaleCount)

  if (body.maleMemberNames === undefined && body.femaleMemberNames === undefined && ticketQuantity === 1) {
    if (maleCount === 1) maleMemberNames = [name]
    if (femaleCount === 1) femaleMemberNames = [name]
  }

  if (
    !maleMemberNames ||
    !femaleMemberNames ||
    maleMemberNames.some((name) => !name) ||
    femaleMemberNames.some((name) => !name)
  ) {
    return { error: 'Every ticket must have a valid attendee name matching the selected ticket counts.' }
  }

  const maleMemberMobiles = normalizeMemberMobiles(body.maleMemberMobiles, maleCount)
  const femaleMemberMobiles = normalizeMemberMobiles(body.femaleMemberMobiles, femaleCount)

  const attendees = [
    ...maleMemberNames.map((mName, i) => ({
      name: mName,
      gender: 'Male',
      mobile: maleMemberMobiles[i] || '',
    })),
    ...femaleMemberNames.map((fName, i) => ({
      name: fName,
      gender: 'Female',
      mobile: femaleMemberMobiles[i] || '',
    })),
  ]

  if (maleCount + femaleCount !== ticketQuantity) {
    return { error: 'Male and Female attendee counts must equal the selected ticket quantity.' }
  }

  let gender = hasGenderCounts ? undefined : body.gender
  if (!gender) {
    if (maleCount > 0 && femaleCount === 0) gender = 'Male'
    else if (femaleCount > 0 && maleCount === 0) gender = 'Female'
    else if (maleCount > 0 && femaleCount > 0) gender = 'Mixed'
  }

  const ticketType = body.ticketType ?? DEFAULT_TICKET_TYPE
  if (
    !BOOKING_TICKET_TYPES.some(({ id }) => id === ticketType) ||
    !Number.isInteger(ticketQuantity) ||
    ticketQuantity < 1 ||
    ticketQuantity > 10
  ) {
    return { error: 'Choose a valid ticket type and a quantity from 1 to 10.' }
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
  if (gender !== 'Male' && gender !== 'Female' && gender !== 'Mixed') {
    return { error: 'Select at least one Male or Female ticket.' }
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
      maleCount,
      femaleCount,
      maleMemberNames,
      femaleMemberNames,
      maleMemberMobiles,
      femaleMemberMobiles,
      attendees,
      ticketType,
      ticketQuantity,
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
  cashfreePayments,
  cashfreeConfigured = false,
  paymentProvider = 'cashfree',
  nodeEnv = 'production',
  upiId = 'vinothinimoorthi37-1@okhdfcbank',
  upiPayeeName = 'Vinothini Moorthi',
  diwaliOfferService,
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
  if (paymentProvider === 'upi' && typeof repository.submitUpiPayment !== 'function') {
    throw new Error('The UPI payment repository operation is required when UPI is enabled.')
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
    const regularPrice = pricing?.regularPrice ?? enquiry.regularPrice ?? DIWALI_REGULAR_PRICE
    const ticketQuantity = pricing?.ticketQuantity ?? enquiry.ticketQuantity ?? 1
    const ticketType = pricing?.ticketType ?? enquiry.ticketType ?? DEFAULT_TICKET_TYPE
    const maleCount = enquiry.maleCount ?? (enquiry.gender === 'Male' ? ticketQuantity : 0)
    const femaleCount = enquiry.femaleCount ?? (enquiry.gender === 'Female' ? ticketQuantity : 0)
    const paymentProviderMode =
      enquiry.paymentProvider && enquiry.paymentProvider !== 'demo'
        ? enquiry.paymentProvider
        : paymentProvider
    return {
      reference: enquiry.reference ?? '',
      requestId: enquiry.requestId,
      name: enquiry.name,
      mobile: enquiry.mobile,
      email: enquiry.email ?? '',
      category: enquiry.category,
      event: enquiry.event,
      gender: enquiry.gender,
      maleCount,
      femaleCount,
      maleMemberNames: Array.from({ length: maleCount }, (_, index) => enquiry.maleMemberNames?.[index] ?? ''),
      femaleMemberNames: Array.from({ length: femaleCount }, (_, index) => enquiry.femaleMemberNames?.[index] ?? ''),
      maleMemberMobiles: Array.from({ length: maleCount }, (_, index) => enquiry.maleMemberMobiles?.[index] ?? ''),
      femaleMemberMobiles: Array.from({ length: femaleCount }, (_, index) => enquiry.femaleMemberMobiles?.[index] ?? ''),
      attendees: (enquiry.attendees ?? []).map((attendee) => ({
        name: attendee.name ?? '',
        gender: attendee.gender ?? '',
        mobile: attendee.mobile ?? '',
      })),
      ticketType,
      ticketTypeName: pricing?.ticketTypeName ?? enquiry.ticketTypeName ??
        BOOKING_TICKET_TYPES.find(({ id }) => id === ticketType)?.name ?? 'General Admission',
      ticketQuantity,
      pricePerTicket: pricing?.pricePerTicket ?? enquiry.pricePerTicket ?? regularPrice,
      subtotal: pricing?.subtotal ?? enquiry.subtotal ?? regularPrice * ticketQuantity,
      discount: pricing?.discount ?? enquiry.discount ?? 0,
      finalAmount: pricing?.finalAmount ?? enquiry.finalAmount ?? enquiry.paymentAmount ?? regularPrice * ticketQuantity,
      createdAt: enquiry.createdAt,
      status: enquiry.status,
      paymentStatus: normalizeBookingPaymentStatus(enquiry.paymentStatus ?? 'unpaid'),
      paymentAmount: pricing?.finalAmount ?? pricing?.paymentAmount ?? enquiry.paymentAmount ?? DIWALI_REGULAR_PRICE,
      paymentAmountPaise: pricing?.paymentAmountPaise ?? enquiry.paymentAmountPaise ?? DIWALI_REGULAR_PRICE * 100,
      regularPrice,
      offerPrice: pricing?.offerPrice ?? enquiry.offerPrice ?? DIWALI_OFFER_PRICE,
      diwaliOfferApplied: pricing?.diwaliOfferApplied ?? Boolean(enquiry.diwaliOfferApplied),
      offerActivationAt: pricing?.offerActivationAt ?? enquiry.offerActivationAt ?? null,
      offerExpiresAt: pricing?.offerExpiresAt ?? enquiry.offerExpiresAt ?? null,
      paymentProvider: enquiry.paymentProvider ?? '',
      paymentProviderMode,
      paymentReference: enquiry.paymentReference ?? '',
      paymentOrderId: enquiry.paymentOrderId ?? '',
      cfOrderId: enquiry.cfOrderId ?? '',
      cfPaymentId: enquiry.cfPaymentId ?? '',
      cfPaymentSessionId: enquiry.cfPaymentSessionId ?? '',
      cfPaymentStatus: enquiry.cfPaymentStatus ?? '',
      cfPaymentMethod: enquiry.cfPaymentMethod ?? '',
      paidAt: enquiry.paidAt ?? null,
      paymentVerifiedAt: enquiry.paymentVerifiedAt ?? null,
      paymentFailureReason: enquiry.paymentFailureReason ?? '',
      paymentAttemptedAt: enquiry.paymentAttemptedAt ?? null,
      cashfreeConfigured: paymentProviderMode === 'cashfree' && Boolean(cashfreeConfigured),
      upiId,
      upiPayeeName,
      upiPayment: enquiry.upiPayments?.at(-1)
        ? {
            amount: enquiry.upiPayments.at(-1).amount,
            upiId: enquiry.upiPayments.at(-1).upiId,
            utr: enquiry.upiPayments.at(-1).utr,
            paymentMethod: enquiry.upiPayments.at(-1).paymentMethod,
            status: enquiry.upiPayments.at(-1).status,
            submittedAt: enquiry.upiPayments.at(-1).submittedAt,
            adminVerifiedAt: enquiry.upiPayments.at(-1).adminVerifiedAt,
            rejectionReason: enquiry.upiPayments.at(-1).rejectionReason,
          }
        : null,
    }
  }

  function getStoredPricing(enquiry) {
    const ticketQuantity = enquiry.ticketQuantity ?? 1
    const regularPrice = enquiry.regularPrice ?? DIWALI_REGULAR_PRICE
    const finalAmount =
      enquiry.paymentAmount ?? enquiry.finalAmount ?? regularPrice * ticketQuantity
    return {
      regularPrice,
      offerPrice: enquiry.offerPrice ?? DIWALI_OFFER_PRICE,
      diwaliOfferApplied: Boolean(enquiry.diwaliOfferApplied),
      offerActivationAt: enquiry.offerActivationAt ?? null,
      offerExpiresAt: enquiry.offerExpiresAt ?? null,
      ticketType: enquiry.ticketType ?? DEFAULT_TICKET_TYPE,
      ticketTypeName:
        enquiry.ticketTypeName ??
        BOOKING_TICKET_TYPES.find(({ id }) => id === enquiry.ticketType)?.name ??
        'General Admission',
      ticketQuantity,
      pricePerTicket: enquiry.pricePerTicket ?? regularPrice,
      subtotal: enquiry.subtotal ?? regularPrice * ticketQuantity,
      discount: enquiry.discount ?? 0,
      finalAmount,
      paymentAmount: finalAmount,
      paymentAmountPaise:
        enquiry.paymentAmountPaise ?? Math.round(finalAmount * 100),
    }
  }


  async function getCurrentPricing(enquiry) {
    if (
      enquiry &&
      (
        (enquiry.paymentOrderId && enquiry.paymentStatus !== 'failed') ||
        ['paid', 'demo_paid'].includes(normalizeBookingPaymentStatus(enquiry.paymentStatus)) ||
        ['Submitted for Verification', 'Verified'].includes(enquiry.upiPayments?.at(-1)?.status)
      )
    ) {
      return null
    }
    const currentPricing = await diwaliOfferService?.getPricing?.()
    return calculateTicketPricing(
      currentPricing ?? defaultOfferPricing,
      enquiry.ticketQuantity ?? 1,
      enquiry.ticketType ?? DEFAULT_TICKET_TYPE,
      { perTicket: Boolean(enquiry.categoryId) },
    )
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

      const basePricing = await diwaliOfferService?.getPricing?.()
      const pricing = calculateTicketPricing(
        basePricing ?? defaultOfferPricing,
        validation.value.ticketQuantity,
        validation.value.ticketType,
        { perTicket: Boolean(validation.value.categoryId) },
      )
      const result = await repository.save({
        ...validation.value,
        ...(pricing ?? {}),
      })
      const paymentStatus = normalizeBookingPaymentStatus(result.enquiry.paymentStatus)
      response.status(result.duplicate ? 200 : 201).json({
        message: 'Your booking request has been received.',
        duplicate: result.duplicate,
        outcome: result.duplicate ? 'booking_already_exists' : 'booking_created_payment_pending',
        paymentState: isRealPaidBookingStatus(result.enquiry.paymentStatus)
          ? 'payment_success'
          : paymentStatus === 'failed'
            ? 'payment_failed'
            : 'payment_pending',
        booking: serializeEnquiry(
          result.enquiry,
          getStoredPricing(result.enquiry),
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
      let pricing = getStoredPricing(enquiry)
      if (enquiry.paymentStatus === 'failed' && enquiry.paymentProvider !== 'upi') {
        try {
          pricing = await getCurrentPricing(enquiry) ?? pricing
        } catch (error) {
          console.error('Booking retry pricing refresh failed.', {
            name: error?.name ?? 'UnknownError',
            code: error?.code ?? '',
          })
        }
      }
      response.set('Cache-Control', 'no-store')
      response.json({
        booking: serializeEnquiry(enquiry, pricing),
      })
    } catch (error) {
      console.error('Booking enquiry lookup failed.', {
        name: error?.name ?? 'UnknownError',
        code: error?.code ?? '',
      })
      response.status(503).json({
        message: 'Booking details are temporarily unavailable. Please try again.',
      })
    }
  })

  router.post('/:requestId/upi-payment', rateLimit, async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    if (typeof repository.submitUpiPayment !== 'function') {
      response.status(503).json({ message: 'UPI payment submission is not available on this booking server.' })
      return
    }
    if (typeof request.body?.utr !== 'string') {
      response.status(400).json({ message: 'Enter the UPI transaction reference number.' })
      return
    }

    try {
      const enquiry = await repository.findByRequestId(requestId)
      if (!enquiry) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      const pricing = getStoredPricing(enquiry)
      const result = await repository.submitUpiPayment(requestId, {
        utr: request.body.utr,
        upiId,
        pricing,
      })
      response.status(200).json({
        message: 'Payment details submitted for verification.',
        duplicate: Boolean(result.duplicate),
        booking: serializeEnquiry(result.enquiry),
      })
    } catch (error) {
      response.status(error.status ?? 503).json({
        message: error.message || 'UPI payment details could not be submitted. Please try again.',
      })
    }
  })

  router.post('/:requestId/demo-payment', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    if (nodeEnv === 'production' || cashfreeConfigured || paymentProvider !== 'cashfree') {
      response.status(404).json({ message: 'Demo payments are disabled in production or while Cashfree is configured.' })
      return
    }

    try {
      const enquiry = await repository.findByRequestId(requestId)
      if (!enquiry) {
        response.status(404).json({ message: 'Booking enquiry not found or no longer payable.' })
        return
      }
      const pricing = await getCurrentPricing(enquiry)
      const result = await repository.markDemoPaid(requestId, { pricing })
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

  // ==========================================
  // CASHFREE PAYMENT GATEWAY INTEGRATION
  // ==========================================

  router.post('/:requestId/cashfree-order', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    if (paymentProvider !== 'cashfree' || !cashfreeConfigured || typeof cashfreePayments?.createOrder !== 'function') {
      response.status(503).json({ message: 'Cashfree Payments is not configured on the booking server.' })
      return
    }

    try {
      const existingBooking = await repository.findByRequestId(requestId)
      if (
        existingBooking?.paymentOrderId &&
        existingBooking.paymentProvider &&
        existingBooking.paymentProvider !== 'cashfree'
      ) {
        response.status(409).json({
          message: 'This booking has an existing payment order that cannot be used with Cashfree.',
        })
        return
      }
      const { returnUrl, notifyUrl } = request.body || {}
      const result = await cashfreePayments.createOrder(requestId, { returnUrl, notifyUrl })
      if (!result) {
        response.status(409).json({ message: 'This booking session is no longer payable.' })
        return
      }
      if (result.alreadyPaid) {
        response.json({
          alreadyPaid: true,
          booking: serializeEnquiry(result.booking),
        })
        return
      }
      response.json({
        ...result,
        booking: serializeEnquiry(result.booking),
      })
    } catch (error) {
      response.status(error.status ?? 500).json({
        message: error.message || 'Cashfree could not create the payment order.',
      })
    }
  })

  router.post('/:requestId/cashfree-verify', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    const { cf_payment_id, order_id } = request.body || {}

    try {
      const result = await cashfreePayments?.verifyPayment?.(requestId, { cf_payment_id, order_id })
      if (!result) {
        response.status(409).json({ message: 'The payment could not be matched to this booking session.' })
        return
      }
      if (result.pending) {
        response.status(202).json({
          message: 'The payment is still being processed by Cashfree.',
          pending: true,
          paymentState: 'payment_pending',
          booking: serializeEnquiry(result.booking),
        })
        return
      }
      const booking = await getUpdatedEnquiry(requestId, result.booking)
      const paymentState = isRealPaidBookingStatus(booking.paymentStatus)
        ? 'payment_success'
        : result.pending
          ? 'payment_pending'
          : booking.paymentStatus === 'failed'
            ? 'payment_failed'
            : 'payment_pending'
      response.json({
        verified: result.verified,
        duplicate: result.duplicate,
        paymentState,
        booking: serializeEnquiry(booking),
      })
    } catch (error) {
      response.status(error.status ?? 500).json({
        message: error.message || 'Cashfree payment verification failed.',
      })
    }
  })

  router.post('/:requestId/cashfree-status', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    try {
      const result = await cashfreePayments?.checkStatus?.(requestId)
      if (!result) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      const booking = await getUpdatedEnquiry(requestId, result.booking)
      const paymentState = isRealPaidBookingStatus(booking.paymentStatus)
        ? 'payment_success'
        : result.pending
          ? 'payment_pending'
          : booking.paymentStatus === 'failed'
            ? 'payment_failed'
            : 'payment_pending'
      response.set('Cache-Control', 'no-store').json({
        pending: Boolean(result.pending),
        duplicate: Boolean(result.duplicate),
        paymentState,
        booking: serializeEnquiry(booking),
      })
    } catch (error) {
      response.status(error.status ?? 502).json({
        message: error.message || 'Cashfree payment status could not be checked.',
      })
    }
  })

  router.post('/:requestId/cashfree-failure', async (request, response) => {
    const { requestId } = request.params
    const { orderId, outcome = 'failed' } = request.body ?? {}
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'A valid booking is required.' })
      return
    }
    try {
      const result = await cashfreePayments?.recordFailure?.(requestId, { orderId, outcome })
      if (!result?.booking) {
        response.status(404).json({ message: 'Booking enquiry not found.' })
        return
      }
      const booking = await getUpdatedEnquiry(requestId, result.booking)
      const paymentState = isRealPaidBookingStatus(booking.paymentStatus)
        ? 'payment_success'
        : result.pending || booking.paymentStatus !== 'failed'
          ? 'payment_pending'
          : 'payment_failed'
      response.json({
        recorded: true,
        paymentState,
        booking: serializeEnquiry(booking),
      })
    } catch (error) {
      response.status(error.status ?? 500).json({
        message: error.message || 'Cashfree payment failure could not be recorded.',
      })
    }
  })

  router.post('/:requestId/demo-payment-failure', async (request, response) => {
    const { requestId } = request.params
    if (!requestIdPattern.test(requestId)) {
      response.status(400).json({ message: 'The booking request could not be verified.' })
      return
    }
    if (nodeEnv === 'production' || cashfreeConfigured || paymentProvider !== 'cashfree') {
      response.status(404).json({ message: 'Demo payments are disabled in production or while Cashfree is configured.' })
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
