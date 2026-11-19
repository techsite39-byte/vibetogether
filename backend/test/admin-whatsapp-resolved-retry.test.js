import assert from 'node:assert/strict'
import express from 'express'
import { test } from 'node:test'
import { createAdminAuthRouter, hashAdminPassword } from '../src/auth/adminAuth.js'
import { createAdminRouter } from '../src/routes/admin.js'
import { resolveBookingEnquiryByReference } from '../src/services/bookingEnquiries.js'
import { createWhatsAppNotificationService } from '../src/services/whatsappNotifications.js'

const sessionSecret = 'a-session-secret-with-more-than-thirty-two-characters'

function getPath(record, path) {
  return path.split('.').reduce((value, key) => value?.[key], record)
}

function setPath(record, path, value) {
  const parts = path.split('.')
  const key = parts.pop()
  const target = parts.reduce((valueAtPath, part) => {
    valueAtPath[part] ??= {}
    return valueAtPath[part]
  }, record)
  target[key] = value
}

function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition) => matches(record, condition))
    if (key === '$and') return expected.every((condition) => matches(record, condition))

    const actual = getPath(record, key)
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected) return actual !== expected.$ne
      if ('$nin' in expected) return !expected.$nin.includes(actual)
      if ('$lte' in expected) return actual <= expected.$lte
      if ('$in' in expected) return expected.$in.includes(actual)
    }

    return String(actual) === String(expected)
  })
}

function createModel(initialRecords = []) {
  const records = structuredClone(initialRecords)
  let findCalls = 0
  let findOneCalls = 0
  let updateCalls = 0

  return {
    find(filter) {
      findCalls += 1
      let limit = Infinity
      return {
        limit(count) {
          limit = count
          return this
        },
        lean: async () => records.filter((record) => matches(record, filter))
          .slice(0, limit)
          .map((record) => structuredClone(record)),
      }
    },
    findOne(filter) {
      findOneCalls += 1
      return {
        lean: async () => {
          const record = records.find((item) => matches(item, filter))
          return record ? structuredClone(record) : null
        },
      }
    },
    findOneAndUpdate(filter, update) {
      updateCalls += 1
      const record = records.find((item) => matches(item, filter))
      if (record) {
        for (const [path, value] of Object.entries(update.$set ?? {})) {
          setPath(record, path, structuredClone(value))
        }
        for (const [path, amount] of Object.entries(update.$inc ?? {})) {
          setPath(record, path, (getPath(record, path) ?? 0) + amount)
        }
        for (const [path, value] of Object.entries(update.$push ?? {})) {
          const values = Array.isArray(value?.$each) ? value.$each : [value]
          setPath(record, path, [...(getPath(record, path) ?? []), ...structuredClone(values)])
        }
      }
      return { lean: async () => record ? structuredClone(record) : null }
    },
    get record() {
      return records[0] ? structuredClone(records[0]) : null
    },
    get findCalls() {
      return findCalls
    },
    get findOneCalls() {
      return findOneCalls
    },
    get updateCalls() {
      return updateCalls
    },
  }
}

function makeEnquiry(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439012',
    requestId: '4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b',
    reference: 'VT-BOOKING-123',
    name: 'Test Booker',
    mobile: '+919876543210',
    email: 'booker@example.test',
    paymentStatus: 'failed',
    paymentOrderId: 'order-test-123',
    paymentAmount: 897,
    amount: 897,
    ticketQuantity: 1,
    ticketTypeName: 'General Admission',
    whatsappConsent: true,
    whatsappNotification: {
      messageType: 'payment_assistance',
      status: 'failed',
      failureReason: 'Previous test failure',
      retryable: true,
      inProgress: false,
      attemptCount: 1,
      idempotencyKey: 'previous-test-attempt',
      history: [{ status: 'failed', source: 'test' }],
    },
    attendeeNotifications: [{ attendeeIndex: 0, status: 'delivered', providerMessageId: 'attendee-message' }],
    adminNotification: { status: 'sent', providerMessageId: 'admin-message', history: [{ status: 'sent' }] },
    ...overrides,
  }
}

function createNotificationService(currentModel, fetchImpl) {
  return createWhatsAppNotificationService({
    bookingEnquiryModel: currentModel,
    phoneNumberId: 'test-phone-number-id',
    accessToken: 'test-access-token',
    apiVersion: 'v22.0',
    bookingTemplateLanguage: 'en',
    successTemplateName: 'vibetogether_payment_success',
    failureTemplateName: 'vibetogether_payment_failed',
    notificationsEnabled: true,
    fetchImpl,
  })
}

