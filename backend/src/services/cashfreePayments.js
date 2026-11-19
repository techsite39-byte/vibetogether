import { createHmac, timingSafeEqual } from 'node:crypto'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { BookingResult } from '../models/bookingResult.js'
import { UnmatchedCashfreePayment } from '../models/unmatchedCashfreePayment.js'
import { nextBookingReference } from './bookingReferences.js'
import {
  DEFAULT_TICKET_TYPE,
  FIXED_BOOKING_AMOUNT,
  calculateTicketPricing,
} from './diwaliOffer.js'
import { persistBookingResult } from './bookingResults.js'
import {
  isCompletedBookingPaymentStatus,
  isRealPaidBookingStatus,
  normalizeBookingPaymentStatus,
} from '../../../src/utils/paymentStatus.js'

const SANDBOX_URL = 'https://sandbox.cashfree.com/pg'
const PRODUCTION_URL = 'https://api.cashfree.com/pg'
const DEFAULT_API_VERSION = '2023-08-01'
const bookingSessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const unmatchedPaymentStatuses = new Set([
  'SUCCESS',
  'FAILED',
  'PENDING',
  'USER_DROPPED',
  'CANCELLED',
  'REFUNDED',
  'REVERSED',
])
const unmatchedEventTypes = new Set([
  'PAYMENT_SUCCESS_WEBHOOK',
  'PAYMENT_FAILED_WEBHOOK',
  'PAYMENT_USER_DROPPED_WEBHOOK',
  'REFUND_STATUS_WEBHOOK',
  'PAYMENT_REVERSED_WEBHOOK',
])

const defaultPricing = {
  paymentAmount: FIXED_BOOKING_AMOUNT,
  paymentAmountPaise: FIXED_BOOKING_AMOUNT * 100,
  regularPrice: FIXED_BOOKING_AMOUNT,
  offerPrice: FIXED_BOOKING_AMOUNT,
  diwaliOfferApplied: false,
  offerActivationAt: null,
  offerExpiresAt: null,
  ticketType: DEFAULT_TICKET_TYPE,
  ticketTypeName: 'General Admission',
  ticketQuantity: 1,
  pricePerTicket: FIXED_BOOKING_AMOUNT,
  subtotal: FIXED_BOOKING_AMOUNT,
  discount: 0,
  finalAmount: FIXED_BOOKING_AMOUNT,
}

function serviceError(status, message) {
  return Object.assign(new Error(message), { status })
}

function removeBookingExpiry(enquiry) {
  if (typeof enquiry.set === 'function') {
    enquiry.set('expiresAt', undefined)
  } else {
    delete enquiry.expiresAt
  }
}

async function preserveCompletedBooking(enquiry) {
  const normalizedStatus = normalizeBookingPaymentStatus(enquiry.paymentStatus)
  const statusChanged = normalizedStatus !== enquiry.paymentStatus
  const hadExpiry = enquiry.expiresAt !== undefined

  if (statusChanged) enquiry.paymentStatus = normalizedStatus
  if (hadExpiry) removeBookingExpiry(enquiry)
  if (statusChanged || hadExpiry) await enquiry.save()
}

async function preserveActiveCashfreeBooking(enquiry) {
  if (!(enquiry.expiresAt instanceof Date)) return
  removeBookingExpiry(enquiry)
  await enquiry.save()
}

function restoreTemporaryBookingExpiry(enquiry) {
  if (enquiry.expiresAt instanceof Date) return false
  const createdAt = new Date(enquiry.createdAt)
  if (!Number.isFinite(createdAt.getTime())) {
    throw serviceError(500, 'Booking creation time is unavailable; payment expiry could not be restored.')
  }
  enquiry.expiresAt = new Date(createdAt.getTime() + bookingSessionLifetimeMs)
  return true
}

/**
 * Validates Cashfree webhook signature using HMAC-SHA256 with timestamp + rawBody.
 * Cashfree specifies: signature = Base64(HMAC-SHA256(timestamp + rawBody, secretKey))
 */
export function isValidCashfreeWebhookSignature(rawBody, signature, timestamp, secretKey) {
  if (
    (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') ||
    rawBody.length === 0 ||
    typeof signature !== 'string' ||
    typeof timestamp !== 'string' ||
    !secretKey
  ) {
    return false
  }

  if (!/^\d{10}(?:\d{3})?$/.test(timestamp)) {
    return false
  }

  const timestampNum = Number(timestamp)
  const eventTimeMs = timestamp.length === 13 ? timestampNum : timestampNum * 1000
  if (Math.abs(Date.now() - eventTimeMs) > 10 * 60 * 1000) {
    console.warn('[Cashfree Webhook] Webhook rejected: timestamp expired.')
    return false
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) {
    return false
  }

  const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')
  const payloadToSign = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBuffer])

  try {
    const expectedSignature = createHmac('sha256', secretKey)
      .update(payloadToSign)
      .digest('base64')

    const actualBuffer = Buffer.from(signature, 'base64')
    const expectedBuffer = Buffer.from(expectedSignature, 'base64')

    return (
      actualBuffer.toString('base64') === signature &&
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    )
  } catch {
    console.error('[Cashfree Webhook] Signature verification failed.', {
      reason: 'signature_validation_error',
    })
    return false
  }
}

