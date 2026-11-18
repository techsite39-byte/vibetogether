import assert from 'node:assert/strict'
import express from 'express'
import { test } from 'node:test'
import { createAdminAuthRouter, hashAdminPassword } from '../src/auth/adminAuth.js'
import { createAdminRouter } from '../src/routes/admin.js'
import { findBookingEnquiryByReference } from '../src/services/bookingEnquiries.js'

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

test('primary retry looks up an enquiry by requestId and logs no raw identifier', async (t) => {
  const requestId = '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b'
  const enquiry = {
    _id: '507f1f77bcf86cd799439012',
    requestId,
    reference: 'VT-BOOKING-123',
    mobile: '919876543210',
    whatsappConsent: true,
    whatsappNotification: { status: 'failed', history: [] },
    attendeeNotifications: [],
    adminNotification: null,
  }
  const enquiryModel = {
    findOne(filter) {
      return {
        lean: async () => {
          const matches = (filter.$or ?? [filter]).some((condition) =>
            Object.entries(condition).every(([key, value]) => String(enquiry[key]) === String(value)),
          )
          return matches ? enquiry : null
        },
      }
    },
  }
  const lookupIdentifiers = []
  const notificationCalls = []
  const bookingEnquiryRepository = {
    findByReference(identifier) {
      lookupIdentifiers.push(identifier)
      return findBookingEnquiryByReference(identifier, enquiryModel)
    },
  }
  const password = 'correct-horse-battery-staple'
  const passwordHash = await hashAdminPassword(password)
  const admin = {
    _id: '507f1f77bcf86cd799439011',
    username: 'admin@example.test',
    role: 'admin',
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
    bookingEnquiryRepository,
    sessionModel,
    sessionSecret,
    whatsappNotifications: {
      async resendNotification(id, options) {
        notificationCalls.push({ id, options })
        return { sent: false, failed: true, message: 'Stubbed; no provider call.' }
      },
    },
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

  const diagnostics = []
  const originalInfo = console.info
  const originalWarn = console.warn
  console.info = (message, details) => diagnostics.push({ level: 'info', message, details })
  console.warn = (message, details) => diagnostics.push({ level: 'warn', message, details })
  try {
    const response = await fetch(`${baseUrl}/api/admin/bookings/${requestId}/whatsapp/retry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target: 'primary' }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).result.sent, false)

    const missingResponse = await fetch(`${baseUrl}/api/admin/bookings/not-a-real-reference/whatsapp/retry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target: 'primary' }),
    })
    assert.equal(missingResponse.status, 404)
  } finally {
    console.info = originalInfo
    console.warn = originalWarn
  }

  assert.deepEqual(lookupIdentifiers, [requestId, requestId, 'not-a-real-reference'])
  assert.deepEqual(notificationCalls, [{
    id: requestId,
    options: { target: 'primary', attendeeIndex: undefined, force: true },
  }])
  assert.deepEqual(
    diagnostics.map(({ level, details }) => [level, details.matchedBy ?? details.identifierType]),
    [['info', 'requestId'], ['warn', 'bookingReference']],
  )
  assert.equal(JSON.stringify(diagnostics).includes(requestId), false)
  assert.equal(JSON.stringify(diagnostics).includes(enquiry.mobile), false)
})
