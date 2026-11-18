import assert from 'node:assert/strict'
import express from 'express'
import { test } from 'node:test'
import { createAdminAuthRouter, hashAdminPassword } from '../src/auth/adminAuth.js'
import {
  ActivityLog,
  Booking,
} from '../src/models/adminRecords.js'
import { BookingEnquiry } from '../src/models/bookingEnquiry.js'
import { Event } from '../src/models/event.js'
import { createAdminRouter } from '../src/routes/admin.js'

const sessionSecret = 'a-session-secret-with-more-than-thirty-two-characters'
const requestId = 'c5b9fc92-3a4b-4c6c-9bb4-7f6a54e8d2a1'

function createSessionModel() {
  const sessions = new Map()
  return {
    async create(session) {
      sessions.set(session.sessionId, session)
      return session
    },
    findOne({ sessionId }) {
      return { lean: async () => sessions.get(sessionId) ?? null }
    },
    async deleteOne({ sessionId }) {
      sessions.delete(sessionId)
    },
    async deleteMany({ adminId }) {
      for (const [sessionId, session] of sessions) {
        if (String(session.adminId) === String(adminId)) sessions.delete(sessionId)
      }
    },
  }
}

async function createHarness(t, role = 'super_admin') {
  const password = 'correct-horse-battery-staple'
  const passwordHash = await hashAdminPassword(password)
  const admin = {
    _id: '507f1f77bcf86cd799439011',
    username: `${role}@example.test`,
    role,
    active: true,
    passwordHash,
    async save() {},
  }
  const adminModel = {
    findOne() {
      return { select: () => ({ exec: async () => admin }) }
    },
    findById(id) {
      return {
        select: () => ({
          lean: async () => id === admin._id
            ? { _id: admin._id, username: admin.username, role: admin.role, active: true }
            : null,
        }),
      }
    },
  }
  const sessionModel = createSessionModel()
  const app = express()
  app.use(express.json())
  app.use('/api/admin/auth', createAdminAuthRouter({
    bootstrapPasswordHash: passwordHash,
    model: adminModel,
    sessionModel,
    sessionSecret,
    username: admin.username,
  }))
  app.use('/api/admin', createAdminRouter({
    adminModel,
    sessionModel,
    sessionSecret,
  }))

  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections?.()
  }))

  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: admin.username, password }),
  })
  assert.equal(login.status, 200)
  const loginPayload = await login.json()
  const cookies = login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie') ?? '']
  const cookieHeader = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ')
  const headers = {
    Cookie: cookieHeader,
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-CSRF-Token': loginPayload.csrfToken,
  }

  return {
    async remove(identifier) {
      return fetch(`${baseUrl}/api/admin/bookings/${encodeURIComponent(identifier)}`, {
        method: 'DELETE',
        headers,
      })
    },
  }
}

function matchesReference(record, filter) {
  const clauses = filter.$or ?? [filter]
  const identityMatches = clauses.some((clause) => Object.entries(clause).every(([key, value]) => {
    if (key === '_id') return String(record._id) === String(value)
    if (key === 'reference' || key === 'requestId') return record[key] === value
    return true
  }))
  return identityMatches && (!filter._id || String(record._id) === String(filter._id))
}

function matchesSafeDeleteFilter(record, filter, source) {
  if (!filter._id || String(record._id) !== String(filter._id)) return false
  if (filter.paymentStatus !== (source === 'booking' ? 'not_required' : 'unpaid')) return false
  if (!Array.isArray(filter.$and) || !filter.$expr) return false

  const allowedFields = source === 'booking'
    ? new Set(['paymentStatus'])
    : new Set([
      'paymentStatus', 'paymentAmount', 'paymentAmountPaise', 'paymentOrderAmountPaise',
      'paymentOrders', 'upiPayments', 'paymentProvider', 'cfOrderId', 'cfPaymentId',
      'cfPaymentSessionId', 'cfPaymentStatus', 'cfPaymentMethod', 'paymentReference',
      'paymentOrderId', 'paymentOrderCreatedAt',
      'paymentOrderAttemptNumber', 'paidAt', 'paymentVerifiedAt',
      'paymentFailureReason', 'paymentAttemptId', 'paymentAttemptPricing',
      'paymentAttemptedAt',
    ])
  for (const [key, value] of Object.entries(record)) {
    if (!/(payment|paid|cashfree|upi|gateway|provider|transaction|refund|settlement|verification|verified|attempt|order|utr|receipt|payout|financial|audit)/i.test(key)) {
      continue
    }
    if (!allowedFields.has(key)) return false
    if (key === 'paymentStatus' || key === 'paymentAmount' || key === 'paymentAmountPaise') continue
    if (key === 'paymentOrders' || key === 'upiPayments') {
      if (value != null && (!Array.isArray(value) || value.length > 0)) return false
    } else if (['paymentOrderAmountPaise', 'paymentOrderAttemptNumber'].includes(key)) {
      if (value != null && value !== 0) return false
    } else if (value != null && value !== '') {
      return false
    }
  }
  return record.paymentStatus === (source === 'booking' ? 'not_required' : 'unpaid')
}

