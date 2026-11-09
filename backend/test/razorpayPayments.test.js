import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import {
  createRazorpayPaymentService,
  isValidRazorpayWebhookSignature,
} from '../src/services/razorpayPayments.js'

function makeQuery(value) {
  return { lean: async () => (value ? structuredClone(value) : null) }
}

function createBookingModel(requestId) {
  let record = {
    _id: 'temp-razorpay-1',
    requestId,
    name: 'Jordan Example',
    mobile: '+919876543210',
    email: 'jordan@example.com',
    category: 'Fun Games',
    gender: 'Female',
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentAmount: 299,
    paymentProvider: 'razorpay_demo',
    paymentReference: '',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }

  return {
    get record() {
      return structuredClone(record)
    },
    findOne(filter) {
      return makeQuery(
        Object.entries(filter).every(([key, value]) => record[key] === value)
          ? record
          : null,
      )
    },
    findOneAndUpdate(filter, update) {
      if (record.requestId !== filter.requestId && record._id !== filter._id) {
        return makeQuery(null)
      }
      if (update.$set?.paymentStatus === 'processing') {
        const canClaim =
          record.status !== 'cancelled' &&
          record.expiresAt > new Date() &&
          !record.reference &&
          (
            ['unpaid', 'failed'].includes(record.paymentStatus) ||
            (record.paymentStatus === 'processing' && !record.paymentAttemptId)
          )
        if (!canClaim) return makeQuery(null)
      }
      if (update.$set?.reference && (
        record.paymentStatus !== 'processing' ||
        record.paymentAttemptId !== filter.paymentAttemptId
      )) {
        return makeQuery(null)
      }
      Object.assign(record, update.$set ?? {})
      for (const [key, value] of Object.entries(update.$push ?? {})) {
        record[key] ??= []
        record[key].push(structuredClone(value))
      }
      for (const key of Object.keys(update.$unset ?? {})) {
        delete record[key]
      }
      return makeQuery(record)
    },
  }
}

function signature(orderId, paymentId, secret) {
  return createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
}

function createClient({
  paymentStatus = 'captured',
  paymentsList = [],
  paymentAmount = 29900,
} = {}) {
  const createdOrders = []
  const paymentFetches = []
  return {
    createdOrders,
    paymentFetches,
    orders: {
      async all() {
        return { items: [] }
      },
      async create(order) {
        createdOrders.push(order)
        return { id: `order_test_${createdOrders.length}`, ...order, status: 'created' }
      },
      async fetchPayments() {
        return { items: paymentsList }
      },
    },
    payments: {
      async fetch(paymentId) {
        paymentFetches.push(paymentId)
        return {
          id: paymentId,
          order_id: 'order_test_1',
          amount: paymentAmount,
          currency: 'INR',
          status: paymentStatus,
        }
      },
    },
  }
}

test('creates a fixed INR order once and reuses it for retries', async () => {
  const requestId = 'razorpay-session-1'
  const model = createBookingModel(requestId)
  const client = createClient()
  let referenceAllocations = 0
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
    allocateReference: async () => {
      referenceAllocations += 1
      return '10812026501'
    },
  })

  const first = await service.createOrder(requestId)
  const retry = await service.createOrder(requestId)

  assert.equal(client.createdOrders.length, 1)
  assert.equal(client.createdOrders[0].amount, 29900)
  assert.equal(client.createdOrders[0].currency, 'INR')
  assert.match(client.createdOrders[0].receipt, /^razorpay-session-1-\d+$/)
  assert.equal(client.createdOrders[0].notes.request_id, requestId)
  assert.ok(client.createdOrders[0].notes.attempt_id)
  assert.equal(first.order_id, 'order_test_1')
  assert.equal(first.amount, 29900)
  assert.ok(first.amount >= 100)
  assert.equal(first.key_id, 'rzp_test_public')
  assert.equal(retry.order_id, first.order_id)
  assert.equal(model.record.paymentStatus, 'unpaid')
  assert.equal(model.record.reference, undefined)
  assert.equal(referenceAllocations, 0)
})

