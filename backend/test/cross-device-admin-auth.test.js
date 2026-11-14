import assert from 'node:assert/strict'
import express from 'express'
import cors from 'cors'
import { afterEach, test } from 'node:test'
import { createAdminAuthRouter, createRequireAdmin, hashAdminPassword } from '../src/auth/adminAuth.js'
import { createAdminRouter } from '../src/routes/admin.js'

const servers = []

function createMockAdminModel() {
  const admins = new Map()
  return {
    admins,
    async create(record) {
      const doc = {
        _id: '60c72b2f9b1d8b2bad000001',
        name: record.name || 'Admin User',
        email: record.email,
        username: record.username || record.email,
        passwordHash: record.passwordHash,
        role: record.role || 'super_admin',
        active: record.active !== false,
        status: record.status || 'active',
        save: async function () {
          admins.set(String(this._id), this)
          return this
        },
      }
      admins.set(String(doc._id), doc)
      return doc
    },
    findOne(query) {
      return {
        select: () => ({
          exec: async () => {
            for (const admin of admins.values()) {
              if (
                (query.$or &&
                  query.$or.some(
                    (clause) =>
                      (clause.email && clause.email === admin.email) ||
                      (clause.username && clause.username === admin.username),
                  )) ||
                (query.email && query.email === admin.email) ||
                (query.username && query.username === admin.username)
              ) {
                return admin
              }
            }
            return null
          },
        }),
      }
    },
    findById(id) {
      return {
        select: () => ({
          lean: async () => admins.get(String(id)) ?? null,
        }),
      }
    },
  }
}

function createMockSessionModel() {
  const sessions = new Map()
  return {
    sessions,
    async create(session) {
      sessions.set(session.sessionId, session)
      return session
    },
    findOne({ sessionId, adminId }) {
      return {
        lean: async () => {
          const s = sessions.get(sessionId)
          if (!s) return null
          if (adminId && String(s.adminId) !== String(adminId)) return null
          return s
        },
      }
    },
    async deleteOne({ sessionId }) {
      sessions.delete(sessionId)
    },
    async deleteMany({ adminId }) {
      for (const [id, s] of sessions) {
        if (String(s.adminId) === String(adminId)) sessions.delete(id)
      }
    },
  }
}

async function startCrossDeviceServer({ corsOrigins, secureCookies = false }) {
  const app = express()
  const sessionSecret = 'super-secret-session-key-at-least-32-chars-long!!'
  const adminModel = createMockAdminModel()
  const sessionModel = createMockSessionModel()

  const passwordHash = await hashAdminPassword('test-only-password-123!')
  await adminModel.create({
    name: 'Sanjay Admin',
    email: 'admin@example.test',
    username: 'admin@example.test',
    passwordHash,
    role: 'super_admin',
    active: true,
  })

  app.use(
    cors({
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'X-CSRF-Token',
        'Authorization',
        'Accept',
        'Origin',
        'X-Requested-With',
      ],
      exposedHeaders: ['Set-Cookie', 'X-CSRF-Token', 'Retry-After'],
      origin(origin, callback) {
        if (!origin) {
          callback(null, true)
          return
        }

        const isLocalNetworkOrigin =
          /^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)(?::\d+)?$/i.test(
            origin,
          )
        const isVibeTogetherDomain =
          /^https:\/\/(?:[a-z0-9-]+\.)?vibetogether\.show(?::\d+)?$/i.test(origin)
        const isRenderFrontend =
          /^https:\/\/vibetogether[a-z0-9-]*\.onrender\.com(?::\d+)?$/i.test(origin)

        if (
          corsOrigins.includes(origin) ||
          isVibeTogetherDomain ||
          isRenderFrontend ||
          isLocalNetworkOrigin
        ) {
          callback(null, true)
          return
        }

        callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403 }))
      },
    }),
  )

  app.use(express.json())
  app.use(
    '/api/admin/auth',
    createAdminAuthRouter({
      username: 'admin@example.test',
      bootstrapPasswordHash: passwordHash,
      sessionSecret,
      model: adminModel,
      sessionModel,
      secureCookies,
      corsOrigins,
    }),
  )

  const server = app.listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    adminModel,
    sessionModel,
    sessionSecret,
  }
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