function installRecordMocks(t, { booking = null, enquiry = null, beforeDelete } = {}) {
  const asRecords = (records) => records == null ? [] : Array.isArray(records) ? records : [records]
  const state = {
    booking: asRecords(booking),
    enquiry: asRecords(enquiry),
    beforeDelete,
  }
  const calls = { bookingDeletes: [], enquiryDeletes: [], events: [], audits: [] }

  t.mock.method(Booking, 'find', (filter) => ({
    limit() { return this },
    lean: async () => state.booking.filter((record) => matchesReference(record, filter)).slice(0, 2),
  }))
  t.mock.method(Booking, 'findOneAndDelete', (filter) => ({
    lean: async () => {
      calls.bookingDeletes.push(filter)
      const index = state.booking.findIndex((record) =>
        matchesReference(record, filter) && matchesSafeDeleteFilter(record, filter, 'booking'),
      )
      if (state.beforeDelete) await state.beforeDelete('booking', state.booking[index] ?? state.booking[0] ?? null)
      const finalIndex = state.booking.findIndex((record) =>
        matchesReference(record, filter) && matchesSafeDeleteFilter(record, filter, 'booking'),
      )
      if (finalIndex < 0) return null
      const [deleted] = state.booking.splice(finalIndex, 1)
      return deleted
    },
  }))
  t.mock.method(BookingEnquiry, 'find', (filter) => ({
    limit() { return this },
    lean: async () => state.enquiry.filter((record) => matchesReference(record, filter)).slice(0, 2),
  }))
  t.mock.method(BookingEnquiry, 'findOneAndDelete', (filter) => ({
    lean: async () => {
      calls.enquiryDeletes.push(filter)
      const index = state.enquiry.findIndex((record) =>
        matchesReference(record, filter) && matchesSafeDeleteFilter(record, filter, 'enquiry'),
      )
      if (state.beforeDelete) await state.beforeDelete('enquiry', state.enquiry[index] ?? state.enquiry[0] ?? null)
      const finalIndex = state.enquiry.findIndex((record) =>
        matchesReference(record, filter) && matchesSafeDeleteFilter(record, filter, 'enquiry'),
      )
      if (finalIndex < 0) return null
      const [deleted] = state.enquiry.splice(finalIndex, 1)
      return deleted
    },
  }))
  t.mock.method(Event, 'updateOne', async (...args) => {
    calls.events.push(args)
    return { modifiedCount: 1 }
  })
  t.mock.method(ActivityLog, 'create', async (entry) => {
    calls.audits.push(entry)
    return entry
  })

  return {
    calls,
    get booking() { return state.booking[0] ?? null },
    get enquiry() { return state.enquiry[0] ?? null },
    setRecords(nextBooking, nextEnquiry, nextBeforeDelete) {
      state.booking = asRecords(nextBooking)
      state.enquiry = asRecords(nextEnquiry)
      state.beforeDelete = nextBeforeDelete
    },
  }
}

function bookingFixture(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439101',
    reference: 'VT-SAFE-BOOKING',
    eventId: 'event-1',
    ticketCount: 2,
    status: 'confirmed',
    paymentStatus: 'not_required',
    ...overrides,
  }
}

function enquiryFixture(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439102',
    requestId,
    reference: 'VT-SAFE-ENQUIRY',
    paymentStatus: 'unpaid',
    paymentOrders: [],
    upiPayments: [],
    paymentProvider: null,
    cfOrderId: '',
    cfPaymentId: '',
    cfPaymentSessionId: '',
    cfPaymentStatus: '',
    cfPaymentMethod: '',
    paymentReference: '',
    paymentOrderId: '',
    paymentOrderCreatedAt: null,
    paymentOrderAttemptNumber: 0,
    paidAt: null,
    paymentVerifiedAt: null,
    paymentFailureReason: '',
    paymentAttemptId: '',
    paymentAttemptPricing: null,
    paymentAttemptedAt: null,
    ...overrides,
  }
}

test('booking delete rejects financial evidence without deleting or recording success', async (t) => {
  const protectedBooking = bookingFixture({ paymentStatus: 'failed' })
  const records = installRecordMocks(t, { booking: protectedBooking })
  const harness = await createHarness(t)

  const response = await harness.remove(protectedBooking.reference)

  assert.equal(response.status, 409)
  assert.match((await response.json()).message, /payment|financial/i)
  assert.equal(records.booking, protectedBooking)
  assert.equal(records.calls.bookingDeletes.length, 0)
  assert.equal(records.calls.enquiryDeletes.length, 0)
  assert.equal(records.calls.events.length, 0)
  assert.equal(records.calls.audits.length, 0)
})

