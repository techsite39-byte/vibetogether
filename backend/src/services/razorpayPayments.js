import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { nextBookingReference } from './bookingReferences.js'
import {
  DEFAULT_TICKET_TYPE,
  DIWALI_OFFER_PRICE,
  DIWALI_REGULAR_PRICE,
  calculateTicketPricing,
} from './diwaliOffer.js'

const currency = 'INR'
const attemptLockMs = 2 * 60 * 1000
const defaultPricing = {
  paymentAmount: DIWALI_REGULAR_PRICE,
  paymentAmountPaise: DIWALI_REGULAR_PRICE * 100,
  regularPrice: DIWALI_REGULAR_PRICE,
  offerPrice: DIWALI_OFFER_PRICE,
  diwaliOfferApplied: false,
  offerActivationAt: null,
  offerExpiresAt: null,
  ticketType: DEFAULT_TICKET_TYPE,
  ticketTypeName: 'General Admission',
  ticketQuantity: 1,
  pricePerTicket: DIWALI_REGULAR_PRICE,
  subtotal: DIWALI_REGULAR_PRICE,
  discount: 0,
  finalAmount: DIWALI_REGULAR_PRICE,
}

function serviceError(status, message) {
  return Object.assign(new Error(message), { status })
}

function providerStatus(error) {
  return error.statusCode ?? error.status ?? error.error?.statusCode
}