test('cross-device admin authentication: returns token and supports Bearer authorization without cookies', async () => {
  const { url } = await startCrossDeviceServer({
    corsOrigins: ['https://www.vibetogether.show', 'https://vibetogether.show'],
    secureCookies: true,
  })

  // 1. Admin logs in with valid credentials
  const loginResponse = await fetch(`${url}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.test',
      password: 'test-only-password-123!',
      rememberMe: true,
    }),
  })

  assert.equal(loginResponse.status, 200)
  const loginData = await loginResponse.json()

  // Verify response includes admin identity, csrfToken, token, and expiresAt
  assert.equal(loginData.admin.email, 'admin@example.test')
  assert.equal(loginData.admin.role, 'super_admin')
  assert.ok(loginData.csrfToken, 'Must include csrfToken')
  assert.ok(loginData.token, 'Must include token for mobile / cross-site clients')
  assert.ok(loginData.expiresAt, 'Must include expiresAt timestamp')

  // Verify Set-Cookie header contains Path=/ and Partitioned
  const setCookies = loginResponse.headers.getSetCookie()
  const sessionCookie = setCookies.find((c) => c.startsWith('vt_admin_session='))
  assert.ok(sessionCookie, 'Cookie must still be issued for same-site clients')
  assert.ok(sessionCookie.includes('Path=/'), 'Cookie path must be root Path=/')
  assert.ok(sessionCookie.includes('Partitioned'), 'Cookie must be Partitioned for CHIPS support')

  // 2. Mobile client accessing /api/admin/auth/me using Bearer token ONLY (NO COOKIES SENT)
  // This simulates Safari on iOS / Chrome on Android where third-party cookies are blocked by default
  const meResponse = await fetch(`${url}/api/admin/auth/me`, {
    headers: {
      Authorization: `Bearer ${loginData.token}`,
      // Notice: NO Cookie header is passed!
    },
  })

  assert.equal(meResponse.status, 200, 'Mobile client with Bearer token must authenticate successfully')
  const meData = await meResponse.json()
  assert.equal(meData.admin.email, 'admin@example.test')
  assert.equal(meData.admin.role, 'super_admin')
  assert.equal(meData.token, loginData.token)

  // 3. Mobile client logging out using Bearer token without cookies
  const logoutResponse = await fetch(`${url}/api/admin/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginData.token}`,
      // No cookies and no CSRF header required because Bearer token is inherently CSRF-safe
    },
  })
  assert.equal(logoutResponse.status, 204, 'Logout with Bearer token must succeed')

  // 4. Session has been revoked: subsequent calls with that token fail with 401
  const revokedResponse = await fetch(`${url}/api/admin/auth/me`, {
    headers: {
      Authorization: `Bearer ${loginData.token}`,
    },
  })
  assert.equal(revokedResponse.status, 401, 'Revoked token must be rejected')
})

test('CORS preflight and cross-origin headers allow production, apex, render, and mobile LAN origins', async () => {
  const { url } = await startCrossDeviceServer({
    corsOrigins: ['https://www.vibetogether.show', 'https://vibetogether.show'],
  })

  const testOrigins = [
    'https://www.vibetogether.show',
    'https://vibetogether.show', // Apex domain
    'https://vibetogether-frontend.onrender.com', // Render preview/frontend
    'http://192.168.1.100:5173', // Mobile phone on local Wi-Fi
  ]

  for (const origin of testOrigins) {
    const preflight = await fetch(`${url}/api/admin/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type, X-CSRF-Token',
      },
    })

    assert.equal(preflight.status, 204, `Preflight from origin ${origin} must return 204`)
    assert.equal(
      preflight.headers.get('access-control-allow-origin'),
      origin,
      `CORS must permit origin: ${origin}`,
    )
    const allowedHeaders = preflight.headers.get('access-control-allow-headers') || ''
    assert.ok(
      allowedHeaders.toLowerCase().includes('authorization'),
      `CORS must allow Authorization header for ${origin}`,
    )
  }

  // Disallowed origin receives 403
  const badPreflight = await fetch(`${url}/api/admin/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://malicious-site.example.com',
      'Access-Control-Request-Method': 'POST',
    },
  })
  assert.equal(badPreflight.status, 403, 'Unauthorized origin must be rejected with 403')
})
