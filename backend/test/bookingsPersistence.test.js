import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import { test } from 'node:test'
import { Booking } from '../src/models/adminRecords.js'
import { BookingEnquiry } from '../src/models/bookingEnquiry.js'
import { saveBookingEnquiry, findBookingEnquiry } from '../src/services/bookingEnquiries.js'
import { createCashfreePaymentService } from '../src/services/cashfreePayments.js'
import { migrateBookings } from '../scripts/migrateBookingsToBookingsDb.js'
import { mergeBookingRecords } from '../src/routes/admin.js'
import { createMockBookingResultModel } from './bookingResultMocks.js'

function createInMemoryBookingEnquiryModel(initialRecords = []) {
  const records = new Map(initialRecords.map((r) => [r.requestId, { ...r }]))

  function matches(doc, condition) {
    if (condition.$or) return condition.$or.some((entry) => matches(doc, entry))
    return Object.entries(condition).every(([key, value]) => {
      if (key === 'paymentOrders.orderId') {
        return doc.paymentOrders?.some((order) => order.orderId === value)
      }
      if (key === '_id') return String(doc._id) === String(value)
      return doc[key] === value
    })
  }

  function findRecord(query) {
    return Array.from(records.values()).find((doc) => matches(doc, query)) ?? null
  }

  function wrap(record) {
    if (!record) return null
    const doc = { ...record }
    doc.toObject = () => {
      const data = { ...doc }
      delete data.toObject
      delete data.save
      return { ...data }
    }
    doc.save = async () => {
      const persisted = doc.toObject()
      records.set(persisted.requestId, persisted)
      return wrap(persisted)
    }
    return doc
  }

  return {
    get collection() {
      return { collectionName: 'bookings-db' }
    },
    records,
    async create(data) {
      const doc = {
        _id: data._id || '507f1f77bcf86cd799439099',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
        status: data.status ?? 'pending',
        maleCount: data.maleCount ?? 0,
        femaleCount: data.femaleCount ?? 0,
      }
      records.set(doc.requestId, doc)
      return wrap(doc)
    },
    findOne(query) {
      const result = () => findRecord(query)
      return {
        lean: async () => {
          const record = result()
          return record ? { ...record } : null
        },
        exec: async () => wrap(result()),
        then(resolve, reject) {
          return Promise.resolve(wrap(result())).then(resolve, reject)
        },
      }
    },
    find(_query = {}) {
      return {
        sort() {
          return {
            lean: async () => Array.from(records.values()).map((r) => ({ ...r })),
            limit: () => ({
              lean: async () => Array.from(records.values()).map((r) => ({ ...r })),
            }),
          }
        },
      }
    },
    async countDocuments() {
      return records.size
    },
    async findOneAndUpdate(query, update, options = {}) {
      let targetKey = null
      for (const [key, doc] of records.entries()) {
        if (query.requestId && doc.requestId === query.requestId) {
          targetKey = key
          break
        }
      }
      if (targetKey) {
        if (update.$set) Object.assign(records.get(targetKey), update.$set)
        return wrap(records.get(targetKey))
      }
      if (options.upsert) {
        const newDoc = { ...(update.$setOnInsert || {}), ...(update.$set || {}) }
        records.set(newDoc.requestId, newDoc)
        return wrap(newDoc)
      }
      return null
    },
  }
}

function mockCashfreeFetch(payments) {
  return async (url, options = {}) => {
    if (url.endsWith('/orders')) {
      const order = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          cf_order_id: 'cf-order-mock',
          order_id: order.order_id,
          order_amount: order.order_amount,
          order_currency: order.order_currency,
          payment_session_id: 'session-mock',
        }),
      }
    }
    const orderId = decodeURIComponent(url.split('/orders/')[1]?.split('/')[0] ?? '')
    return {
      ok: true,
      json: async () => payments.map((payment) => ({
        ...payment,
        order_id: payment.order_id ?? orderId,
      })),
    }
  }
}

