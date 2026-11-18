import { createHmac, timingSafeEqual } from 'node:crypto'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { BookingResult } from '../models/bookingResult.js'
import { nextBookingReference } from './bookingReferences.js'
import {
  DEFAULT_TICKET_TYPE,
  FIXED_BOOKING_AMOUNT,
  calculateTicketPricing,
} from './diwaliOffer.js'
import { persistBookingResult } from './bookingResults.js'

const SANDBOX_URL = 'https://sandbox.cashfree.com/pg'
const PRODUCTION_URL = 'https://api.cashfree.com/pg'
const DEFAULT_API_VERSION = '2023-08-01'

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
  } catch (err) {
    console.error('[Cashfree Webhook] Signature verification failed:', err.message)
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
    if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
      return {
        alreadyPaid: true,
        reference: enquiry.reference,
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

    let response
    try {
      response = await fetchFn(`${baseUrl}/orders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(orderPayload),
      })
    } catch (err) {
      console.error('[Cashfree] Order creation network error:', err.message)
      throw serviceError(502, 'Could not reach Cashfree payment service. Please try again.')
    }

    const data = await response.json()
    if (!response.ok || !data.payment_session_id) {
      const msg = data.message || 'Cashfree could not initiate the payment order.'
      console.error('[Cashfree] Order creation failed:', data)
      throw serviceError(response.status >= 400 && response.status < 500 ? 400 : 502, msg)
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
    if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
      if (
        cf_payment_id &&
        String(enquiry.cfPaymentId ?? '') !== String(cf_payment_id)
      ) {
        throw serviceError(400, 'Cashfree payment does not match this booking order.')
      }
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

    // 1. Fetch payments for this order
    let paymentsResponse
    try {
      paymentsResponse = await fetchFn(`${baseUrl}/orders/${encodeURIComponent(orderIdToVerify)}/payments`, {
        method: 'GET',
        headers: getHeaders(),
      })
    } catch (err) {
      console.error('[Cashfree] Verify payment network error:', err.message)
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
    const successfulPayment = Array.isArray(payments)
      ? payments.find(
          (payment) =>
            payment.payment_status === 'SUCCESS' &&
            (!cf_payment_id || String(payment.cf_payment_id) === String(cf_payment_id)),
        )
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

    if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
      return {
        pending: false,
        duplicate: true,
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

    if (enquiry.paymentStatus === 'paid') {
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

    const orderId = orderData?.order_id || paymentData?.order_id
    if (!orderId) {
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
      console.warn(`[Cashfree Webhook] No matching booking enquiry found for orderId: ${orderIdString}`)
      return { received: true, ignored: true, reason: 'order_not_found' }
    }

    const paymentId = String(paymentData?.cf_payment_id ?? '')
    const paymentStatus = paymentData?.payment_status
    const orderEntry = enquiry.paymentOrders?.find((order) => order.orderId === orderIdString)
    const isCancelledPayment =
      eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' ||
      ['USER_DROPPED', 'CANCELLED'].includes(paymentStatus)
    const isTerminalFailure = paymentStatus === 'FAILED' && !isCancelledPayment
    const isSuccessfulPayment =
      eventType === 'PAYMENT_SUCCESS_WEBHOOK' && paymentStatus === 'SUCCESS'

    if (isSuccessfulPayment) {
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
      if (!amountMatches || !currencyMatches || !paymentId) {
        return { received: true, ignored: true, reason: 'payment_confirmation_mismatch' }
      }

      if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
        await persistPaymentResult(enquiry, 'SUCCESS', {
          cf_payment_id: enquiry.cfPaymentId || paymentId,
          order_id: orderIdString,
          payment_currency: paymentData?.payment_currency || 'INR',
        })
        return { received: true, duplicate: true, booking: enquiry, action: 'duplicate' }
      }

      // Confirm booking idempotently
      if (!enquiry.reference) {
        enquiry.reference = await allocateReference()
      }
      enquiry.paymentStatus = 'paid'
      enquiry.status = 'confirmed'
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

      await enquiry.save()
      await persistPaymentResult(enquiry, 'SUCCESS', {
        ...paymentData,
        order_id: orderIdString,
      })
      return { received: true, booking: enquiry, action: 'confirmed' }
    }

    if (isTerminalFailure || isCancelledPayment) {
      if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
        return { received: true, duplicate: true, booking: enquiry, action: 'duplicate' }
      }
      if (
        paymentId &&
        enquiry.paymentStatus === 'failed' &&
        enquiry.cfPaymentId === paymentId &&
        enquiry.cfPaymentStatus === paymentStatus
      ) {
        if (isTerminalFailure) {
          await persistPaymentResult(enquiry, 'FAILED', {
            ...paymentData,
            order_id: orderIdString,
          })
        }
        return { received: true, duplicate: true, booking: enquiry, action: 'duplicate' }
      }

      if (enquiry.paymentStatus !== 'paid') {
        enquiry.paymentStatus = 'failed'
        enquiry.paymentFailureReason = isCancelledPayment ? 'cancelled' : 'failed'
        enquiry.cfPaymentId = paymentId
        enquiry.cfPaymentStatus = paymentStatus || 'FAILED'

        if (orderEntry && orderEntry.status === 'created') {
          orderEntry.status = 'failed'
          orderEntry.paymentId = paymentId
        }

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
    checkStatus,
    recordFailure,
    handleWebhook,
  }
}