function validPaymentSignature(orderId, paymentId, signature, secret) {
  const expected = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest()
  let actual
  try {
    actual = Buffer.from(signature, 'hex')
  } catch {
    return false
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isValidRazorpayWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) return false
  if (!/^[a-f\d]{64}$/i.test(signature)) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const actual = Buffer.from(signature, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function serializeOrder(order, keyId, pricing) {
  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: keyId,
    pricing: pricing ? {
      paymentAmount: order.amount / 100,
      paymentAmountPaise: order.amount,
      regularPrice: pricing.regularPrice,
      offerPrice: pricing.offerPrice,
      diwaliOfferApplied: pricing.diwaliOfferApplied,
      offerActivationAt: pricing.offerActivationAt,
      offerExpiresAt: pricing.offerExpiresAt,
      ticketType: pricing.ticketType,
      ticketTypeName: pricing.ticketTypeName,
      ticketQuantity: pricing.ticketQuantity,
      pricePerTicket: pricing.pricePerTicket,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      finalAmount: pricing.finalAmount,
    } : undefined,
  }
}

export function createRazorpayPaymentService({
  client,
  keyId = '',
  keySecret = '',
  bookingEnquiryModel = BookingEnquiry,
  allocateReference = nextBookingReference,
  diwaliOfferService,
} = {}) {
  async function getSession(requestId) {
    return bookingEnquiryModel.findOne({ requestId }).lean()
  }

  async function getPricing(enquiry) {
    const basePricing = diwaliOfferService?.getPricing
      ? await diwaliOfferService.getPricing()
      : { ...defaultPricing }
    return calculateTicketPricing(
      basePricing,
      enquiry?.ticketQuantity ?? 1,
      enquiry?.ticketType ?? DEFAULT_TICKET_TYPE,
    )
  }

  function getOrderPricing(enquiry, orderId) {
    const stored = enquiry.paymentOrders?.find((order) => order.orderId === orderId)
    if (stored) {
      return {
        paymentAmount: stored.amount,
        paymentAmountPaise: stored.amountPaise,
        regularPrice: stored.regularPrice,
        offerPrice: stored.offerPrice,
        diwaliOfferApplied: stored.diwaliOfferApplied,
        offerActivationAt: stored.offerActivationAt,
        offerExpiresAt: stored.offerExpiresAt,
        ticketType: stored.ticketType ?? enquiry.ticketType ?? DEFAULT_TICKET_TYPE,
        ticketTypeName: stored.ticketTypeName ?? enquiry.ticketTypeName ?? 'General Admission',
        ticketQuantity: stored.ticketQuantity ?? enquiry.ticketQuantity ?? 1,
        pricePerTicket: stored.pricePerTicket ?? enquiry.pricePerTicket ?? stored.regularPrice,
        subtotal: stored.subtotal ?? enquiry.subtotal ?? stored.regularPrice,
        discount: stored.discount ?? enquiry.discount ?? 0,
        finalAmount: stored.finalAmount ?? stored.amount,
      }
    }
    if (enquiry.paymentOrderId === orderId) {
      return {
        paymentAmount: enquiry.paymentAmount ?? defaultPricing.paymentAmount,
        paymentAmountPaise: enquiry.paymentOrderAmountPaise || enquiry.paymentAmountPaise || defaultPricing.paymentAmountPaise,
        regularPrice: enquiry.regularPrice ?? defaultPricing.regularPrice,
        offerPrice: enquiry.offerPrice ?? defaultPricing.offerPrice,
        diwaliOfferApplied: Boolean(enquiry.diwaliOfferApplied),
        offerActivationAt: enquiry.offerActivationAt ?? null,
        offerExpiresAt: enquiry.offerExpiresAt ?? null,
        ticketType: enquiry.ticketType ?? DEFAULT_TICKET_TYPE,
        ticketTypeName: enquiry.ticketTypeName ?? 'General Admission',
        ticketQuantity: enquiry.ticketQuantity ?? 1,
        pricePerTicket: enquiry.pricePerTicket ?? enquiry.regularPrice ?? DIWALI_REGULAR_PRICE,
        subtotal: enquiry.subtotal ?? enquiry.regularPrice ?? DIWALI_REGULAR_PRICE,
        discount: enquiry.discount ?? 0,
        finalAmount: enquiry.finalAmount ?? enquiry.paymentAmount ?? DIWALI_REGULAR_PRICE,
      }
    }
    return null
  }

  async function finalizeCapturedPayment(requestId, orderId, payment, pricing) {
    const now = new Date()
    const attemptId = randomUUID()
    const claimed = await bookingEnquiryModel.findOneAndUpdate(
      {
        requestId,
        paymentOrderId: orderId,
        status: { $ne: 'cancelled' },
        expiresAt: { $gt: now },
        $and: [
          { $or: [{ reference: { $exists: false } }, { reference: '' }] },
          {
            $or: [
              { paymentStatus: { $in: ['unpaid', 'failed'] } },
              {
                paymentStatus: 'processing',
                paymentAttemptId: { $in: ['', null] },
              },
              {
                paymentStatus: 'processing',
                paymentAttemptedAt: { $lte: new Date(now.getTime() - attemptLockMs) },
              },
            ],
          },
        ],
      },
      {
        $set: {
          paymentStatus: 'processing',
          paymentAttemptId: attemptId,
          paymentAttemptedAt: now,
          razorpayPaymentId: payment.id,
          paymentReference: payment.id,
        },
      },
      { new: true, runValidators: true },
    ).lean()

    if (!claimed) {
      const current = await getSession(requestId)
      if (
        current?.paymentStatus === 'paid' &&
        current.paymentOrderId === orderId &&
        current.razorpayPaymentId === payment.id &&
        current.reference
      ) {
        return { booking: current, duplicate: true }
      }
      if (current?.paymentStatus === 'processing') {
        return { booking: current, pending: true }
      }
      return null
    }

    try {
      const reference = await allocateReference()
      const booking = await bookingEnquiryModel.findOneAndUpdate(
        {
          _id: claimed._id,
          paymentStatus: 'processing',
          paymentAttemptId: attemptId,
          paymentOrderId: orderId,
          razorpayPaymentId: payment.id,
        },
        {
          $set: {
            reference,
            paymentStatus: 'paid',
            paymentAmount: payment.amount / 100,
            paymentAmountPaise: payment.amount,
            paymentOrderAmountPaise: payment.amount,
            regularPrice: pricing.regularPrice,
            offerPrice: pricing.offerPrice,
            diwaliOfferApplied: pricing.diwaliOfferApplied,
            offerActivationAt: pricing.offerActivationAt,
            offerExpiresAt: pricing.offerExpiresAt,
            ticketType: pricing.ticketType ?? claimed.ticketType ?? DEFAULT_TICKET_TYPE,
            ticketTypeName: pricing.ticketTypeName ?? claimed.ticketTypeName ?? 'General Admission',
            ticketQuantity: pricing.ticketQuantity ?? claimed.ticketQuantity ?? 1,
            pricePerTicket: pricing.pricePerTicket ?? claimed.pricePerTicket ?? pricing.regularPrice,
            subtotal: pricing.subtotal ?? claimed.subtotal ?? pricing.regularPrice,
            discount: pricing.discount ?? claimed.discount ?? 0,
            finalAmount: payment.amount / 100,
            paymentProvider: 'razorpay',
            paymentReference: payment.id,
            paymentFailureReason: '',
            paidAt: now,
            paymentVerifiedAt: now,
            'paymentOrders.$[attempt].status': 'paid',
            'paymentOrders.$[attempt].paymentId': payment.id,
          },
          $unset: { expiresAt: 1, paymentAttemptId: 1, paymentAttemptedAt: 1 },
        },
        {
          new: true,
          runValidators: true,
          arrayFilters: [{ 'attempt.orderId': orderId }],
        },
      ).lean()
      if (booking) {
        return { booking, duplicate: false }
      }
      const current = await getSession(requestId)
      if (current?.paymentStatus === 'paid' && current.reference) {
        return { booking: current, duplicate: true }
      }
      return current ? { booking: current, pending: true } : null
    } catch (error) {
      await bookingEnquiryModel.findOneAndUpdate(
        { _id: claimed._id, paymentAttemptId: attemptId },
        {
          $set: { paymentStatus: 'processing' },
          $unset: { paymentAttemptId: 1 },
        },
      )
      throw error
    }
  }

  async function finalizeIfCaptured(requestId, orderId, payment) {
    const enquiry = await getSession(requestId)
    const pricing = enquiry && getOrderPricing(enquiry, orderId)
    if (
      !payment ||
      !pricing ||
      payment.order_id !== orderId ||
      payment.amount !== pricing.paymentAmountPaise ||
      payment.currency !== currency
    ) {
      return null
    }
    if (payment.status !== 'captured') {
      if (payment.status === 'failed') {
        await bookingEnquiryModel.findOneAndUpdate(
          { requestId, paymentOrderId: orderId, reference: { $in: ['', null] } },
          {
            $set: {
              paymentStatus: 'failed',
              paymentFailureReason: 'failed',
              razorpayPaymentId: payment.id,
            },
          },
          { new: true, runValidators: true },
        )
        return { booking: await getSession(requestId), failed: true }
      }
      const pending = await bookingEnquiryModel.findOneAndUpdate(
        { requestId, paymentOrderId: orderId, reference: { $in: ['', null] } },
        {
          $set: {
            paymentStatus: 'processing',
            paymentAttemptedAt: new Date(),
            razorpayPaymentId: payment.id,
            paymentReference: payment.id,
          },
        },
        { new: true, runValidators: true },
      ).lean()
      return pending ? { booking: pending, pending: true } : null
    }

    return finalizeCapturedPayment(requestId, orderId, payment, pricing)
  }

  async function createOrder(requestId) {
    if (!client || !keyId || !keySecret) {
      throw serviceError(503, 'Razorpay Checkout is not configured on the booking server.')
    }
    const now = new Date()
    let existing = await getSession(requestId)
    if (!existing || existing.status === 'cancelled' || existing.reference) {
      return null
    }
    if (existing.expiresAt && existing.expiresAt <= now) return null

    const currentPricing = await getPricing(existing)
    const pricing = existing.paymentStatus === 'processing' && existing.paymentAttemptPricing
      ? existing.paymentAttemptPricing
      : currentPricing
    if (existing.paymentOrderId) {
      const currentPricing = getOrderPricing(existing, existing.paymentOrderId)
      if (
        !currentPricing ||
        currentPricing.paymentAmountPaise === pricing.paymentAmountPaise ||
        existing.paymentStatus !== 'failed'
      ) {
        if (existing.paymentStatus === 'processing') {
          return { pending: true, booking: existing }
        }
        return serializeOrder({
          id: existing.paymentOrderId,
          amount: currentPricing?.paymentAmountPaise ?? existing.paymentOrderAmountPaise ?? existing.paymentAmountPaise,
          currency,
        }, keyId, currentPricing)
      }

      const previousPayments = await client.orders.fetchPayments(existing.paymentOrderId)
      const captured = previousPayments.items?.find((payment) => payment.status === 'captured')
      if (captured) {
        const finalized = await finalizeIfCaptured(requestId, existing.paymentOrderId, captured)
        if (finalized) return finalized
      }
      if (previousPayments.items?.some((payment) => payment.status !== 'failed')) {
        return { pending: true, booking: existing }
      }
    }

    const staleCreation = existing.paymentStatus === 'processing' &&
      existing.paymentAttemptedAt instanceof Date &&
      now.getTime() - existing.paymentAttemptedAt.getTime() >= attemptLockMs
    if (existing.paymentStatus === 'processing' && !staleCreation) {
      return { pending: true, booking: existing }
    }

    const attemptId = staleCreation && existing.paymentAttemptId
      ? existing.paymentAttemptId
      : randomUUID()
    const attemptNumber = staleCreation && existing.paymentOrderAttemptNumber
      ? existing.paymentOrderAttemptNumber
      : (existing.paymentOrders?.length ?? 0) + 1
    const receipt = `${requestId.slice(0, 27)}-${attemptNumber}`
    const priorOrderId = existing.paymentOrderId ?? ''
    const claimed = await bookingEnquiryModel.findOneAndUpdate(
      {
        requestId,
        status: { $ne: 'cancelled' },
        expiresAt: { $gt: now },
        paymentOrderId: priorOrderId || { $in: ['', null] },
        $and: [
          { $or: [{ reference: { $exists: false } }, { reference: '' }] },
          {
            ...(priorOrderId
              ? { paymentStatus: 'failed' }
              : {
                  $or: [
                    { paymentStatus: { $in: ['unpaid', 'failed'] } },
                    {
                      paymentStatus: 'processing',
                      paymentAttemptedAt: { $lte: new Date(now.getTime() - attemptLockMs) },
                    },
                  ],
                }),
          },
        ],
      },
      {
        $set: {
          paymentStatus: 'processing',
          paymentAttemptId: attemptId,
          paymentAttemptedAt: now,
          paymentOrderAttemptNumber: attemptNumber,
          paymentAttemptPricing: pricing,
        },
      },
      { new: true, runValidators: true },
    ).lean()

    if (!claimed) {
      const current = await getSession(requestId)
      if (current?.paymentOrderId) {
        const currentPricing = getOrderPricing(current, current.paymentOrderId)
        return serializeOrder({
          id: current.paymentOrderId,
          amount: currentPricing?.paymentAmountPaise ?? current.paymentOrderAmountPaise,
          currency,
        }, keyId, getOrderPricing(current, current.paymentOrderId))
      }
      return current?.paymentStatus === 'processing'
        ? { pending: true, booking: current }
        : null
    }

    try {
      let order
      if (staleCreation) {
        const previousOrders = await client.orders.all({ receipt, count: 100 })
        order = previousOrders.items?.find((item) =>
          item.receipt === receipt &&
          item.amount === pricing.paymentAmountPaise &&
          item.currency === currency &&
          item.notes?.attempt_id === attemptId,
        )
      }
      order ??= await client.orders.create({
        amount: pricing.paymentAmountPaise,
        currency,
        receipt,
        notes: { request_id: requestId, attempt_id: attemptId },
      })
      if (!order?.id) {
        throw serviceError(502, 'Razorpay did not return an order ID.')
      }

      const saved = await bookingEnquiryModel.findOneAndUpdate(
        { _id: claimed._id, paymentStatus: 'processing', paymentAttemptId: attemptId },
        {
          $set: {
            paymentStatus: 'unpaid',
            paymentAmount: pricing.paymentAmount,
            paymentAmountPaise: pricing.paymentAmountPaise,
            paymentOrderAmountPaise: pricing.paymentAmountPaise,
            regularPrice: pricing.regularPrice,
            offerPrice: pricing.offerPrice,
            diwaliOfferApplied: pricing.diwaliOfferApplied,
            offerActivationAt: pricing.offerActivationAt,
            offerExpiresAt: pricing.offerExpiresAt,
            ticketType: pricing.ticketType,
            ticketTypeName: pricing.ticketTypeName,
            ticketQuantity: pricing.ticketQuantity,
            pricePerTicket: pricing.pricePerTicket,
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            finalAmount: pricing.finalAmount,
            paymentProvider: 'razorpay',
            paymentOrderId: order.id,
            paymentOrderCreatedAt: new Date(),
            paymentFailureReason: '',
          },
          $push: {
            paymentOrders: {
              orderId: order.id,
              amount: pricing.paymentAmount,
              amountPaise: pricing.paymentAmountPaise,
              regularPrice: pricing.regularPrice,
              offerPrice: pricing.offerPrice,
              diwaliOfferApplied: pricing.diwaliOfferApplied,
              offerActivationAt: pricing.offerActivationAt,
              offerExpiresAt: pricing.offerExpiresAt,
              ticketType: pricing.ticketType,
              ticketTypeName: pricing.ticketTypeName,
              ticketQuantity: pricing.ticketQuantity,
              pricePerTicket: pricing.pricePerTicket,
              subtotal: pricing.subtotal,
              discount: pricing.discount,
              finalAmount: pricing.finalAmount,
              status: 'created',
              createdAt: new Date(),
            },
          },
          $unset: {
            paymentAttemptId: 1,
            paymentAttemptedAt: 1,
            paymentAttemptPricing: 1,
          },
        },
        { new: true, runValidators: true },
      ).lean()
      if (!saved) {
        const current = await getSession(requestId)
        if (current?.paymentOrderId === order.id) {
          return serializeOrder(order, keyId, pricing)
        }
        return { pending: true, booking: current }
      }
      return serializeOrder(order, keyId, pricing)
    } catch (error) {
      const status = providerStatus(error)
      if (status) {
        await bookingEnquiryModel.findOneAndUpdate(
          { _id: claimed._id, paymentStatus: 'processing', paymentAttemptId: attemptId },
          {
            $set: { paymentStatus: priorOrderId ? 'failed' : 'unpaid' },
            $unset: {
              paymentAttemptId: 1,
              paymentAttemptedAt: 1,
              paymentOrderAttemptNumber: 1,
              paymentAttemptPricing: 1,
            },
          },
        )
        throw serviceError(status === 401 ? 401 : 500, status === 401
          ? 'Razorpay rejected the configured server credentials.'
          : 'Razorpay could not create the payment order.')
      }
      throw Object.assign(
        serviceError(202, 'Order creation is still being checked. Check payment status before retrying.'),
        { pending: true },
      )
    }
  }

  async function verifyPayment(requestId, fields) {
    if (!client || !keyId || !keySecret) {
      throw serviceError(503, 'Razorpay Checkout is not configured on the booking server.')
    }
    const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = fields ?? {}
    if (
      typeof paymentId !== 'string' || !paymentId ||
      typeof orderId !== 'string' || !orderId ||
      typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)
    ) {
      throw serviceError(400, 'Razorpay payment ID, order ID, and signature are required.')
    }
    const enquiry = await getSession(requestId)
    if (!enquiry || !enquiry.paymentOrderId || enquiry.paymentOrderId !== orderId) {
      throw serviceError(400, 'Razorpay order does not match this booking session.')
    }
    const pricing = getOrderPricing(enquiry, orderId)
    if (!pricing) {
      throw serviceError(400, 'Razorpay order pricing could not be verified.')
    }
    if (!validPaymentSignature(enquiry.paymentOrderId, paymentId, signature, keySecret)) {
      throw serviceError(400, 'Razorpay payment signature verification failed.')
    }
    if (
      enquiry.paymentStatus === 'paid' &&
      enquiry.razorpayPaymentId === paymentId &&
      enquiry.reference
    ) {
      return { booking: enquiry, duplicate: true }
    }

    let payment
    try {
      payment = await client.payments.fetch(paymentId)
    } catch {
      throw serviceError(502, 'Razorpay payment status could not be verified. Please check again.')
    }
    if (
      payment.order_id !== enquiry.paymentOrderId ||
      payment.amount !== pricing.paymentAmountPaise ||
      payment.currency !== currency
    ) {
      throw serviceError(400, 'Razorpay payment details do not match this booking order.')
    }
    return finalizeIfCaptured(requestId, orderId, payment)
  }

  async function checkStatus(requestId) {
    if (!client || !keyId || !keySecret) {
      throw serviceError(503, 'Razorpay Checkout is not configured on the booking server.')
    }
    const enquiry = await getSession(requestId)
    if (!enquiry || !enquiry.paymentOrderId) {
      return enquiry ? { booking: enquiry } : null
    }
    if (enquiry.paymentStatus === 'paid' && enquiry.reference) {
      return { booking: enquiry, duplicate: true }
    }
    const response = await client.orders.fetchPayments(enquiry.paymentOrderId)
    const pricing = getOrderPricing(enquiry, enquiry.paymentOrderId)
    if (response.items?.some((payment) =>
      payment.order_id !== enquiry.paymentOrderId ||
      payment.amount !== pricing?.paymentAmountPaise ||
      payment.currency !== currency,
    )) {
      throw serviceError(400, 'Razorpay payment details do not match this booking order.')
    }
    const captured = response.items?.find((payment) => payment.status === 'captured')
    if (captured) {
      if (
        !pricing ||
        captured.amount !== pricing.paymentAmountPaise ||
        captured.currency !== currency ||
        captured.order_id !== enquiry.paymentOrderId
      ) {
        throw serviceError(400, 'Razorpay payment details do not match this booking order.')
      }
      return finalizeIfCaptured(requestId, enquiry.paymentOrderId, captured)
    }
    const responsePayments = response.items ?? []
    const hasUnresolvedPayment = responsePayments.some((payment) => payment.status !== 'failed')
    const failed = responsePayments.find((payment) => payment.status === 'failed')
    if (failed && !hasUnresolvedPayment) {
      await bookingEnquiryModel.findOneAndUpdate(
        { requestId, paymentOrderId: enquiry.paymentOrderId, reference: { $in: ['', null] } },
        {
          $set: {
            paymentStatus: 'failed',
            paymentFailureReason: 'failed',
            razorpayPaymentId: failed.id,
            'paymentOrders.$[attempt].status': 'failed',
            'paymentOrders.$[attempt].paymentId': failed.id,
          },
        },
        {
          new: true,
          runValidators: true,
          arrayFilters: [{ 'attempt.orderId': enquiry.paymentOrderId }],
        },
      )
    }
    return { booking: await getSession(requestId), pending: hasUnresolvedPayment }
  }

  async function recordFailure(requestId, { orderId, paymentId = '', outcome = 'cancelled' } = {}) {
    if (!client || !keyId || !keySecret) {
      throw serviceError(503, 'Razorpay Checkout is not configured on the booking server.')
    }
    const enquiry = await getSession(requestId)
    if (!enquiry || !enquiry.paymentOrderId || enquiry.paymentOrderId !== orderId) {
      throw serviceError(400, 'Razorpay order does not match this booking session.')
    }
    const pricing = getOrderPricing(enquiry, orderId)
    if (!pricing) {
      throw serviceError(400, 'Razorpay order pricing could not be verified.')
    }
    let selectedPayment = null
    if (paymentId) {
      selectedPayment = await client.payments.fetch(paymentId)
      if (
        selectedPayment.order_id !== orderId ||
        selectedPayment.amount !== pricing.paymentAmountPaise ||
        selectedPayment.currency !== currency
      ) {
        throw serviceError(400, 'Razorpay payment details do not match this booking order.')
      }
      if (selectedPayment.status === 'captured') {
        return finalizeIfCaptured(requestId, orderId, selectedPayment)
      }
    }
    const payments = await client.orders.fetchPayments(orderId)
    if (payments.items?.some((payment) =>
      payment.order_id !== orderId ||
      payment.amount !== pricing.paymentAmountPaise ||
      payment.currency !== currency,
    )) {
      throw serviceError(400, 'Razorpay payment details do not match this booking order.')
    }
    const captured = payments.items?.find((payment) => payment.status === 'captured')
    if (captured) {
      return finalizeIfCaptured(requestId, orderId, captured)
    }
    const hasUnresolvedPayment = (payments.items ?? []).some((payment) => payment.status !== 'failed')
    if (
      (selectedPayment && selectedPayment.status !== 'failed') ||
      hasUnresolvedPayment
    ) {
      return { booking: enquiry, pending: true }
    }
    const failed = selectedPayment ?? payments.items?.find((payment) => payment.status === 'failed')
    const booking = await bookingEnquiryModel.findOneAndUpdate(
      {
        requestId,
        paymentOrderId: orderId,
        status: { $ne: 'cancelled' },
        paymentStatus: { $in: ['unpaid', 'failed', 'processing'] },
        reference: { $in: ['', null] },
      },
      {
        $set: {
          paymentStatus: 'failed',
          paymentFailureReason: outcome === 'failed' ? 'failed' : 'cancelled',
          razorpayPaymentId: paymentId || failed?.id || '',
          'paymentOrders.$[attempt].status': 'failed',
          'paymentOrders.$[attempt].paymentId': paymentId || failed?.id || '',
        },
        $unset: { paymentAttemptId: 1, paymentAttemptedAt: 1 },
      },
      {
        new: true,
        runValidators: true,
        arrayFilters: [{ 'attempt.orderId': orderId }],
      },
    ).lean()
    return booking ? { booking } : null
  }

  async function handleWebhook(event, payment, order) {
    if (event === 'order.paid') {
      const orderId = order?.id
      if (typeof orderId !== 'string') return null
      const enquiry = await bookingEnquiryModel.findOne({ paymentOrderId: orderId }).lean()
      if (!enquiry) return null
      if (!client || !keyId || !keySecret) {
        throw serviceError(503, 'Razorpay Checkout is not configured on the booking server.')
      }
      const pricing = getOrderPricing(enquiry, orderId)
      if (!pricing) {
        throw serviceError(400, 'Razorpay order pricing could not be verified.')
      }
      const response = await client.orders.fetchPayments(orderId)
      if (response.items?.some((payment) =>
        payment.order_id !== orderId ||
        payment.amount !== pricing.paymentAmountPaise ||
        payment.currency !== currency,
      )) {
        throw serviceError(400, 'Razorpay payment details do not match this booking order.')
      }
      const captured = response.items?.find((payment) => payment.status === 'captured')
      return captured
        ? finalizeIfCaptured(enquiry.requestId, orderId, captured)
        : { booking: enquiry, pending: true }
    }

    const orderId = payment?.order_id
    const paymentId = payment?.id
    if (
      !['payment.captured', 'payment.failed'].includes(event) ||
      typeof orderId !== 'string' ||
      typeof paymentId !== 'string'
    ) {
      return null
    }
    const enquiry = await bookingEnquiryModel.findOne({ paymentOrderId: orderId }).lean()
    if (!enquiry) return null
    const pricing = getOrderPricing(enquiry, orderId)
    if (
      !pricing ||
      payment.amount !== pricing.paymentAmountPaise ||
      payment.currency !== currency
    ) {
      throw serviceError(400, 'Razorpay webhook payment details do not match this booking order.')
    }
    if (event === 'payment.captured') {
      if (payment.status !== 'captured') return null
      return finalizeIfCaptured(enquiry.requestId, orderId, payment)
    }
    if (payment.status !== 'failed') return null

    // A failed attempt can be followed by a successful retry on the same order.
    // Only the checkout dismissal/status check may make the booking terminal.
    return { booking: enquiry, pending: true }
  }

  return { createOrder, verifyPayment, checkStatus, recordFailure, handleWebhook }
}