function createMigrationDatabase(sourceRecords, existingTargetRecords = []) {
  const sourceDocs = new Map(sourceRecords.map((record) => [record.requestId, { ...record }]))
  const targetDocs = new Map(existingTargetRecords.map((record) => [record.requestId, { ...record }]))

  function createCollection(records) {
    return {
      find() {
        return {
          sort() {
            return { toArray: async () => Array.from(records.values()).map((record) => ({ ...record })) }
          },
        }
      },
      async countDocuments() {
        return records.size
      },
      async findOne(filter) {
        return Array.from(records.values()).find((record) =>
          Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))
        ) ?? null
      },
      async bulkWrite(operations) {
        let modifiedCount = 0
        let upsertedCount = 0
        for (const { updateOne } of operations) {
          const { filter, update, upsert } = updateOne
          const target = Array.from(records.entries()).find(([, record]) =>
            Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))
          )
          if (target) {
            Object.assign(target[1], update.$set ?? {})
            for (const key of Object.keys(update.$unset ?? {})) delete target[1][key]
            modifiedCount += 1
          } else if (upsert) {
            const record = { ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) }
            records.set(record.requestId, record)
            upsertedCount += 1
          }
        }
        return { modifiedCount, upsertedCount }
      },
    }
  }

  return {
    db: {
      collection(name) {
        if (name === 'user-db') return createCollection(sourceDocs)
        if (name === 'bookings-db') return createCollection(targetDocs)
        throw new Error(`Unknown collection ${name}`)
      },
    },
    targetDocs,
  }
}

function applyBookingTtlIndex(records, now) {
  for (const [key, record] of records) {
    if (record.expiresAt instanceof Date && record.expiresAt <= now) {
      records.delete(key)
    }
  }
}

test('1. BookingEnquiry model defaults to bookings-db collection', () => {
  assert.equal(BookingEnquiry.collection.collectionName, 'bookings-db')
})

test('booking models declare the same unique sparse reference index', () => {
  const bookingReferenceIndex = Booking.schema.indexes().find(
    ([keys]) => keys.reference === 1,
  )
  const enquiryReferenceIndex = BookingEnquiry.schema.indexes().find(
    ([keys]) => keys.reference === 1,
  )

  assert.equal(Booking.collection.collectionName, 'bookings-db')
  assert.equal(BookingEnquiry.collection.collectionName, 'bookings-db')
  assert.ok(bookingReferenceIndex)
  assert.deepEqual(bookingReferenceIndex, enquiryReferenceIndex)
  assert.equal(bookingReferenceIndex[1].unique, true)
  assert.equal(bookingReferenceIndex[1].sparse, true)
  assert.equal(Booking.schema.path('reference').options.required, true)
  assert.notEqual(BookingEnquiry.schema.path('reference').options.required, true)
})

test('legacy user-db booking model does not declare the bookings-db TTL or uniqueness indexes', () => {
  const LegacyBookingEnquiry = mongoose.models.LegacyBookingEnquiry

  assert.ok(LegacyBookingEnquiry)
  assert.equal(LegacyBookingEnquiry.collection.collectionName, 'user-db')
  assert.equal(
    LegacyBookingEnquiry.schema.indexes().some(([, options]) => options.expireAfterSeconds !== undefined),
    false,
  )
  assert.equal(
    LegacyBookingEnquiry.schema.indexes().some(([, options]) => options.unique),
    false,
  )
})

test('2. New booking persistence before payment: saves to bookings-db with unpaid & pending status', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const enquiryInput = {
    requestId: 'req-pre-payment-1',
    name: 'Suresh Kumar',
    mobile: '9876543210',
    email: 'suresh@example.com',
    gender: 'Male',
    ticketQuantity: 2,
    eventId: 'after-hours-sing-along',
    event: 'After Hours Sing Along',
    attendees: [
      { name: 'Suresh Kumar', gender: 'Male', mobile: '9876543210' },
      { name: 'Ramesh Kumar', gender: 'Male', mobile: '9876543211' },
    ],
    whatsappConsent: true,
  }

  const { enquiry, duplicate } = await saveBookingEnquiry(enquiryInput, { bookingEnquiryModel })

  assert.equal(duplicate, false)
  assert.equal(enquiry.requestId, 'req-pre-payment-1')
  assert.equal(enquiry.paymentStatus, 'unpaid')
  assert.equal(enquiry.status, 'pending')
  assert.equal(enquiry.name, 'Suresh Kumar')
  assert.equal(enquiry.attendees.length, 2)
  assert.equal(bookingEnquiryModel.records.size, 1)

  const persisted = bookingEnquiryModel.records.get('req-pre-payment-1')
  assert.ok(persisted)
  assert.equal(persisted.paymentStatus, 'unpaid')
  assert.equal(persisted.status, 'pending')
})