/**
 * Resolves and validates the Cashfree return URL.
 * Cashfree strictly requires return_url to use HTTPS.
 * Localhost HTTP URLs are rejected and dynamically replaced with a valid HTTPS URL using FRONTEND_URL.
 */
export function resolveCashfreeReturnUrl({
  requestedUrl = '',
  frontendUrl = process.env.FRONTEND_URL || 'https://www.vibetogether.show',
  requestId = '',
} = {}) {
  const cleanId = encodeURIComponent(requestId)
  const defaultBase = (frontendUrl || 'https://www.vibetogether.show').trim().replace(/\/+$/, '')
  const safeBase = defaultBase.startsWith('https://') ? defaultBase : 'https://www.vibetogether.show'
  const defaultReturnUrl = `${safeBase}/booking/payment/${cleanId}?order_id={order_id}`

  if (!requestedUrl || typeof requestedUrl !== 'string') {
    return defaultReturnUrl
  }

  const trimmed = requestedUrl.trim()

  // Strictly reject localhost, 127.0.0.1, or plain http URLs
  if (
    trimmed.startsWith('http://') ||
    trimmed.includes('localhost') ||
    trimmed.includes('127.0.0.1')
  ) {
    return defaultReturnUrl
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') {
      return defaultReturnUrl
    }
    // Ensure {order_id} placeholder is present
    if (!trimmed.includes('{order_id}')) {
      const separator = trimmed.includes('?') ? '&' : '?'
      return `${trimmed}${separator}order_id={order_id}`
    }
    return trimmed
  } catch {
    return defaultReturnUrl
  }
}

