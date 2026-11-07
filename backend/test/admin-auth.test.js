import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import express from 'express'
import { afterEach, test } from 'node:test'
import { createAdminRouter } from '../src/routes/admin.js'
import {
  createAdminAuthRouter,
  hashAdminPassword,
} from '../src/auth/adminAuth.js'
import { provisionAdminAccount } from '../src/services/adminSetup.js'

const servers = []

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

async function startAuthServer(options) {
  const app = express()
  app.use(express.json())
  const sessionModel = options.sessionModel ?? createSessionModel()
  app.use('/api/admin/auth', createAdminAuthRouter({ ...options, sessionModel }))
  if (options.protectRoutes) {
    app.use('/api/admin', createAdminRouter({
      adminModel: options.model,
      sessionModel,
      sessionSecret: options.sessionSecret,
    }))
  }
  app.use((error, _request, response, _next) => {
    response.status(error.status ?? 500).end()
  })
  const server = app.listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

test('authenticates admins, restores sessions, and enforces CSRF on logout', async () => {
  const password = 'correct-horse-battery-staple'
  const passwordHash = await hashAdminPassword(password)
  const admin = {
    _id: '507f1f77bcf86cd799439011',
    username: 'admin@example.com',
    role: 'admin',
    active: true,
    passwordHash,
    async save() {},
  }
  const model = {
    findOne() {
      return {
        select() {
          return { exec: async () => admin }
        },
      }
    },
    findById(id) {
      return {
        select() {
          return {
            lean: async () => id === admin._id ? {
              _id: admin._id,
              username: admin.username,
              role: admin.role,
              active: admin.active,
            } : null,
          }
        },
      }
    },
  }
  const baseUrl = await startAuthServer({
    bootstrapPasswordHash: passwordHash,
    model,
    protectRoutes: true,
    sessionSecret: 'a-session-secret-with-more-than-thirty-two-characters',
    username: admin.username,
  })

  const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: admin.username, password }),
  })
  assert.equal(login.status, 200)
  const loginPayload = await login.json()
  assert.equal(loginPayload.admin.role, 'admin')
  const cookies = login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie') ?? '']
  const cookieHeader = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ')
  assert.match(cookieHeader, /vt_admin_session=/)
  assert.match(cookieHeader, /vt_admin_csrf=/)

  const protectedWithoutSession = await fetch(`${baseUrl}/api/admin/not-a-resource`)
  assert.equal(protectedWithoutSession.status, 401)
  const protectedWithSession = await fetch(`${baseUrl}/api/admin/not-a-resource`, {
    headers: { Cookie: cookieHeader },
  })
  assert.equal(protectedWithSession.status, 404)

  const session = await fetch(`${baseUrl}/api/admin/auth/session`, {
    headers: { Cookie: cookieHeader },
  })
  assert.equal(session.status, 200)
  assert.equal((await session.json()).admin.username, admin.username)

  const csrfFailure = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, Origin: 'http://localhost:5173' },
  })
  assert.equal(csrfFailure.status, 403)

  const logout = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      Origin: 'http://localhost:5173',
      'X-CSRF-Token': loginPayload.csrfToken,
    },
  })
  assert.equal(logout.status, 204)
  assert.ok(
    (logout.headers.getSetCookie?.() ?? []).some((cookie) =>
      /vt_admin_session=.*Max-Age=0/.test(cookie),
    ),
  )
  const revokedSession = await fetch(`${baseUrl}/api/admin/not-a-resource`, {
    headers: { Cookie: cookieHeader },
  })
  assert.equal(revokedSession.status, 401)

  const secret = 'a-session-secret-with-more-than-thirty-two-characters'
  const expiredPayload = Buffer.from(
    JSON.stringify({ sub: admin._id, exp: Date.now() - 1 }),
  ).toString('base64url')
  const expiredSignature = createHmac('sha256', secret)
    .update(expiredPayload)
    .digest('base64url')
  const expiredSession = await fetch(`${baseUrl}/api/admin/not-a-resource`, {
    headers: { Cookie: `vt_admin_session=${expiredPayload}.${expiredSignature}` },
  })
  assert.equal(expiredSession.status, 401)
})

test('rejects invalid credentials and reports unconfigured auth', async () => {
  const passwordHash = await hashAdminPassword('correct-horse-battery-staple')
  const admin = {
    _id: '507f1f77bcf86cd799439011',
    username: 'admin',
    role: 'admin',
    active: true,
    passwordHash,
  }
  const model = {
    findOne() {
      return { select: () => ({ exec: async () => admin }) }
    },
  }
  const configuredUrl = await startAuthServer({
    bootstrapPasswordHash: passwordHash,
    model,
    sessionSecret: 'a-session-secret-with-more-than-thirty-two-characters',
    username: 'admin',
  })
  const invalidLogin = await fetch(`${configuredUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
  })
  assert.equal(invalidLogin.status, 401)

  const unconfiguredUrl = await startAuthServer({})
  const configuration = await fetch(`${unconfiguredUrl}/api/admin/auth/configuration`)
  const configurationData = await configuration.json()
  assert.equal(configurationData.configured, false)
  assert.deepEqual(configurationData.missingConfiguration, [
    'ADMIN_EMAIL',
    'ADMIN_SESSION_SECRET',
  ])
  const login = await fetch(`${unconfiguredUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'correct-horse-battery-staple' }),
  })
  assert.equal(login.status, 503)
})

test('provisions a bcrypt admin once and refuses to replace an existing password', async () => {
  const records = new Map()
  const model = {
    async init() {},
    findOne({ username }) {
      return {
        select() {
          return {
            exec: async () => records.get(username) ?? null,
          }
        },
      }
    },
    async create(record) {
      if (records.has(record.username)) {
        throw Object.assign(new Error('Duplicate key'), { code: 11000 })
      }
      const saved = { ...record, _id: 'admin-id' }
      records.set(record.username, saved)
      return saved
    },
  }
  const password = 'an-admin-password-used-only-in-this-test'
  const created = await provisionAdminAccount({
    model,
    password,
    username: 'adminvibe@gmail.com',
  })
  assert.deepEqual(created, { created: true, role: 'admin' })
  assert.match(records.get('adminvibe@gmail.com').passwordHash, /^\$2[aby]\$/)

  const existing = await provisionAdminAccount({
    model,
    password,
    username: 'ADMINVIBE@gmail.com',
  })
  assert.deepEqual(existing, { created: false, role: 'admin' })
  assert.equal(records.size, 1)
  await assert.rejects(
    provisionAdminAccount({
      model,
      password: 'a-different-admin-password-used-for-testing',
      username: 'adminvibe@gmail.com',
    }),
    /already exists/,
  )
  assert.equal(records.size, 1)
})
