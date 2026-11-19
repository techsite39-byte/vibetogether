import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import { BookingEnquiry } from '../src/models/bookingEnquiry.js'
import { BookingResult } from '../src/models/bookingResult.js'
import { UnmatchedCashfreePayment } from '../src/models/unmatchedCashfreePayment.js'
import { createCashfreePaymentService } from '../src/services/cashfreePayments.js'
import { createCashfreeRecoveryService } from '../src/services/cashfreeRecovery.js'

const webhookSecret = 'cashfree-recovery-test-secret'
const admin = { id: 'admin-1', role: 'super_admin' }
const validVerification = {
  verified: true,
  providerOrderId: 'order-1',
  providerPaymentId: 'payment-1',
  amount: 249,
  currency: 'INR',
  providerStatus: 'SUCCESS',
}

it('declares unique provider-payment indexes for unmatched events and reconciled bookings', () => {
  const hasUniqueIndex = (schema, field) => schema.indexes().some(([keys, options]) =>
    keys[field] === 1 && options.unique === true,
  )

  assert.equal(UnmatchedCashfreePayment.collection.collectionName, 'cashfree-unmatched-payments')
  assert.equal(hasUniqueIndex(UnmatchedCashfreePayment.schema, 'providerPaymentId'), true)
  assert.equal(hasUniqueIndex(BookingEnquiry.schema, 'cfPaymentId'), true)
  assert.equal(hasUniqueIndex(BookingResult.schema, 'providerPaymentId'), true)
})

function createQuery(resolve) {
  let session
  let limit
  const query = {
    session(value) {
      session = value
      return this
    },
    limit(value) {
      limit = value
      return this
    },
    lean() {
      return this
    },
    async exec() {
      const value = await resolve(session)
      return Array.isArray(value) && limit ? value.slice(0, limit) : value
    },
    then(resolveValue, rejectValue) {
      return this.exec().then(resolveValue, rejectValue)
    },
  }
  return query
}

