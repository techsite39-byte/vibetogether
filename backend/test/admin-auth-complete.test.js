import assert from 'node:assert/strict'
import express from 'express'
import { afterEach, test } from 'node:test'
import {
  createAdminAuthRouter,
  hashAdminPassword,
} from '../src/auth/adminAuth.js'

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
  app.use((error, _request, response, _next) => {
    response.status(error.status ?? 500).json({ message: error.message })
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

test('complete admin auth: email/pass, forgot-password OTP flow, and reset password', async () => {
  const secret = 'super-secure-session-secret-key-with-more-than-32-chars!'
  let currentPassword = 'initial-secure-password-123'
  let passwordHash = await hashAdminPassword(currentPassword)

  const adminRecord = {
    _id: '60c72b2f9b1d8b2bad888888',
    name: 'Super Admin',
    email: 'admin@vibetogether.com',
    username: 'admin@vibetogether.com',
    role: 'super_admin',
    status: 'active',
    active: true,
    emailVerified: true,
    passwordHash,
    async save() {},
  }

  const mockAdminModel = {
    findOne(query) {
      return {
        select() {
          return {
            exec: async () => {
              const q = query.$or ? query.$or.map(o => o.email || o.username) : []
              if (q.includes(adminRecord.email)) {
                return adminRecord
              }
              return null
            },
          }
        },
      }
    },
    findById(id) {
      return {
        select() {
          return {
            lean: async () => (String(id) === String(adminRecord._id) ? adminRecord : null),
            exec: async () => (String(id) === String(adminRecord._id) ? adminRecord : null),
          }
        },
      }
    },
  }

  const resetStore = []
  let sentEmails = []

  const mockPasswordResetModel = {
    async updateMany(filter, update) {
      for (const r of resetStore) {
        if (r.email === filter.email && r.usedAt === null) {
          r.usedAt = update.usedAt
        }
      }
    },
    async create(doc) {
      const saved = { ...doc, _id: `reset-${resetStore.length + 1}`, createdAt: new Date() }
      resetStore.push(saved)
      return saved
    },
    findOne(query) {
      function getResult() {
        let matches = resetStore.filter(r => {
          if (query.email && r.email !== query.email) return false
          if (query.usedAt === null && r.usedAt !== null) return false
          if (query.resetTokenHash && r.resetTokenHash !== query.resetTokenHash) return false
          return true
        })
        const match = matches[matches.length - 1] || null
        if (!match) return null
        return {
          ...match,
          async save() {
            const idx = resetStore.findIndex(x => x._id === match._id)
            if (idx !== -1) resetStore[idx] = this
          },
        }
      }

      return {
        sort() {
          return {
            exec: async () => getResult(),
            then: (resolve) => resolve(getResult()),
          }
        },
        exec: async () => getResult(),
        then: (resolve) => resolve(getResult()),
      }
    },
    async deleteMany(filter) {
      const remaining = resetStore.filter(r => r.email !== filter.email)
      resetStore.length = 0
      resetStore.push(...remaining)
    },
  }

  const mockEmailService = {
    isConfigured: true,
    async sendOtpEmail({ email, otp }) {
      sentEmails.push({ email, otp })
      return { delivered: true }
    },
  }

  const baseUrl = await startAuthServer({
    bootstrapPasswordHash: passwordHash,
    emailService: mockEmailService,
    model: mockAdminModel,
    passwordResetModel: mockPasswordResetModel,
    sessionSecret: secret,
    username: adminRecord.username,
  })

  // 1. Successful Email / Password Login
  const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@vibetogether.com',
      password: currentPassword,
      rememberMe: true,
    }),
  })
  assert.equal(loginRes.status, 200)
  const loginData = await loginRes.json()
  assert.equal(loginData.admin.role, 'super_admin')
  assert.ok(loginData.csrfToken)
  const setCookie = loginRes.headers.get('set-cookie') || ''
  assert.match(setCookie, /vt_admin_session=/)

  // 2. Forgot Password Request (generates OTP and sends email)
  const forgotRes = await fetch(`${baseUrl}/api/admin/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vibetogether.com' }),
  })
  assert.equal(forgotRes.status, 200)
  assert.equal(sentEmails.length, 1)
  const receivedOtp = sentEmails[0].otp
  assert.match(receivedOtp, /^\d{6}$/)

  // 3. Verify OTP: Invalid code fails
  const badVerifyRes = await fetch(`${baseUrl}/api/admin/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vibetogether.com', otp: '000000' }),
  })
  assert.equal(badVerifyRes.status, 400)

  // 4. Verify OTP: Correct code succeeds and returns resetToken
  const goodVerifyRes = await fetch(`${baseUrl}/api/admin/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vibetogether.com', otp: receivedOtp }),
  })
  assert.equal(goodVerifyRes.status, 200)
  const verifyData = await goodVerifyRes.json()
  assert.ok(verifyData.resetToken)
  const resetToken = verifyData.resetToken

  // 5. Reset Password with new credentials
  const newPassword = 'my-super-new-secure-password-2026'
  const resetRes = await fetch(`${baseUrl}/api/admin/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@vibetogether.com',
      resetToken,
      newPassword,
      confirmPassword: newPassword,
    }),
  })
  assert.equal(resetRes.status, 200)
  assert.equal(adminRecord.passwordHash !== passwordHash, true) // Updated hash

  // 6. Login with Old Password fails
  const oldLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@vibetogether.com',
      password: currentPassword,
    }),
  })
  assert.equal(oldLoginRes.status, 401)

  // 7. Login with New Password succeeds
  const newLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@vibetogether.com',
      password: newPassword,
    }),
  })
  assert.equal(newLoginRes.status, 200)
})

