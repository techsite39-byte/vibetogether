import assert from 'node:assert/strict'
import express from 'express'
import { test } from 'node:test'
import { createAdminAuthRouter, hashAdminPassword } from '../src/auth/adminAuth.js'
import { ActivityLog, Booking } from '../src/models/adminRecords.js'
import { BookingEnquiry } from '../src/models/bookingEnquiry.js'
import { Event } from '../src/models/event.js'
import { createAdminRouter } from '../src/routes/admin.js'

const sessionSecret = 'a-session-secret-with-more-than-thirty-two-characters'

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

  t.mock.method(Event, 'updateOne', async () => ({ modifiedCount: 1 }))
  t.mock.method(ActivityLog, 'create', async (entry) => entry)

  const legacyBookingEnquiryModel = {
    find() {
      return { limit() { return this }, lean: async () => [] }
    },
    async findOne() {
      return null
    },
    async updateOne() {
      return { modifiedCount: 1 }
    },
    findOneAndDelete() {
      return { lean: async () => null }
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
    legacyBookingEnquiryModel,
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

  return { baseUrl, headers, legacyBookingEnquiryModel }
}

test('PATCH and DELETE return 404 when booking is not found in any collection', async (t) => {
  const { baseUrl, headers } = await createHarness(t)
  const missingId = '6afcb6145b9ed61284336bc4'

  const patchResponse = await fetch(`${baseUrl}/api/admin/bookings/${missingId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'confirmed' }),
  })
  assert.equal(patchResponse.status, 404)
  const patchBody = await patchResponse.json()
  assert.equal(patchBody.message, 'Booking record was not found.')

  const deleteResponse = await fetch(`${baseUrl}/api/admin/bookings/${missingId}`, {
    method: 'DELETE',
    headers,
  })
  assert.equal(deleteResponse.status, 404)
  const deleteBody = await deleteResponse.json()
  assert.equal(deleteBody.message, 'Booking record was not found.')
})

test('PATCH finds and cancels a Booking record by requestId when reference is empty or not provided', async (t) => {
  const { baseUrl, headers } = await createHarness(t)
  const testRequestId = 'req_test_12345'
  let savedStatus = ''

  const originalFind = Booking.find
  const originalFindOne = Booking.findOne
  const originalFindOneAndUpdate = Booking.findOneAndUpdate

  t.after(() => {
    Booking.find = originalFind
    Booking.findOne = originalFindOne
    Booking.findOneAndUpdate = originalFindOneAndUpdate
  })

  Booking.find = () => ({
    limit() { return this },
    exec: async () => [{
      _id: '507f1f77bcf86cd799439099',
      requestId: testRequestId,
      reference: 'VT-999',
      status: 'pending',
      paymentStatus: 'not_required',
      eventId: 'evt-1',
      ticketCount: 2,
    }],
  })

  Booking.findOneAndUpdate = (query, update) => ({
    exec: async () => {
      savedStatus = update.$set.status
      return {
        _id: '507f1f77bcf86cd799439099',
        requestId: testRequestId,
        reference: 'VT-999',
        status: savedStatus,
        paymentStatus: 'not_required',
        eventId: 'evt-1',
        ticketCount: 2,
      }
    },
  })

  const patchResponse = await fetch(`${baseUrl}/api/admin/bookings/${testRequestId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'cancelled' }),
  })
  assert.equal(patchResponse.status, 200)
  assert.equal(savedStatus, 'cancelled')
})

test('PATCH updates booking enquiry from legacy collection when modern enquiry is missing', async (t) => {
  const { baseUrl, headers, legacyBookingEnquiryModel } = await createHarness(t)
  const legacyId = '6afcb6145b9ed61284336bc4'
  let savedLegacyStatus = ''

  legacyBookingEnquiryModel.find = () => ({
    limit() { return this },
    exec: async () => [{
      _id: legacyId,
      requestId: 'req_legacy_456',
      reference: 'VT-LEGACY-456',
      status: 'pending',
      name: 'Legacy User',
      mobile: '+919876543210',
      toObject() {
        return {
          _id: legacyId,
          requestId: 'req_legacy_456',
          reference: 'VT-LEGACY-456',
          status: savedLegacyStatus || 'pending',
          name: 'Legacy User',
          mobile: '+919876543210',
        }
      },
      save: async function() {
        savedLegacyStatus = this.status
      },
    }],
  })

  const patchResponse = await fetch(`${baseUrl}/api/admin/bookings/${legacyId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'confirmed' }),
  })
  assert.equal(patchResponse.status, 200)
  assert.equal(savedLegacyStatus, 'confirmed')
})

test('PATCH rejects ambiguous identifier when matching multiple distinct records across collections', async (t) => {
  const { baseUrl, headers } = await createHarness(t)
  const sharedIdentifier = 'ambiguous-id-123'

  const originalBookingFind = Booking.find
  const originalEnquiryFind = BookingEnquiry.find
  t.after(() => {
    Booking.find = originalBookingFind
    BookingEnquiry.find = originalEnquiryFind
  })

  Booking.find = () => ({
    limit() { return this },
    exec: async () => [{
      _id: '507f1f77bcf86cd799439001',
      requestId: sharedIdentifier,
      reference: 'VT-AAA',
      status: 'pending',
    }],
  })

  BookingEnquiry.find = () => ({
    limit() { return this },
    exec: async () => [{
      _id: '507f1f77bcf86cd799439002', // Different _id: conflict!
      requestId: sharedIdentifier,
      reference: 'VT-BBB',
      status: 'pending',
    }],
  })

  const patchResponse = await fetch(`${baseUrl}/api/admin/bookings/${sharedIdentifier}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'confirmed' }),
  })
  assert.equal(patchResponse.status, 409)
  const body = await patchResponse.json()
  assert.match(body.message, /matches multiple records/)
})