function createRecoveryHarness({
  eventOverrides = {},
  bookingOverrides = {},
  extraBookings = [],
  existingResult = null,
  extraResults = [],
  failBookingSave = false,
  failResultWrite = false,
  failEventWrite = false,
  failAuditWrite = false,
  verification = validVerification,
  verificationError = null,
  onVerification,
} = {}) {
  const initialEvent = {
    _id: 'event-1',
    providerOrderId: 'order-1',
    providerPaymentId: 'payment-1',
    amount: 249,
    currency: 'INR',
    providerStatus: 'SUCCESS',
    providerEventType: 'PAYMENT_SUCCESS_WEBHOOK',
    processingStatus: 'unmatched',
    ...eventOverrides,
  }
  const initialBooking = {
    _id: 'booking-1',
    requestId: 'request-1',
    name: 'Test Attendee',
    mobile: '9876543210',
    email: 'attendee@example.test',
    event: 'Test Event',
    ticketQuantity: 1,
    paymentAmount: 249,
    paymentStatus: 'unpaid',
    paymentProvider: 'cashfree',
    paymentOrderId: 'order-1',
    paymentOrders: [{ orderId: 'order-1', amount: 249, status: 'created', paymentId: '' }],
    status: 'pending',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-01-08T00:00:00.000Z'),
    ...bookingOverrides,
  }
  let state = {
    event: { ...initialEvent },
    booking: { ...initialBooking, paymentOrders: initialBooking.paymentOrders.map((entry) => ({ ...entry })) },
    extraBookings: extraBookings.map((entry) => ({ ...entry })),
    result: existingResult ? { ...existingResult } : null,
    extraResults: extraResults.map((entry) => ({ ...entry })),
    logs: [],
  }
  let transactionTail = Promise.resolve()

  const sessionFactory = async () => {
    const session = {
      state: null,
      async withTransaction(callback) {
        const previousTransaction = transactionTail
        let releaseTransaction
        transactionTail = new Promise((resolve) => {
          releaseTransaction = resolve
        })
        await previousTransaction
        const staged = {
          event: { ...state.event },
          booking: { ...state.booking, paymentOrders: state.booking.paymentOrders.map((entry) => ({ ...entry })) },
          extraBookings: state.extraBookings.map((entry) => ({ ...entry })),
          result: state.result ? { ...state.result } : null,
          extraResults: state.extraResults.map((entry) => ({ ...entry })),
          logs: [...state.logs],
        }
        this.state = staged
        try {
          const result = await callback()
          state = staged
          return result
        } finally {
          this.state = null
          releaseTransaction()
        }
      },
      async endSession() {},
    }
    return session
  }

  const transactionState = (session) => session?.state ?? state
  const unmatchedPaymentModel = {
    findById(id) {
      return createQuery((session) => {
        const current = transactionState(session).event
        return String(current._id) === String(id) ? { ...current } : null
      })
    },
    async updateOne(_filter, update, options = {}) {
      if (failEventWrite) throw new Error('injected unmatched event persistence failure')
      const target = transactionState(options.session).event
      Object.assign(target, update.$set)
      return { matchedCount: 1, modifiedCount: 1 }
    },
  }

  const bookingEnquiryModel = {
    find(filter) {
      return createQuery((session) => {
        const current = transactionState(session)
        const records = [current.booking, ...current.extraBookings]
        if (filter.$or?.some((part) => part.paymentOrderId)) {
          return records.filter((booking) =>
            filter.$or.some((part) =>
              part.paymentOrderId
                ? String(booking.paymentOrderId) === String(part.paymentOrderId)
                : booking.paymentOrders?.some((entry) =>
                    String(entry.orderId) === String(part['paymentOrders.orderId']),
                  ),
            ),
          )
        }
        if (filter.$or?.some((part) => part.cfPaymentId || part['paymentOrders.paymentId'])) {
          return records.filter((booking) =>
            filter.$or.some((part) =>
              part.cfPaymentId
                ? String(booking.cfPaymentId ?? '') === String(part.cfPaymentId)
                : booking.paymentOrders?.some((entry) =>
                    String(entry.paymentId) === String(part['paymentOrders.paymentId']),
                  ),
            ),
          )
        }
        return []
      })
    },
    findOne({ requestId }) {
      return createQuery((session) => {
        const target = transactionState(session).booking
        if (String(target.requestId) !== String(requestId)) return null
        const document = {
          ...target,
          paymentOrders: target.paymentOrders.map((entry) => ({ ...entry })),
          set(path, value) {
            if (value === undefined) delete this[path]
            else this[path] = value
          },
          async save(options = {}) {
            if (failBookingSave) throw new Error('injected booking persistence failure')
            const current = transactionState(options.session)
            const persisted = { ...this }
            delete persisted.set
            delete persisted.save
            current.booking = {
              ...persisted,
              paymentOrders: persisted.paymentOrders.map((entry) => ({ ...entry })),
            }
            return this
          },
        }
        return document
      })
    },
  }

  const bookingResultModel = {
    find(filter) {
      return createQuery((session) => {
        const current = transactionState(session)
        const records = [current.result, ...current.extraResults].filter(Boolean)
        return records.filter((record) =>
          (!filter.paymentProvider || record.paymentProvider === filter.paymentProvider) &&
          (!filter.$or || filter.$or.some((part) =>
            Object.entries(part).some(([field, value]) => record[field] === value),
          )),
        )
      })
    },
    findOneAndUpdate(filter, update, options = {}) {
      return createQuery((session) => {
        if (failResultWrite) throw new Error('injected booking result persistence failure')
        const current = transactionState(options.session ?? session)
        if (current.result && current.result.requestId !== filter.requestId) return null
        const result = current.result ?? {
          ...(update.$setOnInsert ?? {}),
        }
        Object.assign(result, update.$set ?? {})
        for (const key of Object.keys(update.$unset ?? {})) delete result[key]
        current.result = result
        return result
      })
    },
    findOne({ requestId }) {
      return createQuery((session) => {
        const current = transactionState(session)
        const records = [current.result, ...current.extraResults].filter(Boolean)
        return records.find((record) => String(record.requestId) === String(requestId)) ?? null
      })
    },
  }

  const activityLogModel = {
    async create(entries, options = {}) {
      if (failAuditWrite) throw new Error('injected admin audit persistence failure')
      transactionState(options.session).logs.push(...entries)
      return entries
    },
  }
  let verificationCalls = 0
  const payments = {
    async verifyUnmatchedPayment() {
      verificationCalls += 1
      if (verificationError) throw verificationError
      await onVerification?.(state)
      return verification
    },
  }
  const recovery = createCashfreeRecoveryService({
    payments,
    bookingEnquiryModel,
    bookingResultModel,
    unmatchedPaymentModel,
    activityLogModel,
    sessionFactory,
    allocateReference: async () => '10812026501',
    now: () => new Date('2026-02-01T12:00:00.000Z'),
  })

  return {
    recovery,
    get state() {
      return state
    },
    get verificationCalls() {
      return verificationCalls
    },
  }
}

function reconciliationInput(overrides = {}) {
  return {
    eventId: 'event-1',
    requestId: 'request-1',
    actor: admin,
    caseReference: 'CASE-1234',
    reasonCode: 'unmatched_webhook',
    ...overrides,
  }
}