test('3. Pending booking persistence: can be retrieved and retains full details before payment begins', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const enquiryInput = {
    requestId: 'req-pending-check-1',
    name: 'Priya Sharma',
    mobile: '9123456780',
    email: 'priya@example.com',
    gender: 'Female',
    ticketQuantity: 1,
    eventId: 'the-open-table',
    event: 'The Open Table',
    whatsappConsent: true,
  }

  await saveBookingEnquiry(enquiryInput, { bookingEnquiryModel })
  const loaded = await findBookingEnquiry('req-pending-check-1', bookingEnquiryModel)

  assert.ok(loaded)
  assert.equal(loaded.requestId, 'req-pending-check-1')
  assert.equal(loaded.paymentStatus, 'unpaid')
  assert.equal(loaded.status, 'pending')
  assert.equal(loaded.name, 'Priya Sharma')
})

test('4. Successful payment update: updates same record to paid and confirmed without duplicate rows', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const requestId = 'req-pay-success-1'

  await saveBookingEnquiry({
    requestId,
    name: 'Anita Roy',
    mobile: '9876501234',
    email: 'anita@example.com',
    gender: 'Female',
    ticketQuantity: 1,
    paymentAmount: 299,
  }, { bookingEnquiryModel })

  const cashfreeService = createCashfreePaymentService({
    appId: 'mock_app',
    secretKey: 'mock_secret',
    bookingEnquiryModel,
    bookingResultModel: createMockBookingResultModel(),
    allocateReference: async () => 'VT-REF-TEST-001',
    fetchFn: mockCashfreeFetch([
        {
          cf_payment_id: 'cf_pay_1001',
          payment_status: 'SUCCESS',
          payment_currency: 'INR',
          payment_amount: 199,
        },
      ]),
  })

  // Create an order first
  await cashfreeService.createOrder(requestId)
  const initialCount = bookingEnquiryModel.records.size
  assert.equal(initialCount, 1)

  // Verify payment
  const result = await cashfreeService.verifyPayment(requestId, { cf_payment_id: 'cf_pay_1001' })

  assert.equal(result.verified, true)
  assert.equal(bookingEnquiryModel.records.size, 1, 'No duplicate record created')

  const updated = bookingEnquiryModel.records.get(requestId)
  assert.equal(updated.paymentStatus, 'paid')
  assert.equal(updated.status, 'confirmed')
  assert.ok(updated.reference, 'Booking reference allocated')
  assert.ok(updated.paidAt)
  assert.ok(updated.paymentVerifiedAt)
})

test('5. Confirmed failure update: updates record to failed without deleting or duplicating', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const requestId = 'req-pay-failed-1'

  await saveBookingEnquiry({
    requestId,
    name: 'Vikram Singh',
    mobile: '9876509999',
    email: 'vikram@example.com',
    gender: 'Male',
    ticketQuantity: 1,
    paymentAmount: 299,
  }, { bookingEnquiryModel })

  const cashfreeService = createCashfreePaymentService({
    appId: 'mock_app',
    secretKey: 'mock_secret',
    bookingEnquiryModel,
    bookingResultModel: createMockBookingResultModel(),
    allocateReference: async () => 'VT-REF-TEST-002',
    fetchFn: mockCashfreeFetch([
        {
          cf_payment_id: 'cf_pay_failed_1',
          payment_status: 'FAILED',
          payment_currency: 'INR',
          payment_amount: 199,
          payment_message: 'User dropped payment',
          payment_code: 'PAYMENT_DROPPED',
        },
      ]),
  })

  await cashfreeService.createOrder(requestId)
  const result = await cashfreeService.verifyPayment(requestId, { cf_payment_id: 'cf_pay_failed_1' })

  assert.equal(result.verified, false)
  assert.equal(bookingEnquiryModel.records.size, 1)

  const failedRecord = bookingEnquiryModel.records.get(requestId)
  assert.equal(failedRecord.paymentStatus, 'failed')
  assert.equal(failedRecord.status, 'pending')
  assert.equal(failedRecord.paymentFailureReason, 'failed')
})

test('6. Cancelled booking update: updates status to cancelled while preserving booking history', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const requestId = 'req-cancel-1'

  await saveBookingEnquiry({
    requestId,
    name: 'Kavita Iyer',
    mobile: '9876541122',
    email: 'kavita@example.com',
    gender: 'Female',
    ticketQuantity: 1,
  }, { bookingEnquiryModel })

  const doc = await bookingEnquiryModel.findOne({ requestId }).exec()
  doc.status = 'cancelled'
  await doc.save()

  assert.equal(bookingEnquiryModel.records.size, 1)
  const cancelled = bookingEnquiryModel.records.get(requestId)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.name, 'Kavita Iyer')
})