async function createAdminHarness(t, bookingEnquiryRepository, whatsappNotifications) {
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
  const sessions = new Map()
  const sessionModel = {
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
    whatsappNotifications,
  }))
  app.use((error, _request, response, _next) => {
    response.status(error.status ?? 500).json({ message: error.message })
  })

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
  return {
    baseUrl,
    headers: {
      Cookie: cookies.map((cookie) => cookie.split(';', 1)[0]).join('; '),
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-CSRF-Token': loginPayload.csrfToken,
    },
  }
}

function createRepository(currentModel, legacyModel) {
  return {
    resolveByReference(identifier) {
      return resolveBookingEnquiryByReference(identifier, currentModel, legacyModel)
    },
  }
}

test('booking enquiry resolution supports requestId, reference, and _id in both collections', async () => {
  const currentEnquiry = makeEnquiry({
    _id: '507f1f77bcf86cd799439021',
    requestId: 'current-request-id',
    reference: 'VT-CURRENT-123',
  })
  const legacyEnquiry = makeEnquiry({
    _id: '507f1f77bcf86cd799439022',
    requestId: 'legacy-request-id',
    reference: 'VT-LEGACY-123',
  })
  const currentModel = createModel([currentEnquiry])
  const legacyModel = createModel([legacyEnquiry])
  const identifiers = [
    { identifier: currentEnquiry.requestId, enquiry: currentEnquiry, model: currentModel, collection: 'bookings-db' },
    { identifier: currentEnquiry.reference, enquiry: currentEnquiry, model: currentModel, collection: 'bookings-db' },
    { identifier: currentEnquiry._id, enquiry: currentEnquiry, model: currentModel, collection: 'bookings-db' },
    { identifier: legacyEnquiry.requestId, enquiry: legacyEnquiry, model: legacyModel, collection: 'user-db' },
    { identifier: legacyEnquiry.reference, enquiry: legacyEnquiry, model: legacyModel, collection: 'user-db' },
    { identifier: legacyEnquiry._id, enquiry: legacyEnquiry, model: legacyModel, collection: 'user-db' },
  ]

  for (const { identifier, enquiry, model, collection } of identifiers) {
    const resolved = await resolveBookingEnquiryByReference(identifier, currentModel, legacyModel)

    assert.equal(resolved.enquiry._id, enquiry._id)
    assert.equal(resolved.model, model)
    assert.equal(resolved.sourceCollection, collection)
  }
})

test('admin primary retry reuses and updates the exact legacy enquiry without duplicate sends or payment changes', async (t) => {
  const enquiry = makeEnquiry()
  const currentModel = createModel()
  const legacyModel = createModel([enquiry])
  let providerCalls = 0
  const service = createNotificationService(currentModel, async () => {
    providerCalls += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.test-primary' }] }),
    }
  })
  const harness = await createAdminHarness(
    t,
    createRepository(currentModel, legacyModel),
    service,
  )

  const retry = () => fetch(
    `${harness.baseUrl}/api/admin/bookings/${enquiry.requestId}/whatsapp/retry`,
    {
      method: 'POST',
      headers: harness.headers,
      body: JSON.stringify({ target: 'primary' }),
    },
  )
  const responses = await Promise.all([retry(), retry()])
  const results = await Promise.all(responses.map(async (response) => ({
    status: response.status,
    body: await response.json(),
  })))

  assert.deepEqual(results.map(({ status }) => status), [200, 200])
  assert.equal(providerCalls, 1)
  assert.ok(results.some(({ body }) => body.result?.result?.sent === true))
  assert.equal(currentModel.findOneCalls, 0)
  assert.equal(currentModel.updateCalls, 0)
  assert.equal(legacyModel.findCalls, 2)
  assert.equal(legacyModel.updateCalls, 2)

  const saved = legacyModel.record
  assert.equal(saved.paymentStatus, 'failed')
  assert.equal(saved.whatsappNotification.status, 'sent')
  assert.equal(saved.whatsappNotification.providerMessageId, 'wamid.test-primary')
  assert.equal(saved.whatsappNotification.history.filter((entry) => entry.status === 'sent').length, 1)
  assert.deepEqual(saved.attendeeNotifications, enquiry.attendeeNotifications)
  assert.deepEqual(saved.adminNotification, enquiry.adminNotification)
})