test('booking delete fails closed for unknown and every non-source no-payment status', async (t) => {
  const records = installRecordMocks(t)
  const harness = await createHarness(t)
  const protectedBookingStatuses = [
    'pending', 'failed', 'refunded', 'verified', 'demo_paid', 'paid',
    'processing', 'unpaid', 'unexpected', undefined,
  ]
  const protectedEnquiryStatuses = [
    'pending', 'failed', 'refunded', 'verified', 'demo_paid', 'paid',
    'processing', 'not_required', 'unexpected', undefined,
  ]

  for (const paymentStatus of protectedBookingStatuses) {
    const booking = bookingFixture({ reference: `VT-BOOKING-${String(paymentStatus)}`, paymentStatus })
    records.setRecords(booking, null)
    const response = await harness.remove(booking.reference)
    assert.equal(response.status, 409, `Booking status must be protected: ${String(paymentStatus)}`)
  }

  for (const paymentStatus of protectedEnquiryStatuses) {
    const enquiry = enquiryFixture({
      requestId: `enquiry-${String(paymentStatus)}`,
      paymentStatus,
    })
    records.setRecords(null, enquiry)
    const enquiryResponse = await harness.remove(enquiry.requestId)
    assert.equal(enquiryResponse.status, 409, `BookingEnquiry status must be protected: ${String(paymentStatus)}`)
  }

  assert.equal(records.calls.bookingDeletes.length, 0)
  assert.equal(records.calls.enquiryDeletes.length, 0)
  assert.equal(records.calls.events.length, 0)
  assert.equal(records.calls.audits.length, 0)
})

test('booking delete rejects ambiguous, missing, and non-super-admin requests', async (t) => {
  const sameReference = 'VT-DUPLICATE'
  const booking = bookingFixture({ reference: sameReference })
  const enquiry = enquiryFixture({ reference: sameReference })
  const records = installRecordMocks(t, { booking, enquiry })
  const superAdmin = await createHarness(t)

  const ambiguous = await superAdmin.remove(sameReference)
  assert.equal(ambiguous.status, 409)
  assert.match((await ambiguous.json()).message, /ambiguous|multiple/i)
  assert.equal(records.booking, booking)
  assert.equal(records.enquiry, enquiry)
  assert.equal(records.calls.bookingDeletes.length, 0)
  assert.equal(records.calls.enquiryDeletes.length, 0)
  assert.equal(records.calls.events.length, 0)
  assert.equal(records.calls.audits.length, 0)

  const objectIdReference = '507f1f77bcf86cd799439199'
  const referenceMatch = bookingFixture({ reference: objectIdReference })
  const idMatch = bookingFixture({
    _id: objectIdReference,
    reference: 'VT-DIFFERENT-REFERENCE',
  })
  records.setRecords([referenceMatch, idMatch], null)
  const sameCollectionAmbiguity = await superAdmin.remove(objectIdReference)
  assert.equal(sameCollectionAmbiguity.status, 409)
  assert.equal(records.calls.bookingDeletes.length, 0)
  assert.equal(records.calls.enquiryDeletes.length, 0)

  const missing = await superAdmin.remove('VT-NOT-FOUND')
  assert.equal(missing.status, 404)

  const regularAdmin = await createHarness(t, 'admin')
  const denied = await regularAdmin.remove(sameReference)
  assert.equal(denied.status, 403)
  assert.equal(records.calls.bookingDeletes.length, 0)
  assert.equal(records.calls.enquiryDeletes.length, 0)
})

test('booking delete removes only uniquely matched explicitly unpaid records', async (t) => {
  const booking = bookingFixture({ reference: 'VT-DELETE-BOOKING' })
  const records = installRecordMocks(t, { booking })
  const harness = await createHarness(t)

  const response = await harness.remove(booking.reference)

  assert.equal(response.status, 204)
  assert.equal(records.booking, null)
  assert.equal(records.calls.bookingDeletes.length, 1)
  assert.equal(records.calls.enquiryDeletes.length, 0)
  assert.deepEqual(records.calls.events, [[
    { id: booking.eventId },
    { $inc: { seatsAvailable: booking.ticketCount } },
  ]])
  assert.equal(records.calls.audits.length, 1)
  assert.equal(records.calls.audits[0].action, 'Booking deleted')
})