test('7. Duplicate webhook handling: processes PAYMENT_SUCCESS_WEBHOOK idempotently', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const requestId = 'req-dup-webhook-1'
  const orderId = `order_${requestId}`

  await saveBookingEnquiry({
    requestId,
    name: 'Rahul Mehra',
    mobile: '9876508888',
    email: 'rahul@example.com',
    gender: 'Male',
    ticketQuantity: 1,
    paymentAmount: 299,
    paymentOrderId: orderId,
    paymentOrders: [{ orderId, amount: 299, amountPaise: 29900, regularPrice: 299, offerPrice: 299, diwaliOfferApplied: false, status: 'created', createdAt: new Date() }],
  }, { bookingEnquiryModel })

  const cashfreeService = createCashfreePaymentService({
    appId: 'mock_app',
    secretKey: 'mock_secret',
    bookingEnquiryModel,
    bookingResultModel: createMockBookingResultModel(),
    allocateReference: async () => 'VT-REF-TEST-003',
  })

  const webhookPayload = {
    data: {
      order: { order_id: orderId, order_amount: 299, order_currency: 'INR' },
      payment: {
        cf_payment_id: 'cf_wh_1',
        payment_status: 'SUCCESS',
        payment_currency: 'INR',
        payment_amount: 299,
      },
    },
    type: 'PAYMENT_SUCCESS_WEBHOOK',
  }
  const rawBody = JSON.stringify(webhookPayload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac('sha256', 'mock_secret')
    .update(timestamp + rawBody)
    .digest('base64')

  // First webhook
  const res1 = await cashfreeService.handleWebhook(webhookPayload, signature, timestamp, rawBody)
  assert.equal(res1.received, true)
  assert.equal(res1.action, 'confirmed')
  assert.equal(bookingEnquiryModel.records.size, 1)

  // Second duplicate webhook
  const res2 = await cashfreeService.handleWebhook(webhookPayload, signature, timestamp, rawBody)
  assert.equal(res2.received, true)
  assert.equal(res2.duplicate, true)
  assert.equal(bookingEnquiryModel.records.size, 1)
  assert.equal(bookingEnquiryModel.records.get(requestId).paymentStatus, 'paid')
})

test('8. Retry without duplicate booking: second attempt reuses session without extra document', async () => {
  const bookingEnquiryModel = createInMemoryBookingEnquiryModel()
  const requestId = 'req-retry-session-1'

  const input = {
    requestId,
    name: 'Sameer Joshi',
    mobile: '9876507777',
    email: 'sameer@example.com',
    gender: 'Male',
    ticketQuantity: 2,
  }

  // First submission
  const first = await saveBookingEnquiry(input, { bookingEnquiryModel })
  assert.equal(first.duplicate, false)
  assert.equal(bookingEnquiryModel.records.size, 1)

  // Retry submission with same details
  const second = await saveBookingEnquiry(input, { bookingEnquiryModel })
  assert.equal(second.duplicate, true)
  assert.equal(bookingEnquiryModel.records.size, 1, 'Must not create a second document on retry')
})