test('creates a ₹249 offer order, then restores ₹299 on a new retry after expiry', async () => {
  const requestId = 'razorpay-offer-session'
  const model = createBookingModel(requestId)
  const client = createClient()
  let offerActive = true
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
    diwaliOfferService: {
      async getPricing() {
        return {
          paymentAmount: offerActive ? 249 : 299,
          paymentAmountPaise: offerActive ? 24900 : 29900,
          regularPrice: 299,
          offerPrice: 249,
          diwaliOfferApplied: offerActive,
          offerActivationAt: new Date('2026-11-09T10:00:00.000Z'),
          offerExpiresAt: new Date('2026-11-12T10:00:00.000Z'),
        }
      },
    },
  })

  const offerOrder = await service.createOrder(requestId)
  assert.equal(offerOrder.amount, 24900)
  assert.equal(offerOrder.pricing.diwaliOfferApplied, true)

  const failure = await service.recordFailure(requestId, {
    orderId: offerOrder.order_id,
    outcome: 'failed',
  })
  assert.equal(failure.booking.reference, undefined)
  offerActive = false

  const regularOrder = await service.createOrder(requestId)
  assert.equal(regularOrder.amount, 29900)
  assert.equal(regularOrder.pricing.diwaliOfferApplied, false)
  assert.equal(client.createdOrders.length, 2)
})

test('valid HMAC and captured Razorpay status finalize one booking reference', async () => {
  const requestId = 'razorpay-session-2'
  const model = createBookingModel(requestId)
  const client = createClient()
  const secret = 'test-secret'
  let referenceAllocations = 0
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: secret,
    bookingEnquiryModel: model,
    allocateReference: async () => {
      referenceAllocations += 1
      return '10812026501'
    },
  })
  await service.createOrder(requestId)

  const result = await service.verifyPayment(requestId, {
    razorpay_order_id: 'order_test_1',
    razorpay_payment_id: 'pay_test_1',
    razorpay_signature: signature('order_test_1', 'pay_test_1', secret),
  })

  assert.equal(client.paymentFetches.length, 1)
  assert.equal(result.booking.reference, '10812026501')
  assert.equal(result.booking.paymentStatus, 'paid')
  assert.equal(result.booking.paymentProvider, 'razorpay')
  assert.equal(result.booking.paymentReference, 'pay_test_1')
  assert.ok(result.booking.paymentVerifiedAt)
  assert.equal(referenceAllocations, 1)

  const duplicate = await service.verifyPayment(requestId, {
    razorpay_order_id: 'order_test_1',
    razorpay_payment_id: 'pay_test_1',
    razorpay_signature: signature('order_test_1', 'pay_test_1', secret),
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal(referenceAllocations, 1)
})

test('a signed captured-payment webhook finalizes once and accepts duplicate callbacks', async () => {
  const requestId = 'razorpay-webhook-session'
  const model = createBookingModel(requestId)
  const client = createClient()
  let references = 0
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
    allocateReference: async () => {
      references += 1
      return '10812026503'
    },
  })
  await service.createOrder(requestId)
  const payment = {
    id: 'pay_webhook',
    order_id: 'order_test_1',
    amount: 29900,
    currency: 'INR',
    status: 'captured',
  }

  const first = await service.handleWebhook('payment.captured', payment)
  const duplicate = await service.handleWebhook('payment.captured', payment)

  assert.equal(first.booking.reference, '10812026503')
  assert.equal(duplicate.duplicate, true)
  assert.equal(references, 1)

  const rawBody = Buffer.from('{"event":"payment.captured"}')
  const webhookSecret = 'razorpay-webhook-test'
  const webhookSignature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  assert.equal(isValidRazorpayWebhookSignature(rawBody, webhookSignature, webhookSecret), true)
  assert.equal(isValidRazorpayWebhookSignature(rawBody, webhookSignature, 'incorrect-secret'), false)
})

test('order.paid verifies captured payments and allocates one permanent reference', async () => {
  const requestId = 'razorpay-order-paid-session'
  const model = createBookingModel(requestId)
  const client = createClient({
    paymentsList: [{
      id: 'pay_order_paid',
      order_id: 'order_test_1',
      amount: 29900,
      currency: 'INR',
      status: 'captured',
    }],
  })
  let references = 0
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
    allocateReference: async () => {
      references += 1
      return '10812026504'
    },
  })
  await service.createOrder(requestId)

  const result = await service.handleWebhook('order.paid', undefined, {
    id: 'order_test_1',
  })

  assert.equal(result.booking.paymentStatus, 'paid')
  assert.equal(result.booking.reference, '10812026504')
  assert.equal(references, 1)
})

test('payment.failed webhook leaves the order retryable for a later captured attempt', async () => {
  const requestId = 'razorpay-failed-attempt-session'
  const model = createBookingModel(requestId)
  const client = createClient()
  let references = 0
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
    allocateReference: async () => {
      references += 1
      return '10812026505'
    },
  })
  await service.createOrder(requestId)

  const result = await service.handleWebhook('payment.failed', {
    id: 'pay_failed_attempt',
    order_id: 'order_test_1',
    amount: 29900,
    currency: 'INR',
    status: 'failed',
  })

  assert.equal(result.pending, true)
  assert.equal(model.record.paymentStatus, 'unpaid')
  assert.equal(model.record.reference ?? '', '')
  assert.equal(references, 0)
})