describe('Cashfree unmatched payment persistence', () => {
  it('durably records an unmatched successful webhook without retaining its payload', async () => {
    const records = new Map()
    const unmatchedPaymentModel = {
      async findOne({ providerPaymentId }) {
        return records.get(providerPaymentId) ?? null
      },
      async create(record) {
        records.set(record.providerPaymentId, { ...record })
      },
      async updateOne({ _id }, update) {
        const record = [...records.values()].find((item) => item._id === _id)
        Object.assign(record, update.$set)
        return { acknowledged: true, matchedCount: 1 }
      },
    }
    const paymentService = createCashfreePaymentService({
      appId: 'test-app',
      secretKey: webhookSecret,
      unmatchedPaymentModel,
      bookingEnquiryModel: { async findOne() { return null } },
      fetchFn: async () => { throw new Error('Unexpected provider request') },
    })
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      event_time: '2026-01-01T00:00:00.000Z',
      data: {
        order: { order_id: 'order-unmatched-1', order_currency: 'INR' },
        payment: {
          order_id: 'order-unmatched-1',
          cf_payment_id: 'payment-unmatched-1',
          payment_status: 'SUCCESS',
          payment_amount: 249,
          payment_currency: 'INR',
          customer_name: 'Fake Customer Name',
          customer_phone: '+1-202-555-0101',
          customer_email: 'private@example.test',
          event_name: 'Private Event Name',
          booking_reference: 'PRIVATE-REF-123',
          access_token: 'private-token',
        },
      },
    }
    const rawBody = JSON.stringify(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', webhookSecret)
      .update(timestamp + rawBody)
      .digest('base64')
    const logs = []
    const originalWarn = console.warn
    console.warn = (...args) => logs.push(args)
    let result
    try {
      result = await paymentService.handleWebhook(payload, signature, timestamp, rawBody)
    } finally {
      console.warn = originalWarn
    }
    assert.equal(result.unmatchedRecorded, true)
    assert.equal(records.size, 1)

    const stored = records.get('payment-unmatched-1')
    assert.deepEqual(Object.keys(stored).sort(), [
      'amount',
      'currency',
      'eventTime',
      'lastSeenAt',
      'processingStatus',
      'providerEventType',
      'providerOrderId',
      'providerPaymentId',
      'providerStatus',
      'receivedAt',
    ].sort())
    const serialized = JSON.stringify(stored)
    for (const sensitiveValue of [
      'Fake Customer Name',
      '+1-202-555-0101',
      'private@example.test',
      'Private Event Name',
      'PRIVATE-REF-123',
      'private-token',
    ]) {
      assert.equal(serialized.includes(sensitiveValue), false)
    }
    const serializedLogs = JSON.stringify(logs)
    for (const sensitiveValue of [
      'Fake Customer Name',
      '+1-202-555-0101',
      'private@example.test',
      'Private Event Name',
      'PRIVATE-REF-123',
      'private-token',
      'order-unmatched-1',
      'payment-unmatched-1',
    ]) {
      assert.equal(serializedLogs.includes(sensitiveValue), false)
    }
  })

  it('durably records successful webhooks matched to bookings when order, amount, or currency conflicts', async () => {
    for (const mismatch of [
      { payment_amount: 250, payment_currency: 'INR', order_id: 'matched-order' },
      { payment_amount: 249, payment_currency: 'USD', order_id: 'matched-order' },
      { payment_amount: 249, payment_currency: 'INR', order_id: 'different-provider-order' },
    ]) {
      const records = new Map()
      const booking = {
        requestId: 'request-mismatch',
        paymentStatus: 'unpaid',
        paymentProvider: 'cashfree',
        paymentOrderId: 'matched-order',
        paymentAmount: 249,
        paymentOrders: [{ orderId: 'matched-order', amount: 249, status: 'created', paymentId: '' }],
        async save() {},
      }
      const service = createCashfreePaymentService({
        appId: 'test-app',
        secretKey: webhookSecret,
        bookingEnquiryModel: { async findOne() { return booking } },
        unmatchedPaymentModel: {
          async findOne({ providerPaymentId }) {
            return records.get(providerPaymentId) ?? null
          },
          async create(record) {
            records.set(record.providerPaymentId, { ...record })
          },
        },
        fetchFn: async () => { throw new Error('Unexpected provider request') },
      })
      const payload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: '2026-01-01T00:00:00.000Z',
        data: {
          order: { order_id: 'matched-order', order_currency: 'INR' },
          payment: {
            cf_payment_id: 'payment-mismatch',
            payment_status: 'SUCCESS',
            ...mismatch,
          },
        },
      }
      const rawBody = JSON.stringify(payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = createHmac('sha256', webhookSecret)
        .update(timestamp + rawBody)
        .digest('base64')

      const result = await service.handleWebhook(payload, signature, timestamp, rawBody)

      assert.equal(result.unmatchedRecorded, true)
      assert.equal(records.size, 1)
      assert.equal(booking.paymentStatus, 'unpaid')
    }
  })

  it('does not acknowledge successful webhooks that lack stable provider identifiers', async () => {
    for (const data of [
      {
        order: { order_id: 'order-without-payment-id' },
        payment: { payment_status: 'SUCCESS', payment_amount: 249, payment_currency: 'INR' },
      },
      {
        order: {},
        payment: {
          cf_payment_id: 'payment-without-order-id',
          payment_status: 'SUCCESS',
          payment_amount: 249,
          payment_currency: 'INR',
        },
      },
    ]) {
      let writes = 0
      const service = createCashfreePaymentService({
        appId: 'test-app',
        secretKey: webhookSecret,
        bookingEnquiryModel: { async findOne() { return null } },
        unmatchedPaymentModel: {
          async findOne() { return null },
          async create() { writes += 1 },
        },
      })
      const payload = { type: 'PAYMENT_SUCCESS_WEBHOOK', data }
      const rawBody = JSON.stringify(payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = createHmac('sha256', webhookSecret)
        .update(timestamp + rawBody)
        .digest('base64')

      await assert.rejects(
        service.handleWebhook(payload, signature, timestamp, rawBody),
        (error) => error.status === 503,
      )
      assert.equal(writes, 0)
    }
  })

  it('deduplicates repeated unmatched webhooks by provider payment ID', async () => {
    const records = new Map()
    const unmatchedPaymentModel = {
      async findOne({ providerPaymentId }) {
        return records.get(providerPaymentId) ?? null
      },
      async create(record) {
        records.set(record.providerPaymentId, { _id: 'unmatched-1', ...record })
      },
      async updateOne({ _id }, update) {
        const record = [...records.values()].find((item) => item._id === _id)
        Object.assign(record, update.$set)
        return { acknowledged: true, matchedCount: 1 }
      },
    }
    const paymentService = createCashfreePaymentService({
      appId: 'test-app',
      secretKey: webhookSecret,
      unmatchedPaymentModel,
      bookingEnquiryModel: { async findOne() { return null } },
      fetchFn: async () => { throw new Error('Unexpected provider request') },
    })
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order-unmatched-2' },
        payment: {
          cf_payment_id: 'payment-unmatched-2',
          payment_status: 'SUCCESS',
          payment_amount: 249,
          payment_currency: 'INR',
        },
      },
    }
    const rawBody = JSON.stringify(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', webhookSecret)
      .update(timestamp + rawBody)
      .digest('base64')

    await paymentService.handleWebhook(payload, signature, timestamp, rawBody)
    const duplicate = await paymentService.handleWebhook(payload, signature, timestamp, rawBody)
    assert.equal(duplicate.duplicate, true)
    assert.equal(records.size, 1)
  })

  it('marks conflicting duplicate metadata for review without replacing the original evidence', async () => {
    const records = new Map()
    const unmatchedPaymentModel = {
      async findOne({ providerPaymentId }) {
        return records.get(providerPaymentId) ?? null
      },
      async create(record) {
        records.set(record.providerPaymentId, { _id: 'unmatched-1', ...record })
      },
      async updateOne({ _id }, update) {
        const record = [...records.values()].find((item) => item._id === _id)
        Object.assign(record, update.$set)
        return { acknowledged: true, matchedCount: 1 }
      },
    }
    const paymentService = createCashfreePaymentService({
      appId: 'test-app',
      secretKey: webhookSecret,
      unmatchedPaymentModel,
      bookingEnquiryModel: { async findOne() { return null } },
      fetchFn: async () => { throw new Error('Unexpected provider request') },
    })
    const makeEvent = (orderId, amount) => ({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: orderId },
        payment: {
          order_id: orderId,
          cf_payment_id: 'payment-conflict',
          payment_status: 'SUCCESS',
          payment_amount: amount,
          payment_currency: 'INR',
        },
      },
    })
    const deliver = async (payload) => {
      const rawBody = JSON.stringify(payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = createHmac('sha256', webhookSecret)
        .update(timestamp + rawBody)
        .digest('base64')
      return paymentService.handleWebhook(payload, signature, timestamp, rawBody)
    }

    await deliver(makeEvent('order-original', 249))
    const duplicate = await deliver(makeEvent('order-conflicting', 250))
    const stored = records.get('payment-conflict')

    assert.equal(duplicate.reviewRequired, true)
    assert.equal(stored.processingStatus, 'review_required')
    assert.equal(stored.reconciliationOutcome, 'duplicate_metadata_mismatch')
    assert.equal(stored.providerOrderId, 'order-original')
    assert.equal(stored.amount, 249)

    stored.processingStatus = 'reconciled'
    await deliver(makeEvent('order-after-reconciliation', 251))
    assert.equal(stored.processingStatus, 'review_required')
    assert.equal(stored.reconciliationOutcome, 'duplicate_metadata_mismatch_after_reconciliation')
    assert.equal(stored.providerOrderId, 'order-original')
    assert.equal(stored.amount, 249)
  })

  it('returns a retryable error when duplicate persistence cannot be confirmed', async () => {
    const records = new Map()
    let updateResult = { acknowledged: true, matchedCount: 1 }
    const unmatchedPaymentModel = {
      async findOne({ providerPaymentId }) {
        return records.get(providerPaymentId) ?? null
      },
      async create(record) {
        records.set(record.providerPaymentId, { _id: 'unmatched-1', ...record })
      },
      async updateOne() {
        return updateResult
      },
    }
    const paymentService = createCashfreePaymentService({
      appId: 'test-app',
      secretKey: webhookSecret,
      unmatchedPaymentModel,
      bookingEnquiryModel: { async findOne() { return null } },
      fetchFn: async () => { throw new Error('Unexpected provider request') },
    })
    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'order-retry' },
        payment: {
          cf_payment_id: 'payment-retry',
          payment_status: 'SUCCESS',
          payment_amount: 249,
          payment_currency: 'INR',
        },
      },
    }
    const rawBody = JSON.stringify(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', webhookSecret)
      .update(timestamp + rawBody)
      .digest('base64')
    await paymentService.handleWebhook(payload, signature, timestamp, rawBody)

    updateResult = { acknowledged: true, matchedCount: 0 }
    await assert.rejects(
      paymentService.handleWebhook(payload, signature, timestamp, rawBody),
      (error) => error.status === 503,
    )
  })

  it('verifies exact payment identity and amount, and fails closed for refunds or reversals', async () => {
    const makeService = (payment, refunds = []) => createCashfreePaymentService({
      appId: 'test-app',
      secretKey: 'test-secret',
      fetchFn: async (url) => ({
        ok: true,
        json: async () => url.endsWith('/refunds') ? refunds : [payment],
      }),
    })
    const payment = {
      order_id: 'order-1',
      cf_payment_id: 'payment-1',
      payment_status: 'SUCCESS',
      payment_amount: 249,
      payment_currency: 'INR',
    }

    const valid = await makeService(payment).verifyUnmatchedPayment({
      providerOrderId: 'order-1',
      providerPaymentId: 'payment-1',
      expectedAmount: 249,
      currency: 'INR',
    })
    assert.equal(valid.verified, true)

    for (const [invalidPayment, refunds, reasonCode] of [
      [{ ...payment, cf_payment_id: 'wrong-payment' }, [], 'provider_payment_not_found'],
      [{ ...payment, order_id: undefined }, [], 'provider_order_mismatch'],
      [{ ...payment, order_id: 'wrong-order' }, [], 'provider_order_mismatch'],
      [{ ...payment, payment_status: 'PENDING' }, [], 'provider_payment_not_successful'],
      [{ ...payment, payment_amount: 250 }, [], 'provider_amount_or_currency_mismatch'],
      [{ ...payment, payment_currency: 'USD' }, [], 'provider_amount_or_currency_mismatch'],
      [{ ...payment, reversal_status: 'REVERSED' }, [], 'provider_payment_reversed'],
      [payment, [{ refund_status: 'SUCCESS' }], 'provider_payment_refunded'],
    ]) {
      const result = await makeService(invalidPayment, refunds).verifyUnmatchedPayment({
        providerOrderId: 'order-1',
        providerPaymentId: 'payment-1',
        expectedAmount: 249,
        currency: 'INR',
      })
      assert.equal(result.verified, false)
      assert.equal(result.reasonCode, reasonCode)
    }

    const duplicatePaymentId = await createCashfreePaymentService({
      appId: 'test-app',
      secretKey: 'test-secret',
      fetchFn: async (url) => ({
        ok: true,
        json: async () => url.endsWith('/refunds') ? [] : [payment, payment],
      }),
    }).verifyUnmatchedPayment({
      providerOrderId: 'order-1',
      providerPaymentId: 'payment-1',
      expectedAmount: 249,
      currency: 'INR',
    })
    assert.deepEqual(duplicatePaymentId, {
      verified: false,
      reasonCode: 'provider_payment_ambiguous',
    })

    const calls = []
    const serviceUnavailable = createCashfreePaymentService({
      appId: 'test-app',
      secretKey: 'test-secret',
      fetchFn: async (url) => {
        calls.push(url)
        if (url.endsWith('/refunds')) throw new Error('provider unavailable')
        return { ok: true, json: async () => [payment] }
      },
    })
    await assert.rejects(
      serviceUnavailable.verifyUnmatchedPayment({
        providerOrderId: 'order-1',
        providerPaymentId: 'payment-1',
        expectedAmount: 249,
        currency: 'INR',
      }),
      (error) => error.status === 503,
    )
    assert.equal(calls.length, 2)
    assert.ok(calls[0].endsWith('/orders/order-1/payments'))
    assert.ok(calls[1].endsWith('/orders/order-1/refunds'))
  })
})