test('9. Existing booking migration: dry-run, execution, idempotency and safety', async () => {
  // Create mock database with source and target collections
  const sourceDocs = new Map([
    ['doc1', { _id: '507f1f77bcf86cd799439001', requestId: 'req-hist-1', reference: '10812026501', name: 'User One', paymentStatus: 'SUCCESS', status: 'confirmed', expiresAt: new Date('2026-03-08T00:00:00.000Z') }],
    ['doc2', { _id: '507f1f77bcf86cd799439002', requestId: 'req-hist-2', reference: '', name: 'User Two', paymentStatus: 'unpaid', status: 'pending' }],
    ['doc3', { _id: '507f1f77bcf86cd799439003', requestId: 'req-hist-3', reference: '', name: 'User Three', paymentStatus: 'FAILED', status: 'pending' }],
    ['doc4', { name: 'Corrupt Record Without IDs' }], // no requestId, reference, or _id
  ])
  const targetDocs = new Map()

  function createMockCol(map) {
    return {
      find() {
        return {
          sort() {
            return {
              toArray: async () => Array.from(map.values()),
            }
          },
        }
      },
      async countDocuments() {
        return map.size
      },
      async findOne(filter) {
        for (const doc of map.values()) {
          let match = true
          for (const [k, v] of Object.entries(filter)) {
            if (doc[k] !== v) match = false
          }
          if (match) return { ...doc }
        }
        return null
      },
      async bulkWrite(ops) {
        let upsertedCount = 0
        let modifiedCount = 0
        for (const op of ops) {
          if (op.updateOne) {
            const { filter, update, upsert } = op.updateOne
            let targetKey = null
            for (const [k, doc] of map.entries()) {
              if (filter.requestId && doc.requestId === filter.requestId) {
                targetKey = k
                break
              }
            }
            if (targetKey) {
              if (update.$set) Object.assign(map.get(targetKey), update.$set)
              if (update.$unset) {
                for (const key of Object.keys(update.$unset)) delete map.get(targetKey)[key]
              }
              modifiedCount++
            } else if (upsert) {
              const newDoc = { ...(update.$setOnInsert || {}), ...(update.$set || {}) }
              map.set(newDoc.requestId || `doc_${map.size + 1}`, newDoc)
              upsertedCount++
            }
          }
        }
        return { upsertedCount, modifiedCount }
      },
    }
  }

  const mockDb = {
    collection(name) {
      if (name === 'user-db') return createMockCol(sourceDocs)
      if (name === 'bookings-db') return createMockCol(targetDocs)
      throw new Error(`Unknown collection ${name}`)
    },
  }

  // A. Dry run mode
  const dryReport = await migrateBookings({ db: mockDb, dryRun: true })
  assert.equal(dryReport.dryRun, true)
  assert.equal(dryReport.totalScanned, 4)
  assert.equal(dryReport.readyToInsert, 3)
  assert.equal(dryReport.unmigrated.length, 1)
  assert.equal(targetDocs.size, 0, 'Dry-run must not write any records')

  // B. Execute mode
  const execReport = await migrateBookings({ db: mockDb, dryRun: false })
  assert.equal(execReport.dryRun, false)
  assert.equal(execReport.readyToInsert, 3)
  assert.equal(targetDocs.size, 3, 'All 3 valid records migrated')
  assert.ok(targetDocs.get('req-hist-1'))
  assert.equal(targetDocs.get('req-hist-1').name, 'User One')
  assert.equal(targetDocs.get('req-hist-1').paymentStatus, 'paid')
  assert.equal('expiresAt' in targetDocs.get('req-hist-1'), false)
  assert.equal(targetDocs.get('req-hist-3').paymentStatus, 'failed')
  assert.equal('reference' in targetDocs.get('req-hist-2'), false)
  assert.equal('reference' in targetDocs.get('req-hist-3'), false)

  // C. Idempotent re-run
  targetDocs.get('req-hist-1').expiresAt = new Date('2026-03-08T00:00:00.000Z')
  const rerunReport = await migrateBookings({ db: mockDb, dryRun: false })
  assert.equal(rerunReport.readyToInsert, 0, 'No new inserts on re-run')
  assert.equal(rerunReport.updated, 1, 'Paid target records have expiration removed')
  assert.equal(rerunReport.alreadyPresent, 2, 'Non-paid records already present')
  assert.equal(targetDocs.size, 3, 'Target document count remains 3')
  assert.equal('expiresAt' in targetDocs.get('req-hist-1'), false)
})