export function createCashfreePaymentService({
  appId = '',
  secretKey = '',
  environment = 'SANDBOX',
  apiVersion = DEFAULT_API_VERSION,
  frontendUrl = process.env.FRONTEND_URL || 'https://www.vibetogether.show',
  bookingEnquiryModel = BookingEnquiry,
  bookingResultModel = BookingResult,
  unmatchedPaymentModel = UnmatchedCashfreePayment,
  allocateReference = nextBookingReference,
  diwaliOfferService,
  fetchFn = fetch,
} = {}) {
  const isProduction = String(environment).toUpperCase() === 'PRODUCTION'
  const baseUrl = isProduction ? PRODUCTION_URL : SANDBOX_URL
  const configured = Boolean(appId && secretKey)

  function getHeaders() {
    return {
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': apiVersion,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  async function verifyUnmatchedPayment({
    providerOrderId,
    providerPaymentId,
    expectedAmount,
    currency,
  } = {}) {
    if (!configured) {
      throw serviceError(503, 'Cashfree payment verification is not configured.')
    }

    const orderId = String(providerOrderId ?? '')
    const paymentId = String(providerPaymentId ?? '')
    if (!orderId || !paymentId) {
      return { verified: false, reasonCode: 'provider_identifiers_missing' }
    }

    let paymentsResponse
    try {
      paymentsResponse = await fetchFn(
        `${baseUrl}/orders/${encodeURIComponent(orderId)}/payments`,
        { method: 'GET', headers: getHeaders() },
      )
    } catch {
      throw serviceError(503, 'Cashfree payment verification is temporarily unavailable.')
    }
    if (!paymentsResponse.ok) {
      throw serviceError(503, 'Cashfree payment verification is temporarily unavailable.')
    }

    let payments
    try {
      payments = await paymentsResponse.json()
    } catch {
      throw serviceError(502, 'Cashfree returned an invalid payment verification response.')
    }
    if (!Array.isArray(payments)) {
      throw serviceError(502, 'Cashfree returned an invalid payment verification response.')
    }

    const matches = payments.filter(
      (payment) => String(payment?.cf_payment_id ?? '') === paymentId,
    )
    if (matches.length !== 1) {
      return {
        verified: false,
        reasonCode: matches.length ? 'provider_payment_ambiguous' : 'provider_payment_not_found',
      }
    }

    const payment = matches[0]
    if (String(payment.order_id ?? '') !== orderId) {
      return { verified: false, reasonCode: 'provider_order_mismatch' }
    }
    if (payment.payment_status !== 'SUCCESS') {
      return { verified: false, reasonCode: 'provider_payment_not_successful' }
    }
    if (
      Number(payment.payment_amount).toFixed(2) !== Number(expectedAmount).toFixed(2) ||
      String(payment.payment_currency ?? '').toUpperCase() !== String(currency ?? '').toUpperCase() ||
      String(currency ?? '').toUpperCase() !== 'INR'
    ) {
      return { verified: false, reasonCode: 'provider_amount_or_currency_mismatch' }
    }

    const reversalFields = [
      payment.is_reversed,
      payment.payment_reversed,
      payment.reversed,
    ]
    const reversalStatus = String(
      payment.payment_reversal_status ?? payment.reversal_status ?? '',
    ).toUpperCase()
    if (
      reversalFields.some((value) => value === true) ||
      (reversalStatus && !['NONE', 'NOT_REVERSED', ''].includes(reversalStatus))
    ) {
      return { verified: false, reasonCode: 'provider_payment_reversed' }
    }

    let refundsResponse
    try {
      refundsResponse = await fetchFn(
        `${baseUrl}/orders/${encodeURIComponent(orderId)}/refunds`,
        { method: 'GET', headers: getHeaders() },
      )
    } catch {
      throw serviceError(503, 'Cashfree refund verification is temporarily unavailable.')
    }
    if (!refundsResponse.ok) {
      throw serviceError(503, 'Cashfree refund verification is temporarily unavailable.')
    }

    let refunds
    try {
      refunds = await refundsResponse.json()
    } catch {
      throw serviceError(502, 'Cashfree returned an invalid refund verification response.')
    }
    const refundList = Array.isArray(refunds)
      ? refunds
      : Array.isArray(refunds?.data)
        ? refunds.data
        : Array.isArray(refunds?.refunds)
          ? refunds.refunds
        : null
    if (!refundList) {
      throw serviceError(502, 'Cashfree returned an invalid refund verification response.')
    }
    const hasRefundForPayment = refundList.some((refund) => {
      const refundPaymentId = String(
        refund?.cf_payment_id ?? refund?.payment_id ?? '',
      )
      return !refundPaymentId || refundPaymentId === paymentId
    })
    if (hasRefundForPayment) {
      return { verified: false, reasonCode: 'provider_payment_refunded' }
    }

    const refundStatus = String(payment.refund_status ?? '').toUpperCase()
    if (refundStatus && !['NONE', 'NOT_REFUNDED'].includes(refundStatus)) {
      return { verified: false, reasonCode: 'provider_payment_refunded' }
    }

    return {
      verified: true,
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      amount: Number(payment.payment_amount),
      currency: String(payment.payment_currency).toUpperCase(),
      providerStatus: payment.payment_status,
    }
  }

  async function persistUnmatchedPayment({
    orderId,
    paymentId,
    paymentData = {},
    eventType = 'UNKNOWN',
    eventTime,
  }) {
    if (!unmatchedPaymentModel) {
      throw serviceError(503, 'Unmatched payment storage is unavailable.')
    }

    const now = new Date()
    const parsedEventTime = eventTime ? new Date(eventTime) : null
    const normalizedPaymentStatus = String(paymentData.payment_status ?? '').toUpperCase()
    const normalizedEventType = String(eventType ?? '').toUpperCase()
    const normalizedCurrency = String(paymentData.payment_currency ?? '').toUpperCase()
    const input = {
      providerOrderId: String(orderId),
      providerPaymentId: String(paymentId),
      amount: Number.isFinite(Number(paymentData.payment_amount))
        ? Number(paymentData.payment_amount)
        : 0,
      currency: /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : 'UNK',
      providerStatus: unmatchedPaymentStatuses.has(normalizedPaymentStatus)
        ? normalizedPaymentStatus
        : 'UNKNOWN',
      providerEventType: unmatchedEventTypes.has(normalizedEventType)
        ? normalizedEventType
        : 'UNKNOWN',
      eventTime: parsedEventTime && Number.isFinite(parsedEventTime.getTime())
        ? parsedEventTime
        : null,
      receivedAt: now,
      lastSeenAt: now,
      processingStatus: 'unmatched',
    }

    const findExisting = async () => {
      const query = unmatchedPaymentModel.findOne({
        providerPaymentId: input.providerPaymentId,
      })
      return typeof query?.lean === 'function' ? query.lean() : query
    }
    const updateExisting = async (existing) => {
      const mismatch =
        String(existing.providerOrderId) !== input.providerOrderId ||
        Number(existing.amount) !== input.amount ||
        String(existing.currency).toUpperCase() !== input.currency
      const fields = { lastSeenAt: now }
      if (mismatch) {
        fields.processingStatus = 'review_required'
        fields.reconciliationOutcome = existing.processingStatus === 'reconciled'
          ? 'duplicate_metadata_mismatch_after_reconciliation'
          : 'duplicate_metadata_mismatch'
      } else if (!mismatch) {
        fields.providerStatus = input.providerStatus
        fields.providerEventType = input.providerEventType
        fields.eventTime = input.eventTime
      }
      const updateResult = await unmatchedPaymentModel.updateOne(
        { _id: existing._id },
        { $set: fields },
      )
      if (
        !updateResult ||
        updateResult.acknowledged === false ||
        updateResult.matchedCount === 0 ||
        updateResult.n === 0
      ) {
        throw serviceError(503, 'Unmatched payment storage is temporarily unavailable.')
      }
      return { duplicate: true, conflict: mismatch }
    }

    const existing = await findExisting()
    if (existing) return updateExisting(existing)

    try {
      await unmatchedPaymentModel.create(input)
      return { duplicate: false, conflict: false }
    } catch (error) {
      if (error?.code !== 11000) throw error
      const racedRecord = await findExisting()
      if (!racedRecord) throw error
      return updateExisting(racedRecord)
    }
  }

  async function recordUnmatchedWebhook({
    orderId,
    paymentData,
    eventType,
    eventTime,
    reason,
  }) {
    const paymentId = String(paymentData?.cf_payment_id ?? '')
    if (!orderId || !paymentId) {
      throw serviceError(
        503,
        'Cashfree successful payment is missing a stable order or payment identifier.',
      )
    }

    const unmatched = await persistUnmatchedPayment({
      orderId,
      paymentId,
      paymentData: paymentData ?? {},
      eventType,
      eventTime,
    })
    console.warn('[Cashfree Webhook] Unmatched payment recorded.', {
      outcome: unmatched.conflict ? 'review_required' : 'recorded',
      duplicate: unmatched.duplicate,
    })
    return {
      received: true,
      ignored: true,
      reason,
      unmatchedRecorded: true,
      reviewRequired: unmatched.conflict,
      duplicate: unmatched.duplicate,
    }
  }

  async function getPricing(enquiry) {
    const basePricing = diwaliOfferService?.getPricing
      ? await diwaliOfferService.getPricing()
      : { ...defaultPricing }
    return calculateTicketPricing(
      basePricing,
      enquiry?.ticketQuantity ?? 1,
      enquiry?.ticketType ?? DEFAULT_TICKET_TYPE,
      { perTicket: Boolean(enquiry?.categoryId) },
    )
  }

  async function persistPaymentResult(enquiry, paymentStatus, payment = {}) {
    return persistBookingResult(
      enquiry,
      {
        paymentStatus,
        paymentProvider: 'cashfree',
        providerPaymentId: String(payment.cf_payment_id ?? enquiry.cfPaymentId ?? ''),
        providerOrderId: String(payment.order_id ?? enquiry.paymentOrderId ?? enquiry.cfOrderId ?? ''),
        currency: payment.payment_currency || 'INR',
        failureReason: payment.payment_message || enquiry.paymentFailureReason || '',
        failureCode: payment.payment_code || payment.error_code || '',
      },
      { bookingResultModel },
    )
  }

  function getOrderPricing(enquiry, orderEntry) {
    const amount = Number(orderEntry?.amount ?? enquiry.paymentAmount ?? FIXED_BOOKING_AMOUNT)
    return {
      paymentAmount: amount,
      paymentAmountPaise: Number(
        orderEntry?.amountPaise ??
        enquiry.paymentOrderAmountPaise ??
        enquiry.paymentAmountPaise ??
        amount * 100,
      ),
      regularPrice: orderEntry?.regularPrice ?? enquiry.regularPrice ?? amount,
      offerPrice: orderEntry?.offerPrice ?? enquiry.offerPrice ?? amount,
      diwaliOfferApplied: Boolean(
        orderEntry?.diwaliOfferApplied ?? enquiry.diwaliOfferApplied,
      ),
      offerActivationAt: orderEntry?.offerActivationAt ?? enquiry.offerActivationAt ?? null,
      offerExpiresAt: orderEntry?.offerExpiresAt ?? enquiry.offerExpiresAt ?? null,
      ticketType: orderEntry?.ticketType ?? enquiry.ticketType ?? DEFAULT_TICKET_TYPE,
      ticketTypeName: orderEntry?.ticketTypeName ?? enquiry.ticketTypeName ?? 'General Admission',
      ticketQuantity: orderEntry?.ticketQuantity ?? enquiry.ticketQuantity ?? 1,
      pricePerTicket: orderEntry?.pricePerTicket ?? enquiry.pricePerTicket ?? amount,
      subtotal: orderEntry?.subtotal ?? enquiry.subtotal ?? amount,
      discount: orderEntry?.discount ?? enquiry.discount ?? 0,
      finalAmount: orderEntry?.finalAmount ?? enquiry.finalAmount ?? amount,
    }
  }

  function getCleanPhone(mobile) {
    if (!mobile) return '9999999999'
    const digits = mobile.replace(/\D/g, '')
    return digits.length >= 10 ? digits.slice(-10) : '9999999999'
  }

  /**
   * Creates a Cashfree PG order and returns payment_session_id for Cashfree checkout.
   */
  async function createOrder(requestId, { returnUrl = '', notifyUrl = '' } = {}) {
    if (!configured) {
      throw serviceError(503, 'Cashfree Payments is not configured on the booking server.')
    }

    const enquiry = await bookingEnquiryModel.findOne({ requestId })
    if (!enquiry) {
      throw serviceError(404, 'Booking enquiry not found.')
    }
    if (isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
      await preserveCompletedBooking(enquiry)
      if (isRealPaidBookingStatus(enquiry.paymentStatus) && !enquiry.reference) {
        throw serviceError(409, 'This booking is marked as paid but is missing its reference. Please contact support.')
      }
      return {
        alreadyPaid: true,
        demoPayment: enquiry.paymentStatus === 'demo_paid',
        reference: enquiry.reference ?? '',
        booking: enquiry,
      }
    }
    if (
      enquiry.paymentOrderId &&
      ['unpaid', 'processing'].includes(enquiry.paymentStatus)
    ) {
      const orderEntry = enquiry.paymentOrders?.find(
        (order) => String(order.orderId) === String(enquiry.paymentOrderId),
      )
      if (orderEntry?.status !== 'failed') {
        await preserveActiveCashfreeBooking(enquiry)
        if (!enquiry.cfPaymentSessionId) {
          throw serviceError(409, 'An existing Cashfree order is being processed. Refresh its payment status before retrying.')
        }
        const pricing = getOrderPricing(enquiry, orderEntry)
        return {
          order_id: enquiry.paymentOrderId,
          cf_order_id: enquiry.cfOrderId ?? '',
          payment_session_id: enquiry.cfPaymentSessionId,
          amount: pricing.paymentAmount,
          currency: 'INR',
          environment: isProduction ? 'production' : 'sandbox',
          pricing,
          booking: enquiry,
        }
      }
    }

    const pricing = await getPricing(enquiry)
    const amount = Number(pricing.finalAmount.toFixed(2))

    // Cashfree order_id max 50 chars (alphanumeric, _ and -)
    const cleanId = requestId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
    const orderId = `VT_${cleanId}_${Date.now().toString(36)}`

    const customerPhone = getCleanPhone(enquiry.mobile)
    const customerEmail = enquiry.email?.trim() || `guest_${cleanId}@vibetogether.show`
    const customerName = enquiry.name?.trim() || 'Attendee'

    const resolvedReturnUrl = resolveCashfreeReturnUrl({
      requestedUrl: returnUrl,
      frontendUrl,
      requestId,
    })

    const orderPayload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${cleanId}`,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: resolvedReturnUrl,
        notify_url: notifyUrl || undefined,
      },
      order_note: `Vibe Together - ${enquiry.event || 'Experience Reservation'}`,
    }

    const previousExpiry = enquiry.expiresAt instanceof Date
      ? new Date(enquiry.expiresAt)
      : null
    await preserveActiveCashfreeBooking(enquiry)

    let response
    try {
      response = await fetchFn(`${baseUrl}/orders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(orderPayload),
      })
    } catch {
      console.error('[Cashfree] Order creation network error.', {
        reason: 'provider_request_failed',
      })
      throw serviceError(502, 'Could not reach Cashfree payment service. Please try again.')
    }

    const data = await response.json()
    if (!response.ok) {
      if (previousExpiry) {
        enquiry.expiresAt = previousExpiry
        await enquiry.save()
      }
      const msg = data.message || 'Cashfree could not initiate the payment order.'
      const providerErrorCode = Number(data.code ?? data.error_code)
      console.error('[Cashfree] Order creation failed.', {
        httpStatus: response.status,
        providerErrorCode: Number.isSafeInteger(providerErrorCode) ? providerErrorCode : null,
        reason: 'provider_rejected_order',
      })
      throw serviceError(response.status >= 400 && response.status < 500 ? 400 : 502, msg)
    }
    if (!data.payment_session_id) {
      throw serviceError(502, 'Cashfree could not initiate the payment order.')
    }
    if (
      String(data.order_id ?? '') !== orderId ||
      Number(data.order_amount) !== amount ||
      data.order_currency !== 'INR'
    ) {
      throw serviceError(502, 'Cashfree returned an order with an unexpected ID, amount, or currency.')
    }

    // Update enquiry with Cashfree order details
    enquiry.cfOrderId = String(data.cf_order_id ?? '')
    enquiry.cfPaymentSessionId = data.payment_session_id
    enquiry.paymentOrderId = data.order_id
    enquiry.paymentProvider = 'cashfree'
    enquiry.paymentAmount = amount
    enquiry.paymentAmountPaise = Math.round(amount * 100)
    enquiry.paymentOrderAmountPaise = Math.round(amount * 100)
    enquiry.paymentOrderCreatedAt = new Date()

    enquiry.paymentOrders = enquiry.paymentOrders || []
    enquiry.paymentOrders.push({
      orderId: data.order_id,
      amount,
      amountPaise: Math.round(amount * 100),
      ticketType: pricing.ticketType,
      ticketTypeName: pricing.ticketTypeName,
      ticketQuantity: pricing.ticketQuantity,
      pricePerTicket: pricing.pricePerTicket,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      finalAmount: pricing.finalAmount,
      regularPrice: pricing.regularPrice,
      offerPrice: pricing.offerPrice,
      diwaliOfferApplied: pricing.diwaliOfferApplied,
      offerActivationAt: pricing.offerActivationAt,
      offerExpiresAt: pricing.offerExpiresAt,
      status: 'created',
      createdAt: new Date(),
    })

    await enquiry.save()

    return {
      order_id: data.order_id,
      cf_order_id: data.cf_order_id,
      payment_session_id: data.payment_session_id,
      amount,
      currency: data.order_currency || 'INR',
      environment: isProduction ? 'production' : 'sandbox',
      pricing,
      booking: enquiry,
    }
  }

  /**
   * Verifies Cashfree payment for a booking enquiry by querying Cashfree order payments.
   */
  async function verifyPayment(requestId, { cf_payment_id = '', order_id = '' } = {}) {
    if (!configured) {
      throw serviceError(503, 'Cashfree Payments is not configured on the booking server.')
    }

    const enquiry = await bookingEnquiryModel.findOne({ requestId })
    if (!enquiry) {
      throw serviceError(404, 'Booking enquiry not found.')
    }

    const orderIdToVerify = order_id || enquiry.paymentOrderId
    if (!orderIdToVerify && isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
      await preserveCompletedBooking(enquiry)
      return {
        verified: isRealPaidBookingStatus(enquiry.paymentStatus),
        duplicate: true,
        demoPayment: enquiry.paymentStatus === 'demo_paid',
        booking: enquiry,
      }
    }
    if (!orderIdToVerify) {
      throw serviceError(400, 'No active Cashfree order found for this booking enquiry.')
    }
    const orderIdString = String(orderIdToVerify)
    const matchesCurrentOrder = String(enquiry.paymentOrderId ?? '') === orderIdString
    const orderEntry = enquiry.paymentOrders?.find(
      (order) => String(order.orderId) === orderIdString,
    )
    if (!matchesCurrentOrder && !orderEntry) {
      throw serviceError(400, 'Cashfree order does not match this booking enquiry.')
    }

    // An idempotent success is only valid for a payment already bound to this booking.
    if (isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
      await preserveCompletedBooking(enquiry)
      if (enquiry.paymentStatus === 'demo_paid') {
        return { verified: false, duplicate: true, demoPayment: true, booking: enquiry }
      }
      if (!enquiry.reference) {
        throw serviceError(409, 'This booking is marked as paid but is missing its reference. Please contact support.')
      }
      if (
        String(enquiry.paymentOrderId ?? '') !== orderIdString ||
        !enquiry.cfPaymentId ||
        (cf_payment_id && String(enquiry.cfPaymentId) !== String(cf_payment_id))
      ) {
        throw serviceError(400, 'Cashfree payment does not match this booking order.')
      }
      removeBookingExpiry(enquiry)
      await enquiry.save()
      await persistPaymentResult(enquiry, 'SUCCESS', {
        cf_payment_id: enquiry.cfPaymentId,
        order_id: orderIdString,
      })
      return {
        verified: true,
        duplicate: true,
        booking: enquiry,
      }
    }

    if (
      ['unpaid', 'processing'].includes(enquiry.paymentStatus) &&
      orderEntry?.status !== 'failed'
    ) {
      await preserveActiveCashfreeBooking(enquiry)
    }

    // 1. Fetch payments for this order
    let paymentsResponse
    try {
      paymentsResponse = await fetchFn(`${baseUrl}/orders/${encodeURIComponent(orderIdToVerify)}/payments`, {
        method: 'GET',
        headers: getHeaders(),
      })
    } catch {
      console.error('[Cashfree] Verify payment network error.', {
        reason: 'provider_request_failed',
      })
      throw serviceError(502, 'Could not verify payment status with Cashfree.')
    }

    let payments = []
    if (paymentsResponse.ok) {
      payments = await paymentsResponse.json()
    }

    // 2. Fetch order status directly as well
    let orderDetails = null
    try {
      const orderRes = await fetchFn(`${baseUrl}/orders/${encodeURIComponent(orderIdToVerify)}`, {
        method: 'GET',
        headers: getHeaders(),
      })
      if (orderRes.ok) {
        orderDetails = await orderRes.json()
      }
    } catch {
      // orderDetails is auxiliary
    }

    // Look for successful payment
    const successfulPayments = Array.isArray(payments)
      ? payments.filter(
          (payment) =>
            payment.payment_status === 'SUCCESS' &&
            String(payment.order_id ?? '') === orderIdString &&
            (!cf_payment_id || String(payment.cf_payment_id) === String(cf_payment_id)),
        )
      : []
    const successfulPayment = successfulPayments.length === 1
      ? successfulPayments[0]
      : null
    const expectedAmount = Number(
      orderEntry?.amount ?? (matchesCurrentOrder ? enquiry.paymentAmount : Number.NaN),
    )
    const paidAmount = Number(successfulPayment?.payment_amount)
    const successfulPaymentMatches =
      Boolean(successfulPayment?.cf_payment_id) &&
      Number.isFinite(expectedAmount) &&
      Number.isFinite(paidAmount) &&
      Math.round(paidAmount * 100) === Math.round(expectedAmount * 100) &&
      successfulPayment.payment_currency === 'INR'

    if (successfulPaymentMatches) {
      const paymentRecord = successfulPayment

      // Confirm booking idempotently
      if (!enquiry.reference) {
        enquiry.reference = await allocateReference()
      }
      enquiry.paymentStatus = 'paid'
      enquiry.status = 'confirmed'
      enquiry.cfPaymentId = String(paymentRecord.cf_payment_id || cf_payment_id || '')
      enquiry.cfPaymentStatus = 'SUCCESS'
      enquiry.cfPaymentMethod =
        typeof paymentRecord.payment_group === 'string'
          ? paymentRecord.payment_group
          : typeof paymentRecord.payment_method === 'object'
            ? Object.keys(paymentRecord.payment_method)[0] || 'online'
            : 'online'
      enquiry.paidAt = enquiry.paidAt || new Date()
      enquiry.paymentVerifiedAt = new Date()
      enquiry.paymentFailureReason = ''

      // Mark payment order paid
      if (orderEntry) {
        orderEntry.status = 'paid'
        orderEntry.paymentId = enquiry.cfPaymentId
      }

      removeBookingExpiry(enquiry)
      await enquiry.save()
      await persistPaymentResult(enquiry, 'SUCCESS', {
        ...paymentRecord,
        order_id: orderIdString,
      })

      return {
        verified: true,
        duplicate: false,
        booking: enquiry,
      }
    }

    // Check for pending attempt
    const pendingPayment = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === 'PENDING')
      : null

    if (pendingPayment || orderDetails?.order_status === 'ACTIVE') {
      return {
        verified: false,
        pending: true,
        booking: enquiry,
      }
    }

    // Payment failed or dropped
    const failedPayment = Array.isArray(payments)
      ? payments.find((p) => ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(p.payment_status))
      : null

    if (failedPayment) {
      enquiry.paymentStatus = 'failed'
      enquiry.paymentFailureReason =
        ['USER_DROPPED', 'CANCELLED'].includes(failedPayment.payment_status)
          ? 'cancelled'
          : 'failed'
      enquiry.cfPaymentStatus = failedPayment.payment_status
      restoreTemporaryBookingExpiry(enquiry)
      await enquiry.save()
      if (failedPayment.payment_status === 'FAILED') {
        await persistPaymentResult(enquiry, 'FAILED', {
          ...failedPayment,
          order_id: orderIdString,
        })
      }
    }

    return {
      verified: false,
      failed: Boolean(failedPayment),
      booking: enquiry,
    }
  }

  /**
   * Checks payment status for an enquiry.
   */
  async function checkStatus(requestId) {
    const enquiry = await bookingEnquiryModel.findOne({ requestId })
    if (!enquiry) {
      return null
    }

    if (isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
      await preserveCompletedBooking(enquiry)
      return {
        pending: false,
        duplicate: true,
        demoPayment: enquiry.paymentStatus === 'demo_paid',
        booking: enquiry,
      }
    }

    if (!enquiry.paymentOrderId) {
      return {
        pending: false,
        booking: enquiry,
      }
    }

    const verification = await verifyPayment(requestId, { order_id: enquiry.paymentOrderId })
    return {
      pending: Boolean(verification.pending),
      duplicate: Boolean(verification.duplicate),
      booking: verification.booking,
    }
  }

  /**
   * Records payment failure or user cancellation.
   */
  async function recordFailure(requestId, { orderId = '', outcome = 'failed' } = {}) {
    const enquiry = await bookingEnquiryModel.findOne({ requestId })
    if (!enquiry) {
      throw serviceError(404, 'Booking enquiry not found.')
    }

    if (isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
      await preserveCompletedBooking(enquiry)
      return { booking: enquiry }
    }

    let verification
    if (orderId || enquiry.paymentOrderId) {
      verification = await verifyPayment(requestId, {
        order_id: orderId || enquiry.paymentOrderId,
      })
      if (verification.failed && verification.booking?.cfPaymentStatus === 'FAILED') {
        return { booking: verification.booking, failed: true }
      }
    }
    if (outcome !== 'cancelled') {
      return {
        booking: verification?.booking ?? enquiry,
        pending: true,
      }
    }

    enquiry.paymentStatus = 'failed'
    enquiry.paymentFailureReason = 'cancelled'
    enquiry.cfPaymentStatus = 'USER_DROPPED'

    const orderEntry = enquiry.paymentOrders?.find((o) => o.orderId === orderId)
    if (orderEntry && orderEntry.status === 'created') {
      orderEntry.status = 'failed'
    }

    restoreTemporaryBookingExpiry(enquiry)
    await enquiry.save()
    return { booking: enquiry }
  }

  /**
   * Handles incoming Cashfree webhook events.
   */
  async function handleWebhook(payload, signature, timestamp, rawBody) {
    if (!secretKey) {
      throw serviceError(503, 'Cashfree webhook secret is not configured.')
    }

    if (!isValidCashfreeWebhookSignature(rawBody, signature, timestamp, secretKey)) {
      throw serviceError(401, 'Cashfree webhook signature is invalid.')
    }

    const eventType = payload?.type
    const orderData = payload?.data?.order
    const paymentData = payload?.data?.payment
    const isSuccessfulPayment =
      eventType === 'PAYMENT_SUCCESS_WEBHOOK' &&
      paymentData?.payment_status === 'SUCCESS'

    const orderId = orderData?.order_id || paymentData?.order_id
    if (!orderId) {
      if (isSuccessfulPayment) {
        throw serviceError(
          503,
          'Cashfree successful payment is missing a stable order identifier.',
        )
      }
      return { received: true, ignored: true, reason: 'missing_order_id' }
    }

    const orderIdString = String(orderId)
    const orderLookup = [
      { paymentOrderId: orderIdString },
      { 'paymentOrders.orderId': orderIdString },
    ]
    const cfOrderId = String(orderData?.cf_order_id ?? '').trim()
    if (cfOrderId) {
      orderLookup.push({ cfOrderId })
    }

    const enquiry = await bookingEnquiryModel.findOne({
      $or: orderLookup,
    })

    if (!enquiry) {
      const paymentId = String(paymentData?.cf_payment_id ?? '')
      if (!paymentId) {
        console.warn('[Cashfree Webhook] Unmatched event has no payment identifier.')
        if (isSuccessfulPayment) {
          throw serviceError(
            503,
            'Cashfree successful payment is missing a stable payment identifier.',
          )
        }
        return { received: true, ignored: true, reason: 'payment_identifier_missing' }
      }
      return recordUnmatchedWebhook({
        orderId: String(paymentData?.order_id ?? orderIdString),
        paymentData,
        eventType,
        eventTime: paymentData?.payment_time ?? payload?.event_time,
        reason: 'order_not_found',
      })
    }

    const paymentId = String(paymentData?.cf_payment_id ?? '')
    const paymentStatus = paymentData?.payment_status
    const orderEntry = enquiry.paymentOrders?.find((order) => order.orderId === orderIdString)
    if (
      ['unpaid', 'processing'].includes(enquiry.paymentStatus) &&
      orderEntry?.status !== 'failed'
    ) {
      await preserveActiveCashfreeBooking(enquiry)
    }
    const isCancelledPayment =
      eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' ||
      ['USER_DROPPED', 'CANCELLED'].includes(paymentStatus)
    const isTerminalFailure = paymentStatus === 'FAILED' && !isCancelledPayment
    if (isSuccessfulPayment) {
      if (!paymentId) {
        throw serviceError(
          503,
          'Cashfree successful payment is missing a stable payment identifier.',
        )
      }
      const receivedAmount = Number(paymentData?.payment_amount)
      const expectedAmount = Number(
        orderEntry?.amount ??
          (String(enquiry.paymentOrderId ?? '') === orderIdString
            ? enquiry.paymentAmount
            : Number.NaN),
      )
      const amountMatches =
        Number.isFinite(receivedAmount) &&
        Number.isFinite(expectedAmount) &&
        Math.round(receivedAmount * 100) === Math.round(expectedAmount * 100)
      const currencyMatches =
        paymentData?.payment_currency === 'INR' &&
        orderData?.order_currency === 'INR'
      const providerOrderMatches =
        !paymentData?.order_id ||
        String(paymentData.order_id) === orderIdString
      if (!amountMatches || !currencyMatches || !providerOrderMatches) {
        return recordUnmatchedWebhook({
          orderId: String(paymentData?.order_id ?? orderIdString),
          paymentData,
          eventType,
          eventTime: paymentData?.payment_time ?? payload?.event_time,
          reason: 'payment_confirmation_mismatch',
        })
      }

      if (isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
        if (
          isRealPaidBookingStatus(enquiry.paymentStatus) &&
          enquiry.reference &&
          enquiry.paymentProvider === 'cashfree' &&
          String(enquiry.paymentOrderId ?? '') === orderIdString &&
          String(enquiry.cfPaymentId ?? '') === paymentId
        ) {
          await preserveCompletedBooking(enquiry)
          await persistPaymentResult(enquiry, 'SUCCESS', {
            cf_payment_id: enquiry.cfPaymentId,
            order_id: orderIdString,
            payment_currency: paymentData?.payment_currency || 'INR',
          })
          return { received: true, duplicate: true, booking: enquiry, action: 'duplicate' }
        }
        return recordUnmatchedWebhook({
          orderId: String(paymentData?.order_id ?? orderIdString),
          paymentData,
          eventType,
          eventTime: paymentData?.payment_time ?? payload?.event_time,
          reason: 'booking_payment_conflict',
        })
      }

      // Confirm booking idempotently
      if (!enquiry.reference) {
        enquiry.reference = await allocateReference()
      }
      enquiry.paymentStatus = 'paid'
      enquiry.status = 'confirmed'
      enquiry.paymentProvider = 'cashfree'
      enquiry.paymentOrderId = orderIdString
      enquiry.paymentAmount = receivedAmount
      enquiry.paymentAmountPaise = Math.round(receivedAmount * 100)
      enquiry.paymentOrderAmountPaise = Math.round(expectedAmount * 100)
      enquiry.cfPaymentId = String(paymentData?.cf_payment_id ?? '')
      enquiry.cfPaymentStatus = 'SUCCESS'
      enquiry.cfPaymentMethod =
        typeof paymentData?.payment_group === 'string'
          ? paymentData.payment_group
          : 'online'
      enquiry.paidAt = enquiry.paidAt || new Date()
      enquiry.paymentVerifiedAt = new Date()
      enquiry.paymentFailureReason = ''

      if (orderEntry) {
        orderEntry.status = 'paid'
        orderEntry.paymentId = enquiry.cfPaymentId
      }

      removeBookingExpiry(enquiry)
      await enquiry.save()
      await persistPaymentResult(enquiry, 'SUCCESS', {
        ...paymentData,
        order_id: orderIdString,
      })
      return { received: true, booking: enquiry, action: 'confirmed' }
    }

    if (isTerminalFailure || isCancelledPayment) {
      if (isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
        await preserveCompletedBooking(enquiry)
        return { received: true, duplicate: true, booking: enquiry, action: 'duplicate' }
      }
      if (
        paymentId &&
        enquiry.paymentStatus === 'failed' &&
        enquiry.cfPaymentId === paymentId &&
        enquiry.cfPaymentStatus === paymentStatus
      ) {
        if (restoreTemporaryBookingExpiry(enquiry)) {
          await enquiry.save()
        }
        if (isTerminalFailure) {
          await persistPaymentResult(enquiry, 'FAILED', {
            ...paymentData,
            order_id: orderIdString,
          })
        }
        return { received: true, duplicate: true, booking: enquiry, action: 'duplicate' }
      }

      if (!isCompletedBookingPaymentStatus(enquiry.paymentStatus)) {
        enquiry.paymentStatus = 'failed'
        enquiry.paymentFailureReason = isCancelledPayment ? 'cancelled' : 'failed'
        enquiry.cfPaymentId = paymentId
        enquiry.cfPaymentStatus = paymentStatus || 'FAILED'

        if (orderEntry && orderEntry.status === 'created') {
          orderEntry.status = 'failed'
          orderEntry.paymentId = paymentId
        }

        restoreTemporaryBookingExpiry(enquiry)
        await enquiry.save()
        if (isTerminalFailure) {
          await persistPaymentResult(enquiry, 'FAILED', {
            ...paymentData,
            order_id: orderIdString,
          })
        }
      }
      return { received: true, booking: enquiry, action: 'failed' }
    }

    return { received: true, ignored: true, eventType }
  }

  return {
    isConfigured: configured,
    environment: isProduction ? 'production' : 'sandbox',
    createOrder,
    verifyPayment,
    verifyUnmatchedPayment,
    checkStatus,
    recordFailure,
    handleWebhook,
  }
}