describe('Cashfree unmatched payment reconciliation', () => {
  it('atomically reconciles verified payment, both booking records, TTL, and admin audit', async () => {
    const harness = createRecoveryHarness()
    const result = await harness.recovery.reconcile(reconciliationInput())

    assert.equal(result.reconciled, true)
    assert.equal(result.reference, '10812026501')
    assert.equal(harness.state.booking.paymentStatus, 'paid')
    assert.equal(harness.state.booking.status, 'confirmed')
    assert.equal(harness.state.booking.cfPaymentId, 'payment-1')
    assert.equal(harness.state.booking.paymentOrders[0].status, 'paid')
    assert.equal('expiresAt' in harness.state.booking, false)
    assert.equal(harness.state.result.paymentStatus, 'paid')
    assert.equal(harness.state.result.providerPaymentId, 'payment-1')
    assert.equal('expiresAt' in harness.state.result, false)
    assert.equal(harness.state.event.processingStatus, 'reconciled')
    assert.equal(harness.state.event.reconciledBy, admin.id)
    assert.equal(harness.state.event.caseReference, 'CASE-1234')
    assert.equal(harness.state.logs[0].actorId, admin.id)
    assert.match(harness.state.logs[0].description, /CASE-1234/)
  })

  it('rejects mismatched provider identifiers or evidence without changing the booking', async () => {
    for (const verification of [
      { ...validVerification, providerOrderId: 'other-order' },
      { ...validVerification, providerPaymentId: 'other-payment' },
      { ...validVerification, verified: false, reasonCode: 'provider_amount_or_currency_mismatch' },
    ]) {
      const harness = createRecoveryHarness({ verification })
      const result = await harness.recovery.reconcile(reconciliationInput())
      assert.equal(result.reconciled, false)
      assert.equal(harness.state.booking.paymentStatus, 'unpaid')
      assert.equal(harness.state.event.processingStatus, 'reconciliation_failed')
    }
  })

  it('audits provider verification failures without exposing provider error details', async () => {
    const harness = createRecoveryHarness({
      verificationError: new Error('private order/payment response details'),
    })
    await assert.rejects(harness.recovery.reconcile(reconciliationInput()), /private order/)
    assert.equal(harness.state.booking.paymentStatus, 'unpaid')
    assert.equal(harness.state.event.lastAttemptOutcome, 'provider_verification_unavailable')
    assert.equal(harness.state.logs[0].actorId, admin.id)
    assert.match(harness.state.logs[0].description, /CASE-1234/)
    assert.equal(JSON.stringify(harness.state.logs).includes('private order'), false)
  })

  it('rejects non-success, refunded, and reversed webhook payment statuses', async () => {
    for (const providerStatus of ['FAILED', 'PENDING', 'REFUNDED', 'REVERSED']) {
      const harness = createRecoveryHarness({ eventOverrides: { providerStatus } })
      const result = await harness.recovery.reconcile(reconciliationInput())
      assert.equal(result.reconciled, false)
      assert.equal(result.outcome, 'provider_event_not_successful')
      assert.equal(harness.verificationCalls, 0)
      assert.equal(harness.state.booking.paymentStatus, 'unpaid')
    }

    const reversalEvent = createRecoveryHarness({
      eventOverrides: { providerEventType: 'PAYMENT_REVERSED_WEBHOOK' },
    })
    const reversalResult = await reversalEvent.recovery.reconcile(reconciliationInput())
    assert.equal(reversalResult.outcome, 'provider_event_not_successful')
    assert.equal(reversalEvent.verificationCalls, 0)
  })

  it('does not fabricate or update a missing or ambiguous booking', async () => {
    const missing = createRecoveryHarness({
      bookingOverrides: { paymentOrderId: 'different-order', paymentOrders: [] },
    })
    const missingResult = await missing.recovery.reconcile(reconciliationInput())
    assert.equal(missingResult.outcome, 'booking_not_found')
    assert.equal(missing.state.booking.paymentStatus, 'unpaid')

    const ambiguous = createRecoveryHarness({
      extraBookings: [{
        _id: 'booking-2',
        requestId: 'request-2',
        paymentOrderId: 'order-1',
        paymentOrders: [],
      }],
    })
    const ambiguousResult = await ambiguous.recovery.reconcile(reconciliationInput())
    assert.equal(ambiguousResult.outcome, 'booking_identity_ambiguous')
    assert.equal(ambiguous.state.booking.paymentStatus, 'unpaid')
    assert.equal(ambiguous.state.extraBookings[0].paymentStatus, undefined)

    const wrongIdentity = createRecoveryHarness()
    const wrongIdentityResult = await wrongIdentity.recovery.reconcile(
      reconciliationInput({ requestId: 'another-request' }),
    )
    assert.equal(wrongIdentityResult.outcome, 'booking_identity_mismatch')
    assert.equal(wrongIdentity.state.booking.paymentStatus, 'unpaid')
  })

  it('rejects duplicate payments, amount mismatches, and demo or refunded bookings', async () => {
    const duplicate = createRecoveryHarness({
      extraBookings: [{
        _id: 'booking-2',
        requestId: 'request-2',
        cfPaymentId: 'payment-1',
        paymentOrders: [],
      }],
    })
    const duplicateResult = await duplicate.recovery.reconcile(reconciliationInput())
    assert.equal(duplicateResult.outcome, 'duplicate_payment')
    assert.equal(duplicate.state.booking.paymentStatus, 'unpaid')

    const amountMismatch = createRecoveryHarness({
      bookingOverrides: {
        paymentAmount: 250,
        paymentOrders: [{ orderId: 'order-1', amount: 250, status: 'created', paymentId: '' }],
      },
    })
    const amountResult = await amountMismatch.recovery.reconcile(reconciliationInput())
    assert.equal(amountResult.outcome, 'booking_payment_mismatch')
    assert.equal(amountMismatch.state.booking.paymentStatus, 'unpaid')

    for (const paymentStatus of ['demo_paid', 'refunded']) {
      const ineligible = createRecoveryHarness({ bookingOverrides: { paymentStatus } })
      const result = await ineligible.recovery.reconcile(reconciliationInput())
      assert.equal(result.reconciled, false)
      assert.equal(result.outcome, 'booking_not_eligible')
      assert.equal(ineligible.state.booking.paymentStatus, paymentStatus)
      assert.equal(ineligible.state.event.lastAttemptOutcome, 'booking_not_eligible')
      assert.equal(ineligible.state.logs[0].actorId, admin.id)
      assert.match(ineligible.state.logs[0].description, /CASE-1234/)
    }
  })

  it('rejects conflicting same-request result and payment-order records', async () => {
    const conflictingResult = createRecoveryHarness({
      existingResult: {
        requestId: 'request-1',
        paymentStatus: 'paid',
        paymentProvider: 'cashfree',
        providerPaymentId: 'different-payment',
        providerOrderId: 'order-1',
        amount: 249,
        currency: 'INR',
      },
    })
    const resultConflict = await conflictingResult.recovery.reconcile(reconciliationInput())
    assert.equal(resultConflict.outcome, 'duplicate_payment')
    assert.equal(conflictingResult.state.booking.paymentStatus, 'unpaid')

    const conflictingPaidOrder = createRecoveryHarness({
      bookingOverrides: {
        paymentOrders: [
          { orderId: 'order-1', amount: 249, status: 'created', paymentId: '' },
          { orderId: 'another-order', amount: 249, status: 'paid', paymentId: 'another-payment' },
        ],
      },
    })
    const orderConflict = await conflictingPaidOrder.recovery.reconcile(reconciliationInput())
    assert.equal(orderConflict.outcome, 'booking_payment_mismatch')
    assert.equal(conflictingPaidOrder.state.booking.paymentStatus, 'unpaid')

    const reusedPaymentId = createRecoveryHarness({
      bookingOverrides: {
        paymentOrders: [
          { orderId: 'order-1', amount: 249, status: 'created', paymentId: '' },
          { orderId: 'another-order', amount: 249, status: 'failed', paymentId: 'payment-1' },
        ],
      },
    })
    const reusedPaymentConflict = await reusedPaymentId.recovery.reconcile(reconciliationInput())
    assert.equal(reusedPaymentConflict.outcome, 'duplicate_payment')
    assert.equal(reusedPaymentId.state.booking.paymentStatus, 'unpaid')
  })

  it('rejects payment identity ownership in paymentOrders and either result identity field', async () => {
    const cases = [
      {
        extraBookings: [{
          _id: 'booking-2',
          requestId: 'request-2',
          paymentOrderId: 'different-order',
          paymentOrders: [{ orderId: 'different-order', paymentId: 'payment-1' }],
        }],
      },
      {
        extraResults: [{
          requestId: 'request-2',
          paymentProvider: 'cashfree',
          providerPaymentId: 'payment-1',
          providerOrderId: 'different-order',
        }],
      },
      {
        extraResults: [{
          requestId: 'request-2',
          paymentProvider: 'cashfree',
          providerPaymentId: 'different-payment',
          providerOrderId: 'order-1',
        }],
      },
    ]

    for (const options of cases) {
      const harness = createRecoveryHarness(options)
      const result = await harness.recovery.reconcile(reconciliationInput())
      assert.equal(result.reconciled, false)
      assert.equal(result.outcome, 'duplicate_payment')
      assert.equal(harness.state.booking.paymentStatus, 'unpaid')
    }
  })

  it('rejects a provider event changed after independent verification', async () => {
    const harness = createRecoveryHarness({
      onVerification(state) {
        state.event.providerEventType = 'PAYMENT_REVERSED_WEBHOOK'
      },
    })
    const result = await harness.recovery.reconcile(reconciliationInput())

    assert.equal(result.reconciled, false)
    assert.equal(result.outcome, 'payment_changed_during_verification')
    assert.equal(harness.state.booking.paymentStatus, 'unpaid')
    assert.equal(harness.state.event.processingStatus, 'reconciliation_failed')
  })

  it('audits paid-booking conflicts and attempts against another reconciliation', async () => {
    const paidConflict = createRecoveryHarness({
      bookingOverrides: {
        paymentStatus: 'paid',
        cfPaymentId: 'different-payment',
        paymentOrderId: 'order-1',
        reference: '10812026502',
      },
    })
    const paidResult = await paidConflict.recovery.reconcile(reconciliationInput())
    assert.equal(paidResult.outcome, 'paid_booking_conflict')
    assert.equal(paidConflict.state.booking.paymentStatus, 'paid')
    assert.equal(paidConflict.state.event.lastAttemptOutcome, 'paid_booking_conflict')
    assert.equal(paidConflict.state.logs[0].actorId, admin.id)

    const alreadyReconciled = createRecoveryHarness({
      eventOverrides: {
        processingStatus: 'reconciled',
        matchedRequestId: 'another-request',
      },
    })
    const conflictResult = await alreadyReconciled.recovery.reconcile(reconciliationInput())
    assert.equal(conflictResult.outcome, 'already_reconciled_conflict')
    assert.equal(alreadyReconciled.state.event.processingStatus, 'reconciled')
    assert.equal(alreadyReconciled.state.event.lastAttemptOutcome, 'already_reconciled_conflict')
    assert.equal(alreadyReconciled.state.logs[0].actorId, admin.id)
  })

  it('rolls back booking, result, and audit writes when any persistence step fails', async () => {
    for (const options of [
      { failBookingSave: true },
      { failResultWrite: true },
      { failEventWrite: true },
      { failAuditWrite: true },
    ]) {
      const harness = createRecoveryHarness(options)
      await assert.rejects(harness.recovery.reconcile(reconciliationInput()))
      assert.equal(harness.state.booking.paymentStatus, 'unpaid')
      assert.equal(harness.state.result, null)
      assert.equal(harness.state.event.processingStatus, 'unmatched')
      assert.equal(harness.state.logs.length, 0)
    }
  })

  it('is idempotent on a repeated reconciliation and records the actor and case', async () => {
    const harness = createRecoveryHarness()
    await harness.recovery.reconcile(reconciliationInput())
    const repeated = await harness.recovery.reconcile(reconciliationInput())

    assert.equal(repeated.duplicate, true)
    assert.equal(repeated.outcome, 'already_reconciled')
    assert.equal(harness.verificationCalls, 1)
    assert.equal(harness.state.logs.length, 1)
  })

  it('serializes concurrent reconciliation attempts without duplicate payment or audit records', async () => {
    const harness = createRecoveryHarness()
    const results = await Promise.all([
      harness.recovery.reconcile(reconciliationInput()),
      harness.recovery.reconcile(reconciliationInput()),
    ])

    assert.deepEqual(
      results.map((result) => result.outcome).sort(),
      ['already_reconciled', 'reconciled'],
    )
    assert.equal(harness.state.booking.paymentStatus, 'paid')
    assert.equal(harness.state.result.providerPaymentId, 'payment-1')
    assert.equal(harness.state.logs.length, 1)
  })

  it('fails closed without transaction support before writing payment state', async () => {
    const harness = createRecoveryHarness()
    harness.recovery = createCashfreeRecoveryService({
      payments: { async verifyUnmatchedPayment() { return validVerification } },
      bookingEnquiryModel: {
        find() { return createQuery(() => [harness.state.booking]) },
        findOne() { return createQuery(() => harness.state.booking) },
      },
      unmatchedPaymentModel: {
        findById() { return createQuery(() => harness.state.event) },
      },
      sessionFactory: async () => ({
        async withTransaction() {
          throw new Error('Transaction numbers are only allowed on a replica set member or mongos')
        },
        async endSession() {},
      }),
    })
    await assert.rejects(
      harness.recovery.reconcile(reconciliationInput()),
      /requires MongoDB transaction support/,
    )
    assert.equal(harness.state.booking.paymentStatus, 'unpaid')
  })
})