test('migration reports identity conflicts and only applies a provably newer paid state', async () => {
  const sourceRecords = [
    {
      _id: 'source-collision',
      requestId: 'req-collision',
      reference: 'REF-COLLISION',
      name: 'Collision Customer',
      email: 'collision@example.com',
      paymentStatus: 'SUCCESS',
      status: 'confirmed',
      updatedAt: new Date('2026-03-03T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    },
    {
      _id: 'source-stale',
      requestId: 'req-stale',
      reference: 'REF-STALE',
      name: 'Stale Customer',
      email: 'stale@example.com',
      paymentStatus: 'SUCCESS',
      status: 'confirmed',
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
    },
    {
      _id: 'source-newer',
      requestId: 'req-newer',
      reference: 'REF-NEWER',
      name: 'Newer Customer',
      email: 'newer@example.com',
      paymentStatus: 'SUCCESS',
      status: 'confirmed',
      updatedAt: new Date('2026-03-04T00:00:00.000Z'),
      createdAt: new Date('2026-03-03T00:00:00.000Z'),
    },
    {
      _id: 'source-blank-reference',
      requestId: 'req-blank-reference',
      reference: '',
      name: 'Blank Reference Customer',
      paymentStatus: 'unpaid',
      status: 'pending',
      updatedAt: new Date('2026-03-04T00:00:00.000Z'),
      createdAt: new Date('2026-03-04T00:00:00.000Z'),
    },
  ]
  const sourceDocs = new Map(sourceRecords.map((record) => [record._id, record]))
  const targetDocs = new Map([
    ['collision-request', {
      _id: 'target-collision-request',
      requestId: 'req-collision',
      reference: 'REF-OTHER',
      paymentStatus: 'unpaid',
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    }],
    ['collision-reference', {
      _id: 'target-collision-reference',
      requestId: 'req-other',
      reference: 'REF-COLLISION',
      paymentStatus: 'unpaid',
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    }],
    ['stale', {
      _id: 'target-stale',
      requestId: 'req-stale',
      reference: 'REF-STALE',
      name: 'Current Target Name',
      paymentStatus: 'failed',
      status: 'pending',
      expiresAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-03T00:00:00.000Z'),
    }],
    ['newer', {
      _id: 'target-newer',
      requestId: 'req-newer',
      reference: 'REF-NEWER',
      paymentStatus: 'unpaid',
      status: 'pending',
      expiresAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-03T00:00:00.000Z'),
    }],
    ['blank-reference', {
      _id: 'target-blank-reference',
      requestId: 'req-blank-reference',
      reference: '',
      paymentStatus: 'unpaid',
      status: 'pending',
      updatedAt: new Date('2026-03-03T00:00:00.000Z'),
    }],
  ])

  function createMockCol(map) {
    return {
      find() {
        return {
          sort() {
            return { toArray: async () => Array.from(map.values()) }
          },
        }
      },
      async countDocuments() {
        return map.size
      },
      async findOne(filter) {
        return Array.from(map.values()).find((record) =>
          Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))
        ) ?? null
      },
      async bulkWrite(operations) {
        let modifiedCount = 0
        let upsertedCount = 0
        for (const { updateOne } of operations) {
          const { filter, update, upsert } = updateOne
          const match = Array.from(map.entries()).find(([, record]) =>
            Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))
          )
          if (match) {
            Object.assign(match[1], update.$set ?? {})
            for (const field of Object.keys(update.$unset ?? {})) delete match[1][field]
            modifiedCount += 1
          } else if (upsert) {
            const record = { ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) }
            map.set(record.requestId, record)
            upsertedCount += 1
          }
        }
        return { modifiedCount, upsertedCount }
      },
    }
  }

  const db = {
    collection(name) {
      if (name === 'user-db') return createMockCol(sourceDocs)
      if (name === 'bookings-db') return createMockCol(targetDocs)
      throw new Error(`Unknown collection ${name}`)
    },
  }
  const report = await migrateBookings({ db, dryRun: false })

  assert.equal(report.unmigrated.length, 1)
  assert.equal(report.stateConflicts.length, 1)
  assert.equal(targetDocs.get('collision-request').paymentStatus, 'unpaid')
  assert.equal(targetDocs.get('stale').paymentStatus, 'failed')
  assert.ok(targetDocs.get('stale').expiresAt)
  assert.equal(targetDocs.get('newer').paymentStatus, 'paid')
  assert.equal(targetDocs.get('newer').status, 'confirmed')
  assert.equal('expiresAt' in targetDocs.get('newer'), false)
  assert.equal('reference' in targetDocs.get('blank-reference'), false)
  const serializedReport = JSON.stringify(report)
  assert.ok(!serializedReport.includes('Collision Customer'))
  assert.ok(!serializedReport.includes('collision@example.com'))
})

test('migration reports and skips all source records with colliding booking identities', async () => {
  const sourceRecords = [
    { _id: 'source-1', requestId: 'duplicate-request', reference: 'VT-DUP-1' },
    { _id: 'source-2', requestId: 'duplicate-request', reference: 'VT-DUP-2' },
  ]
  const targetRecords = new Map()
  const sourceCollection = {
    find() {
      return { sort: () => ({ toArray: async () => sourceRecords }) }
    },
  }
  const targetCollection = {
    async countDocuments() {
      return targetRecords.size
    },
  }
  const db = {
    collection(name) {
      return name === 'user-db' ? sourceCollection : targetCollection
    },
  }

  const report = await migrateBookings({ db, dryRun: false })

  assert.equal(report.unmigrated.length, 2)
  assert.equal(report.readyToInsert, 0)
  assert.equal(targetRecords.size, 0)
})