test('provider rejection during admin retry preserves payment and independent notification state', async (t) => {
  const enquiry = makeEnquiry()
  const currentModel = createModel()
  const legacyModel = createModel([enquiry])
  const service = createNotificationService(currentModel, async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: 'Rejected test message', code: 132001 } }),
  }))
  const harness = await createAdminHarness(
    t,
    createRepository(currentModel, legacyModel),
    service,
  )

  const response = await fetch(
    `${harness.baseUrl}/api/admin/bookings/${enquiry.requestId}/whatsapp/retry`,
    {
      method: 'POST',
      headers: harness.headers,
      body: JSON.stringify({ target: 'primary' }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal((await response.json()).result.result.failed, true)
  const saved = legacyModel.record
  assert.equal(saved.paymentStatus, 'failed')
  assert.equal(saved.whatsappNotification.status, 'failed')
  assert.deepEqual(saved.attendeeNotifications, enquiry.attendeeNotifications)
  assert.deepEqual(saved.adminNotification, enquiry.adminNotification)
})

test('missing enquiry returns a controlled 404 and does not invoke notification service', async (t) => {
  const currentModel = createModel()
  const legacyModel = createModel()
  let retryCalls = 0
  const harness = await createAdminHarness(
    t,
    createRepository(currentModel, legacyModel),
    { async resendNotification() { retryCalls += 1 } },
  )

  const response = await fetch(`${harness.baseUrl}/api/admin/bookings/missing-request/whatsapp/retry`, {
    method: 'POST',
    headers: harness.headers,
    body: JSON.stringify({ target: 'primary' }),
  })

  assert.equal(response.status, 404)
  assert.match((await response.json()).message, /Booking enquiry was not found/)
  assert.equal(retryCalls, 0)
})

test('admin retry fails closed when the uniqueness-aware resolver is unavailable', async (t) => {
  let retryCalls = 0
  const harness = await createAdminHarness(
    t,
    { async findByReference() { return makeEnquiry() } },
    { async resendNotification() { retryCalls += 1 } },
  )

  const response = await fetch(`${harness.baseUrl}/api/admin/bookings/legacy-request/whatsapp/retry`, {
    method: 'POST',
    headers: harness.headers,
    body: JSON.stringify({ target: 'primary' }),
  })

  assert.equal(response.status, 503)
  assert.match((await response.json()).message, /retry lookup is unavailable/)
  assert.equal(retryCalls, 0)
})

test('ambiguous matches across current and legacy collections return 409 without sending', async (t) => {
  const requestId = 'shared-request-id'
  const currentModel = createModel([makeEnquiry({ _id: 'current-record', requestId })])
  const legacyModel = createModel([makeEnquiry({ _id: 'legacy-record', requestId })])
  let retryCalls = 0
  const harness = await createAdminHarness(
    t,
    createRepository(currentModel, legacyModel),
    { async resendNotification() { retryCalls += 1 } },
  )

  const response = await fetch(`${harness.baseUrl}/api/admin/bookings/${requestId}/whatsapp/retry`, {
    method: 'POST',
    headers: harness.headers,
    body: JSON.stringify({ target: 'primary' }),
  })

  assert.equal(response.status, 409)
  assert.match((await response.json()).message, /matches multiple enquiries/)
  assert.equal(retryCalls, 0)
  assert.equal(currentModel.updateCalls, 0)
  assert.equal(legacyModel.updateCalls, 0)
})

test('notification service returns a controlled not-found error and rejects a mismatched supplied enquiry', async () => {
  const currentModel = createModel()
  const service = createNotificationService(currentModel, async () => {
    throw new Error('The mocked provider must not be called.')
  })

  await assert.rejects(
    service.resendNotification('missing-request'),
    (error) => error.status === 404 && error.message === 'Booking not found.',
  )
  await assert.rejects(
    service.resendNotification('expected-request', {
      booking: makeEnquiry({ requestId: 'different-request' }),
    }),
    (error) => error.status === 409,
  )
})

test('notification service rejects duplicate request IDs instead of choosing one', async () => {
  const requestId = 'duplicate-request-id'
  const currentModel = createModel([
    makeEnquiry({ _id: 'first-record', requestId }),
    makeEnquiry({ _id: 'second-record', requestId }),
  ])
  const service = createNotificationService(currentModel, async () => {
    throw new Error('The mocked provider must not be called.')
  })

  await assert.rejects(
    service.resendNotification(requestId),
    (error) => error.status === 409 && /multiple enquiries/.test(error.message),
  )
})