test('enquiry delete rejects payment histories and protects conditional-delete races', async (t) => {
  const paymentEvidence = [
    ...['created', 'failed', 'paid'].map((status) => ({
      paymentOrders: [{ orderId: 'order-1', status }],
    })),
    ...['Pending Payment', 'Submitted for Verification', 'Verified', 'Rejected', 'Refunded', 'failed']
      .map((status) => ({ upiPayments: [{ status, utr: 'UTR123' }] })),
    { paymentProvider: 'cashfree' },
    { cfOrderId: 'cf-order-1' },
    { cfPaymentId: 'cf-payment-1' },
    { cfPaymentSessionId: 'cf-session-1' },
    { cfPaymentStatus: 'FAILED' },
    { cfPaymentMethod: 'card' },
    { paymentReference: 'payment-reference-1' },
    { paymentOrderId: 'order-id-1' },
    { cfPaymentId: 'cf-payment-legacy-1' },
    { paymentOrderCreatedAt: new Date() },
    { paymentOrderAmountPaise: 100 },
    { paymentOrderAttemptNumber: 1 },
    { paidAt: new Date() },
    { paymentVerifiedAt: new Date() },
    { paymentFailureReason: 'failed' },
    { paymentAttemptId: 'attempt-1' },
    { paymentAttemptPricing: { total: 250 } },
    { paymentAttemptedAt: new Date() },
    { utr: 'UTR123' },
    { auditHistory: [{ action: 'payment_attempted' }] },
  ]
  const bookingEvidence = [
    { paymentOrders: [{ orderId: 'order-1' }] },
    { upiPayments: [{ status: 'Verified' }] },
    { paymentProvider: 'cashfree' },
    { cashfreePaymentId: 'cf-payment-1' },
    { cfOrderId: 'cf-order-1' },
    { cfPaymentSessionId: 'cf-session-1' },
    { cfPaymentStatus: 'FAILED' },
    { cfPaymentId: 'cf-payment-legacy-1' },
    { paymentReference: 'reference-1' },
    { paymentOrderCreatedAt: new Date() },
    { paymentOrderAttemptNumber: 1 },
    { paymentAttemptId: 'attempt-1' },
    { paymentAttemptedAt: new Date() },
    { paymentFailureReason: 'failed' },
    { paymentVerifiedAt: new Date() },
    { paidAt: new Date() },
    { utr: 'UTR123' },
    { paymentAuditHistory: [{ action: 'paid' }] },
  ]

  const records = installRecordMocks(t)
  const harness = await createHarness(t)
  for (const evidence of bookingEvidence) {
    const booking = bookingFixture({ reference: `VT-BOOKING-EVIDENCE-${Object.keys(evidence)[0]}`, ...evidence })
    records.setRecords(booking, null)
    const response = await harness.remove(booking.reference)

    assert.equal(response.status, 409, `Booking payment evidence should be protected: ${Object.keys(evidence)[0]}`)
    assert.equal(records.booking, booking)
    assert.equal(records.calls.bookingDeletes.length, 0)
    assert.equal(records.calls.events.length, 0)
    assert.equal(records.calls.audits.length, 0)
  }

  for (const evidence of paymentEvidence) {
    const enquiry = enquiryFixture(evidence)
    records.setRecords(null, enquiry)
    const response = await harness.remove(enquiry.requestId)

    assert.equal(response.status, 409, `payment evidence should be protected: ${Object.keys(evidence)[0]}`)
    assert.equal(records.enquiry, enquiry)
    assert.equal(records.calls.bookingDeletes.length, 0)
    assert.equal(records.calls.enquiryDeletes.length, 0)
    assert.equal(records.calls.events.length, 0)
    assert.equal(records.calls.audits.length, 0)
  }

  const changedToPaid = enquiryFixture()
  records.setRecords(null, changedToPaid,
    (source, record) => {
      if (source === 'enquiry' && record) record.paymentStatus = 'paid'
    })
  const raceResponse = await harness.remove(changedToPaid.requestId)

  assert.equal(raceResponse.status, 409)
  assert.equal(records.enquiry, changedToPaid)
  assert.equal(records.calls.enquiryDeletes.length, 1)
  assert.equal(records.calls.audits.length, 0)
})

test('enquiry delete removes one uniquely identified explicitly unpaid record', async (t) => {
  const enquiry = enquiryFixture()
  const records = installRecordMocks(t, { enquiry })
  const harness = await createHarness(t)

  const response = await harness.remove(enquiry.requestId)

  assert.equal(response.status, 204)
  assert.equal(records.enquiry, null)
  assert.equal(records.calls.bookingDeletes.length, 0)
  assert.equal(records.calls.enquiryDeletes.length, 1)
  assert.equal(records.calls.events.length, 0)
  assert.equal(records.calls.audits.length, 1)
  assert.equal(records.calls.audits[0].action, 'Booking enquiry deleted')
})