test('migration rechecks identity once after a duplicate-key race', async () => {
  const sourceRecord = {
    _id: 'source-race',
    requestId: 'req-race',
    reference: 'REF-RACE',
    name: 'Source Name',
    mobile: '9876543210',
    paymentStatus: 'unpaid',
    status: 'pending',
    updatedAt: new Date('2026-03-04T00:00:00.000Z'),
    createdAt: new Date('2026-03-04T00:00:00.000Z'),
  }
  const sourceDocs = new Map([[sourceRecord._id, sourceRecord]])
  const targetDocs = new Map()
  let writeCount = 0

  function createMockCol(map, isTarget = false) {
    return {
      find() {
        return {
          sort() {
            return { toArray: async () => Array.from(map.values()) }
          },
        }
      },
      async countDocuments() {
        return map.size
      },
      async findOne(filter) {
        return Array.from(map.values()).find((record) =>
          Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))
        ) ?? null
      },
      async bulkWrite(operations) {
        writeCount += 1
        if (isTarget && writeCount === 1) {
          targetDocs.set('raced', {
            _id: 'target-raced',
            requestId: 'req-race',
            reference: 'REF-RACE',
            name: 'Concurrent Name',
            mobile: '',
            paymentStatus: 'unpaid',
            status: 'pending',
            updatedAt: new Date('2026-03-04T00:00:00.000Z'),
          })
          throw Object.assign(new Error('duplicate key'), {
            code: 11000,
            writeErrors: [{ code: 11000, index: 0 }],
          })
        }

        let modifiedCount = 0
        for (const { updateOne } of operations) {
          const { filter, update } = updateOne
          const record = Array.from(map.values()).find((entry) =>
            Object.entries(filter).every(([key, value]) => String(entry[key]) === String(value))
          )
          if (!record) continue
          Object.assign(record, update.$set ?? {})
          for (const field of Object.keys(update.$unset ?? {})) delete record[field]
          modifiedCount += 1
        }
        return { modifiedCount, upsertedCount: 0 }
      },
    }
  }

  const db = {
    collection(name) {
      if (name === 'user-db') return createMockCol(sourceDocs)
      if (name === 'bookings-db') return createMockCol(targetDocs, true)
      throw new Error(`Unknown collection ${name}`)
    },
  }
  const report = await migrateBookings({ db, dryRun: false })

  assert.equal(writeCount, 2)
  assert.equal(report.duplicateKeyRaceRecovered, true)
  assert.equal(targetDocs.size, 1)
  assert.equal(targetDocs.get('raced').name, 'Concurrent Name')
  assert.equal(targetDocs.get('raced').mobile, '9876543210')
})

