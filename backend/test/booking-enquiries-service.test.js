import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  markBookingEnquiryDemoFailed,
  markBookingEnquiryDemoPaid,
  saveBookingEnquiry,
} from '../src/services/bookingEnquiries.js'

function makeQuery(value) {
  return { lean: async () => (value ? structuredClone(value) : null) }
}

function createBookingModel(initialRecord = null) {
  let record = initialRecord ? structuredClone(initialRecord) : null

  return {
    get record() {
      return record ? structuredClone(record) : null
    },
    findOne({ requestId }) {
      return makeQuery(record?.requestId === requestId ? record : null)
    },
    async create(value) {
      record = { _id: 'temp-1', ...structuredClone(value) }
      return { toObject: () => structuredClone(record) }
    },
    findOneAndUpdate(filter, update) {
      if (!record || record.requestId !== filter.requestId && record._id !== filter._id) {
        return makeQuery(null)
      }

      if (update.$set?.paymentStatus === 'processing') {
        const canClaim =
          record.status !== 'cancelled' &&
          record.expiresAt > new Date() &&
          !record.reference &&
          ['unpaid', 'failed'].includes(record.paymentStatus)
        if (!canClaim) return makeQuery(null)
      } else if (update.$set?.reference) {
        if (
          record.paymentStatus !== 'processing' ||
          record.paymentAttemptId !== filter.paymentAttemptId
        ) {
          return makeQuery(null)
        }
      } else if (update.$set?.paymentStatus === 'failed') {
        if (record.reference || !['unpaid', 'failed'].includes(record.paymentStatus)) {
          return makeQuery(null)
        }
      }

      Object.assign(record, update.$set ?? {})
      for (const key of Object.keys(update.$unset ?? {})) {
        delete record[key]
      }
      return makeQuery(record)
    },
  }
}

test('initial booking save is temporary, unpaid, expiring, and reference-free', async () => {
  const model = createBookingModel()
  const before = Date.now()
  const result = await saveBookingEnquiry({
    requestId: 'session-one',
    name: 'Jordan Example',
    mobile: '+919876543210',
    email: 'jordan@example.com',
    category: 'Fun Games',
    categoryId: 'fun-games',
    event: '',
    eventId: '',
    gender: 'Female',
    whatsappConsent: true,
    status: 'pending',
    createdAt: new Date(),
    source: 'Website booking journey',
  }, { bookingEnquiryModel: model })

  assert.equal(result.duplicate, false)
  assert.equal(result.enquiry.reference, undefined)
  assert.equal(result.enquiry.paymentStatus, 'unpaid')
  assert.equal(result.enquiry.email, 'jordan@example.com')
  assert.ok(result.enquiry.expiresAt.getTime() >= before + 7 * 24 * 60 * 60 * 1000 - 1000)
  assert.equal(result.enquiry.whatsappNotification.status, 'skipped')
})

test('demo payment finalization allocates once under duplicate callbacks and clears expiry', async () => {
  const requestId = 'session-two'
  const model = createBookingModel({
    _id: 'temp-2',
    requestId,
    name: 'Jordan Example',
    mobile: '+919876543210',
    email: 'jordan@example.com',
    category: 'Fun Games',
    gender: 'Female',
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentAmount: 299,
    expiresAt: new Date(Date.now() + 60_000),
  })
  let allocationCount = 0
  const allocateReference = async () => {
    allocationCount += 1
    return '10812026501'
  }

  const outcomes = await Promise.all([
    markBookingEnquiryDemoPaid(requestId, { bookingEnquiryModel: model, allocateReference }),
    markBookingEnquiryDemoPaid(requestId, { bookingEnquiryModel: model, allocateReference }),
  ])
  const finalized = model.record

  assert.equal(allocationCount, 1)
  assert.equal(finalized.reference, '10812026501')
  assert.equal(finalized.paymentStatus, 'demo_paid')
  assert.equal(finalized.paymentAmount, 299)
  assert.ok(finalized.paymentVerifiedAt)
  assert.equal('expiresAt' in finalized, false)
  assert.ok(outcomes.some((outcome) => outcome?.enquiry?.reference === finalized.reference))

  const duplicate = await markBookingEnquiryDemoPaid(requestId, {
    bookingEnquiryModel: model,
    allocateReference,
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.enquiry.reference, '10812026501')
  assert.equal(allocationCount, 1)
})

test('failed payment retains no reference and the same session can finalize on retry', async () => {
  const requestId = 'session-three'
  const model = createBookingModel({
    _id: 'temp-3',
    requestId,
    name: 'Jordan Example',
    mobile: '+919876543210',
    category: 'Fun Games',
    gender: 'Female',
    status: 'pending',
    paymentStatus: 'unpaid',
    expiresAt: new Date(Date.now() + 60_000),
  })

  const failed = await markBookingEnquiryDemoFailed(requestId, 'cancelled', model)
  assert.equal(failed.paymentStatus, 'failed')
  assert.equal(failed.paymentFailureReason, 'cancelled')
  assert.equal(failed.reference, undefined)

  const retried = await markBookingEnquiryDemoPaid(requestId, {
    bookingEnquiryModel: model,
    allocateReference: async () => '10812026502',
  })
  assert.equal(retried.enquiry.reference, '10812026502')
  assert.equal(retried.enquiry.paymentStatus, 'demo_paid')
})