test('password reset reports missing SMTP instead of simulating email delivery', async () => {
  const baseUrl = await startAuthServer({
    sessionSecret: 'super-secure-session-secret-key-with-more-than-32-chars!',
    username: 'admin@vibetogether.com',
    emailService: { isConfigured: false },
  })

  for (const route of ['forgot-password', 'resend-otp']) {
    const response = await fetch(`${baseUrl}/api/admin/auth/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vibetogether.com' }),
    })
    assert.equal(response.status, 503)
    const result = await response.json()
    assert.match(result.message, /SMTP_HOST, SMTP_USER, and SMTP_PASSWORD/)
    assert.notEqual(result.success, true)
  }
})

test('Google login rejects missing configuration and unauthorized accounts', async () => {
  const secret = 'super-secure-session-secret-key-with-more-than-32-chars!'
  const adminRecord = {
    _id: '60c72b2f9b1d8b2bad999999',
    name: 'Authorized Admin',
    email: 'authorized@vibetogether.com',
    username: 'authorized@vibetogether.com',
    role: 'admin',
    status: 'active',
    active: true,
    async save() {},
  }

  const mockAdminModel = {
    findOne(query) {
      return {
        select() {
          return {
            exec: async () => {
              const emails = query.$or?.map(x => x.email) || []
              if (emails.includes('authorized@vibetogether.com')) {
                return adminRecord
              }
              return null
            },
          }
        },
      }
    },
    findById(id) {
      return {
        select() {
          return {
            lean: async () => (String(id) === String(adminRecord._id) ? adminRecord : null),
          }
        },
      }
    },
  }

  const baseUrl = await startAuthServer({
    model: mockAdminModel,
    sessionSecret: secret,
    googleClientId: '', // Unconfigured initially
    username: 'admin@vibetogether.com',
  })

  // When Google client ID not set: returns 503
  const unconfiguredRes = await fetch(`${baseUrl}/api/admin/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: 'fake-token' }),
  })
  assert.equal(unconfiguredRes.status, 503)

  const configuredUrl = await startAuthServer({
    model: mockAdminModel,
    sessionSecret: secret,
    googleClientId: 'vibe-test.apps.googleusercontent.com',
    username: 'admin@vibetogether.com',
  })
  const originalFetch = globalThis.fetch
  let emailVerified = 'true'
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith(configuredUrl)) return originalFetch(input, options)
    if (String(input).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return Response.json({
        aud: 'vibe-test.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: String(Math.floor(Date.now() / 1000) + 3600),
        sub: 'unknown-google-subject',
        email: 'unknown@vibetogether.com',
        email_verified: emailVerified,
      })
    }
    return originalFetch(input, options)
  }

  try {
    const unauthorizedRes = await fetch(`${configuredUrl}/api/admin/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'valid-but-unauthorized-token' }),
    })
    assert.equal(unauthorizedRes.status, 403)
    assert.match((await unauthorizedRes.json()).message, /not authorized/)

    emailVerified = 'false'
    const unverifiedRes = await fetch(`${configuredUrl}/api/admin/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'unverified-token' }),
    })
    assert.equal(unverifiedRes.status, 403)
    assert.match((await unverifiedRes.json()).message, /not verified/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Google OAuth redirect verifies state, Google identity, and creates a server session', async () => {
  const secret = 'super-secure-session-secret-key-with-more-than-32-chars!'
  const adminRecord = {
    _id: '60c72b2f9b1d8b2bad999999',
    name: 'Authorized Admin',
    email: 'authorized@vibetogether.com',
    username: 'authorized@vibetogether.com',
    role: 'admin',
    status: 'active',
    active: true,
    emailVerified: true,
    googleId: null,
    async save() {},
  }
  const model = {
    findOne(query) {
      return {
        select() {
          return {
            exec: async () => query.$or.some((field) =>
              field.email === adminRecord.email || field.username === adminRecord.email
            ) ? adminRecord : null,
          }
        },
      }
    },
    findById(id) {
      return {
        select() {
          return {
            lean: async () => String(id) === adminRecord._id ? adminRecord : null,
          }
        },
      }
    },
  }
  const callbackUrl = 'http://localhost:4000/api/admin/auth/google/callback'
  const baseUrl = await startAuthServer({
    model,
    sessionSecret: secret,
    username: adminRecord.email,
    googleClientId: 'vibe-test.apps.googleusercontent.com',
    googleClientSecret: 'server-only-client-secret',
    googleCallbackUrl: callbackUrl,
    googleCallbackUrlValid: true,
    nodeEnv: 'development',
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    const url = String(input)
    if (url.startsWith(baseUrl)) return originalFetch(input, options)
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(options.body)
      assert.equal(body.get('client_secret'), 'server-only-client-secret')
      assert.equal(body.get('redirect_uri'), callbackUrl)
      return Response.json({ id_token: 'verified-google-token' })
    }
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return Response.json({
        aud: 'vibe-test.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: String(Math.floor(Date.now() / 1000) + 3600),
        sub: 'google-subject-123',
        email: adminRecord.email,
        email_verified: 'true',
        name: adminRecord.name,
      })
    }
    return originalFetch(input, options)
  }

  try {
    const startResponse = await fetch(
      `${baseUrl}/api/admin/auth/google?frontend_origin=${encodeURIComponent('http://localhost:5174')}`,
      { redirect: 'manual' },
    )
    assert.equal(startResponse.status, 302)
    const authorizationUrl = new URL(startResponse.headers.get('location'))
    assert.equal(authorizationUrl.origin, 'https://accounts.google.com')
    assert.equal(authorizationUrl.searchParams.get('client_id'), 'vibe-test.apps.googleusercontent.com')
    assert.equal(authorizationUrl.searchParams.get('redirect_uri'), callbackUrl)
    assert.equal(authorizationUrl.searchParams.get('response_type'), 'code')

    const redirectAliasResponse = await fetch(
      `${baseUrl}/api/admin/auth/google/redirect`,
      { redirect: 'manual' },
    )
    assert.equal(redirectAliasResponse.status, 302)
    assert.equal(
      new URL(redirectAliasResponse.headers.get('location')).searchParams.get('redirect_uri'),
      callbackUrl,
    )

    const cookies = startResponse.headers.getSetCookie()
    const stateCookie = cookies
      .find((cookie) => cookie.startsWith('vt_google_oauth_state='))
      ?.match(/vt_google_oauth_state=([^;]+)/)?.[1]
    const frontendOriginCookie = cookies
      .find((cookie) => cookie.startsWith('vt_google_frontend_origin='))
      ?.match(/vt_google_frontend_origin=([^;]+)/)?.[1]
    assert.ok(stateCookie)
    assert.ok(frontendOriginCookie)
    const state = authorizationUrl.searchParams.get('state')
    assert.ok(state)

    const cancelledCallback = await fetch(
      `${baseUrl}/api/admin/auth/google/callback?error=access_denied`,
      {
        headers: {
          Cookie: `vt_google_oauth_state=${stateCookie}; vt_google_frontend_origin=${frontendOriginCookie}`,
        },
        redirect: 'manual',
      },
    )
    assert.equal(cancelledCallback.status, 302)
    assert.equal(
      cancelledCallback.headers.get('location'),
      'http://localhost:5174/admin/login?google_error=cancelled',
    )

    const rejectedCallback = await fetch(
      `${baseUrl}/api/admin/auth/google/callback?code=auth-code&state=invalid`,
      {
        headers: {
          Cookie: `vt_google_oauth_state=${stateCookie}; vt_google_frontend_origin=${frontendOriginCookie}`,
        },
      },
    )
    assert.equal(rejectedCallback.status, 403)

    const callbackResponse = await fetch(
      `${baseUrl}/api/admin/auth/google/callback?code=auth-code&state=${state}`,
      {
        headers: {
          Cookie: `vt_google_oauth_state=${stateCookie}; vt_google_frontend_origin=${frontendOriginCookie}`,
        },
        redirect: 'manual',
      },
    )
    assert.equal(callbackResponse.status, 302)
    assert.equal(callbackResponse.headers.get('location'), 'http://localhost:5174/admin/dashboard')
    const sessionCookies = callbackResponse.headers.getSetCookie()
    const sessionCookie = sessionCookies.find((cookie) => cookie.startsWith('vt_admin_session='))
    assert.ok(sessionCookie)
    assert.ok(sessionCookies.some((cookie) => cookie.startsWith('vt_admin_csrf=')))
    assert.equal(adminRecord.googleId, 'google-subject-123')

    const sessionResponse = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Cookie: sessionCookie.split(';', 1)[0] },
    })
    assert.equal(sessionResponse.status, 200)
    assert.equal((await sessionResponse.json()).admin.email, adminRecord.email)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Google OAuth diagnostics expose safe development configuration only', async () => {
  const callbackUrl = 'http://localhost:4000/api/admin/auth/google/callback'
  const options = {
    nodeEnv: 'development',
    backendPort: 4000,
    frontendOrigin: 'http://localhost:5174',
    googleClientId: 'vibe-test.apps.googleusercontent.com',
    googleClientSecret: 'server-only-client-secret',
    googleCallbackUrl: callbackUrl,
    googleCallbackUrlValid: true,
  }
  const developmentUrl = await startAuthServer(options)
  const diagnosticResponse = await fetch(
    `${developmentUrl}/api/admin/auth/google/debug`,
  )
  assert.equal(diagnosticResponse.status, 200)
  const diagnostic = await diagnosticResponse.json()
  assert.deepEqual(diagnostic, {
    environment: 'development',
    googleClientId: options.googleClientId,
    configuredCallbackUrl: callbackUrl,
    callbackRoute: '/api/admin/auth/google/callback',
    backendPort: 4000,
    frontendOrigin: 'http://localhost:5174',
    oauthConfigured: true,
    clientSecretConfigured: true,
  })
  assert.equal(JSON.stringify(diagnostic).includes(options.googleClientSecret), false)

  const productionUrl = await startAuthServer({ ...options, nodeEnv: 'production' })
  const productionResponse = await fetch(
    `${productionUrl}/api/admin/auth/google/debug`,
  )
  assert.equal(productionResponse.status, 404)
})