test('does not mark a payment failed while Razorpay reports an unresolved attempt', async () => {
  const requestId = 'razorpay-unresolved-session'
  const model = createBookingModel(requestId)
  const client = createClient({ paymentsList: [{
    id: 'pay_authorized',
    order_id: 'order_test_1',
    amount: 29900,
    currency: 'INR',
    status: 'authorized',
  }] })
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
  })
  const order = await service.createOrder(requestId)

  const result = await service.recordFailure(requestId, {
    orderId: order.order_id,
    outcome: 'cancelled',
  })

  assert.equal(result.pending, true)
  assert.equal(model.record.paymentStatus, 'unpaid')
  assert.equal(model.record.reference, undefined)
})

test('rejects invalid signatures without fetching or marking payment paid', async () => {
  const requestId = 'razorpay-session-3'
  const model = createBookingModel(requestId)
  const client = createClient()
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
    allocateReference: async () => '10812026501',
  })
  await service.createOrder(requestId)

  await assert.rejects(
    service.verifyPayment(requestId, {
      razorpay_order_id: 'order_test_1',
      razorpay_payment_id: 'pay_test_invalid',
      razorpay_signature: '0'.repeat(64),
    }),
    { status: 400 },
  )
  assert.equal(client.paymentFetches.length, 0)
  assert.equal(model.record.paymentStatus, 'unpaid')
  assert.equal(model.record.reference, undefined)
})

test('records a dismissed checkout as failed without assigning a reference and reuses its order', async () => {
  const requestId = 'razorpay-session-4'
  const model = createBookingModel(requestId)
  const client = createClient()
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
  })
  const order = await service.createOrder(requestId)
  const failure = await service.recordFailure(requestId, {
    orderId: order.order_id,
    outcome: 'cancelled',
  })
  const retry = await service.createOrder(requestId)

  assert.equal(failure.booking.paymentStatus, 'failed')
  assert.equal(failure.booking.reference, undefined)
  assert.equal(retry.order_id, order.order_id)
  assert.equal(client.createdOrders.length, 1)
})

test('maps Razorpay authentication failures to HTTP 401 without allocating a reference', async () => {
  const requestId = 'razorpay-session-5'
  const model = createBookingModel(requestId)
  const client = createClient()
  client.orders.create = async () => {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  }
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: 'test-secret',
    bookingEnquiryModel: model,
  })

  await assert.rejects(service.createOrder(requestId), { status: 401 })
  assert.equal(model.record.paymentStatus, 'unpaid')
  assert.equal(model.record.reference, undefined)
})

test('does not allocate a reference for authorized payments and recovers after capture', async () => {
  const requestId = 'razorpay-session-authorized'
  const model = createBookingModel(requestId)
  const client = createClient({ paymentStatus: 'authorized' })
  const secret = 'test-secret'
  let referenceAllocations = 0
  const service = createRazorpayPaymentService({
    client,
    keyId: 'rzp_test_public',
    keySecret: secret,
    bookingEnquiryModel: model,
    allocateReference: async () => {
      referenceAllocations += 1
      return '10812026502'
    },
  })
  await service.createOrder(requestId)
  const fields = {
    razorpay_order_id: 'order_test_1',
    razorpay_payment_id: 'pay_authorized',
    razorpay_signature: signature('order_test_1', 'pay_authorized', secret),
  }

  const authorization = await service.verifyPayment(requestId, fields)
  assert.equal(authorization.pending, true)
  assert.equal(model.record.reference, undefined)
  assert.equal(referenceAllocations, 0)

  const clientWithCapture = createClient({ paymentsList: [{
    id: 'pay_authorized',
    order_id: 'order_test_1',
    amount: 29900,
    currency: 'INR',
    status: 'captured',
  }] })
  const recoveryService = createRazorpayPaymentService({
    client: clientWithCapture,
    keyId: 'rzp_test_public',
    keySecret: secret,
    bookingEnquiryModel: model,
    allocateReference: async () => {
      referenceAllocations += 1
      return '10812026502'
    },
  })
  const recovered = await recoveryService.checkStatus(requestId)
  assert.equal(recovered.booking.paymentStatus, 'paid')
  assert.equal(recovered.booking.reference, '10812026502')
  assert.equal(referenceAllocations, 1)
})