for (const paymentStatus of ['paid', 'SUCCESS', 'demo_paid', 'verified']) {
  test(`migration removes TTL expiry from paid ${paymentStatus} bookings`, async () => {
    const expiresAt = new Date('2020-01-01T00:00:00.000Z')
    const requestId = `req-paid-${paymentStatus}`
    const sourceRecord = {
      _id: `source-${requestId}`,
      requestId,
      reference: `REF-${paymentStatus}`,
      paymentStatus,
      status: 'confirmed',
      expiresAt,
      createdAt: new Date('2019-12-01T00:00:00.000Z'),
      updatedAt: new Date('2019-12-02T00:00:00.000Z'),
    }
    const ttlIndex = BookingEnquiry.schema.indexes().find(
      ([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0,
    )
    assert.ok(ttlIndex, 'BookingEnquiry must retain its expiresAt TTL index')

    for (const existingTargetRecords of [
      [],
      [{
        _id: `target-${requestId}`,
        requestId,
        reference: sourceRecord.reference,
        paymentStatus,
        status: 'confirmed',
        expiresAt,
        updatedAt: sourceRecord.updatedAt,
      }],
      [{
        _id: `target-null-expiry-${requestId}`,
        requestId,
        reference: sourceRecord.reference,
        paymentStatus,
        status: 'confirmed',
        expiresAt: null,
        updatedAt: sourceRecord.updatedAt,
      }],
    ]) {
      const { db, targetDocs } = createMigrationDatabase([sourceRecord], existingTargetRecords)
      const report = await migrateBookings({ db, dryRun: false })
      const migrated = targetDocs.get(requestId)

      assert.ok(migrated)
      assert.equal(report.unmigrated.length, 0)
      assert.equal('expiresAt' in migrated, false, `${paymentStatus} booking should not retain TTL expiry`)
      assert.equal(
        migrated.paymentStatus,
        paymentStatus === 'verified' || paymentStatus === 'SUCCESS' ? 'paid' : paymentStatus,
      )

      applyBookingTtlIndex(targetDocs, new Date('2026-11-18T00:00:00.000Z'))
      assert.equal(targetDocs.has(requestId), true, `${paymentStatus} booking must survive the TTL sweep`)
    }
  })
}

test('booking payment status compatibility keeps unpaid states unpaid', async () => {
  const { normalizeBookingPaymentStatus, isCompletedBookingPaymentStatus } =
    await import('../../src/utils/paymentStatus.js')

  for (const status of ['paid', 'SUCCESS', 'verified']) {
    assert.equal(normalizeBookingPaymentStatus(status), 'paid')
    assert.equal(isCompletedBookingPaymentStatus(status), true)
  }
  assert.equal(normalizeBookingPaymentStatus('demo_paid'), 'demo_paid')
  assert.equal(isCompletedBookingPaymentStatus('demo_paid'), true)
  for (const status of ['unpaid', 'processing', 'failed']) {
    assert.equal(normalizeBookingPaymentStatus(status), status)
    assert.equal(isCompletedBookingPaymentStatus(status), false)
  }
  assert.equal(
    BookingEnquiry.schema.path('paymentStatus').enumValues.includes('verified'),
    true,
  )
})

test('migration preserves unpaid and pending expiry behavior', async () => {
  const futureExpiry = new Date('2026-12-01T00:00:00.000Z')
  const pastExpiry = new Date('2020-01-01T00:00:00.000Z')
  const { db, targetDocs } = createMigrationDatabase([
    {
      requestId: 'req-unpaid-future',
      paymentStatus: 'unpaid',
      status: 'pending',
      expiresAt: futureExpiry,
    },
    {
      requestId: 'req-processing-expired',
      paymentStatus: 'processing',
      status: 'pending',
      expiresAt: pastExpiry,
    },
    {
      requestId: 'req-pending-expiry',
      paymentStatus: 'pending',
      status: 'pending',
      expiresAt: futureExpiry,
    },
  ])

  const report = await migrateBookings({ db, dryRun: false })

  assert.equal(report.readyToInsert, 3)
  assert.equal(targetDocs.get('req-unpaid-future').expiresAt.getTime(), futureExpiry.getTime())
  assert.equal(targetDocs.get('req-processing-expired').expiresAt.getTime(), pastExpiry.getTime())
  assert.equal(targetDocs.get('req-pending-expiry').expiresAt.getTime(), futureExpiry.getTime())

  applyBookingTtlIndex(targetDocs, new Date('2026-11-18T00:00:00.000Z'))
  assert.equal(targetDocs.has('req-unpaid-future'), true)
  assert.equal(targetDocs.has('req-processing-expired'), false)
  assert.equal(targetDocs.has('req-pending-expiry'), true)
})

test('10. Admin bookings listing: retrieves and merges records from bookings-db without duplicates', () => {
  const primaryEnquiries = [
    {
      _id: '507f1f77bcf86cd799439001',
      requestId: 'req-1',
      reference: '10812026501',
      name: 'Aditi Sharma',
      mobile: '9876543210',
      email: 'aditi@example.com',
      event: 'After Hours Sing Along',
      paymentStatus: 'paid',
      status: 'confirmed',
      createdAt: new Date('2026-03-01T12:00:00Z'),
    },
    {
      _id: '507f1f77bcf86cd799439002',
      requestId: 'req-2',
      reference: '',
      name: 'Bob Mathew',
      mobile: '9876543211',
      email: 'bob@example.com',
      event: 'The Open Table',
      paymentStatus: 'unpaid',
      status: 'pending',
      createdAt: new Date('2026-03-02T12:00:00Z'),
    },
  ]

  // Legacy enquiries from user-db (e.g. req-1 already migrated, req-3 not yet migrated)
  const legacyEnquiries = [
    {
      _id: '507f1f77bcf86cd799439001',
      requestId: 'req-1',
      reference: '10812026501',
      name: 'Aditi Sharma',
      paymentStatus: 'paid',
      status: 'confirmed',
      createdAt: new Date('2026-03-01T12:00:00Z'),
    },
    {
      _id: '507f1f77bcf86cd799439003',
      requestId: 'req-3',
      reference: '10812026503',
      name: 'Charlie Puth',
      mobile: '9876543212',
      email: 'charlie@example.com',
      event: 'Fun Games',
      paymentStatus: 'paid',
      status: 'confirmed',
      createdAt: new Date('2026-03-03T12:00:00Z'),
    },
  ]

  const merged = mergeBookingRecords([], primaryEnquiries, legacyEnquiries)

  // Should have 3 unique records: req-3 (newest), req-2, req-1
  assert.equal(merged.length, 3, 'req-1 must not be duplicated')
  assert.equal(merged[0].requestId, 'req-3')
  assert.equal(merged[1].requestId, 'req-2')
  assert.equal(merged[2].requestId, 'req-1')
})
