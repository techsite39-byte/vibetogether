import {
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { AdminCredential, AdminSession, PasswordReset } from '../models/adminRecords.js'

const scrypt = promisify(scryptCallback)
const sessionCookie = 'vt_admin_session'
const csrfCookie = 'vt_admin_csrf'
const googleBindingCookie = 'vt_google_browser_binding'
const secureGoogleBindingCookie = '__Host-vt_google_browser_binding'
const defaultSessionLifetimeSeconds = 8 * 60 * 60 // 8 hours
const rememberMeLifetimeSeconds = 30 * 24 * 60 * 60 // 30 days
const loginWindowMilliseconds = 15 * 60 * 1000 // 15 minutes
const loginLimit = 5
const otpWindowMilliseconds = 10 * 60 * 1000 // 10 minutes
const otpRequestLimit = 4
const otpExpiryMilliseconds = 5 * 60 * 1000 // 5 minutes
const resetTokenExpiryMilliseconds = 15 * 60 * 1000 // 15 minutes

function safeEqual(first, second) {
  if (first == null || second == null) return false
  const firstBuffer = Buffer.from(String(first))
  const secondBuffer = Buffer.from(String(second))
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  )
}

function parsePasswordHash(value) {
  const [algorithm, salt, hash, extra] = String(value ?? '').split('$')
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !hash ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(salt) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(hash)
  ) {
    return null
  }

  return { hash: Buffer.from(hash, 'base64url'), salt }
}

export async function hashAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Admin passwords must be between 12 and 256 characters.')
  }

  return bcrypt.hash(password, 12)
}

export async function verifyAdminPassword(password, encodedHash) {
  if (
    typeof password !== 'string' ||
    password.length > 256 ||
    typeof encodedHash !== 'string'
  ) {
    return false
  }

  if (/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(encodedHash)) {
    return bcrypt.compare(password, encodedHash)
  }

  const parsed = parsePasswordHash(encodedHash)
  if (!parsed) {
    return false
  }

  const actualHash = Buffer.from(await scrypt(password, parsed.salt, parsed.hash.length))
  return (
    actualHash.length === parsed.hash.length &&
    timingSafeEqual(actualHash, parsed.hash)
  )
}

function signPayload(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verifyPayload(token, secret) {
  const [encoded, signature, extra] = String(token ?? '').split('.')
  if (!encoded || !signature || extra !== undefined) {
    return null
  }

  const expected = createHmac('sha256', secret).update(encoded).digest('base64url')
  if (!safeEqual(signature, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return Number.isInteger(payload.exp) && payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

function readCookie(request, name) {
  const cookieHeader = request.headers.cookie ?? ''
  const item = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : ''
}

function cookieOptions({ secure, maxAge, httpOnly }) {
  return [
    'Path=/',
    `SameSite=${secure ? 'None' : 'Lax'}`,
    maxAge == null ? '' : `Max-Age=${maxAge}`,
    httpOnly ? 'HttpOnly' : '',
    secure ? 'Secure' : '',
    secure ? 'Partitioned' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

function googleBindingCookieValue(binding, secure, maxAge = 600) {
  const name = secure ? secureGoogleBindingCookie : googleBindingCookie
  return [
    `${name}=${encodeURIComponent(binding)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

function isLocalDevelopmentOrigin(origin) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
}

function allowedFrontendOrigin(candidate, { corsOrigins, nodeEnv }) {
  if (typeof candidate !== 'string') return ''
  try {
    const parsed = new URL(candidate)
    if (parsed.origin !== candidate || parsed.username || parsed.password) return ''
    if (corsOrigins.includes(parsed.origin)) return parsed.origin
    return nodeEnv === 'development' && isLocalDevelopmentOrigin(parsed.origin)
      ? parsed.origin
      : ''
  } catch {
    return ''
  }
}

async function verifyGoogleIdentityToken(token, clientId) {
  let response
  try {
    response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10000) },
    )
  } catch {
    throw Object.assign(
      new Error('Google identity verification is temporarily unavailable. Please try again.'),
      { status: 502 },
    )
  }

  if (!response.ok) {
    throw Object.assign(
      new Error('Google authentication failed or the token has expired.'),
      { status: 401 },
    )
  }

  const info = await response.json()
  const issuer = info.iss
  const expiresAt = Number(info.exp)
  if (
    info.aud !== clientId ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(issuer) ||
    !Number.isFinite(expiresAt) ||
    expiresAt * 1000 <= Date.now() ||
    typeof info.sub !== 'string' ||
    !info.sub ||
    typeof info.email !== 'string' ||
    !info.email.trim()
  ) {
    throw Object.assign(new Error('Google identity token is invalid.'), { status: 401 })
  }

  if (info.email_verified !== 'true' && info.email_verified !== true) {
    throw Object.assign(new Error('Google email address is not verified.'), { status: 403 })
  }

  return {
    email: info.email.trim().toLowerCase(),
    name: typeof info.name === 'string' && info.name.trim() ? info.name.trim() : 'Admin',
    sub: info.sub,
  }
}

function setSessionCookies(response, token, csrfToken, secure, maxAge = defaultSessionLifetimeSeconds) {
  const existing = response.getHeader('Set-Cookie')
  const cookies = Array.isArray(existing) ? existing : existing ? [existing] : []
  response.setHeader('Set-Cookie', [
    ...cookies,
    `${sessionCookie}=${encodeURIComponent(token)}; ${cookieOptions({
      secure,
      maxAge,
      httpOnly: true,
    })}`,
    `${csrfCookie}=${encodeURIComponent(csrfToken)}; ${cookieOptions({
      secure,
      maxAge,
      httpOnly: false,
    })}`,
  ])
}

export function clearAdminSession(response, secure) {
  response.setHeader('Set-Cookie', [
    `${sessionCookie}=; ${cookieOptions({ secure, maxAge: 0, httpOnly: true })}`,
    `${csrfCookie}=; ${cookieOptions({ secure, maxAge: 0, httpOnly: false })}`,
  ])
}

function createRateLimiter(windowMs, maxCount, message) {
  const attempts = new Map()

  return function limit(request, response, next) {
    const now = Date.now()
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    const identifier = String(request.body?.email || request.body?.username || '').trim().toLowerCase()
    const key = `${ip}:${identifier}`

    const current = attempts.get(key)
    const record =
      !current || now - current.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : current
    record.count += 1
    attempts.set(key, record)

    if (attempts.size > 10000) {
      for (const [k, v] of attempts) {
        if (now - v.startedAt >= windowMs) attempts.delete(k)
      }
    }

    if (record.count > maxCount) {
      const retryAfter = Math.ceil((windowMs - (now - record.startedAt)) / 1000)
      response.set('Retry-After', String(retryAfter))
      response.status(429).json({ message, retryAfter })
      return
    }

    next()
  }
}

export function createRequireAdmin({
  sessionSecret,
  model = AdminCredential,
  sessionModel = AdminSession,
}) {
  return async function requireAdmin(request, response, next) {
    try {
      if (!sessionSecret) {
        response.status(503).json({ message: 'Admin authentication is not configured.' })
        return
      }

      let token = null
      let authSource = null

      const authHeader = request.get('authorization') || request.headers?.authorization
      if (typeof authHeader === 'string' && authHeader.trim()) {
        const parts = authHeader.trim().split(/\s+/)
        if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
          token = parts[1]
          authSource = 'bearer'
        }
      }

      if (!token) {
        const cookieVal = readCookie(request, sessionCookie)
        if (cookieVal) {
          token = cookieVal
          authSource = 'cookie'
        }
      }

      if (!token) {
        response.status(401).json({ message: 'Admin sign-in is required.' })
        return
      }

      const payload = verifyPayload(token, sessionSecret)
      if (
        !payload ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      ) {
        response.status(401).json({ message: 'Admin sign-in is required.' })
        return
      }

      const session = await sessionModel.findOne({
        adminId: payload.sub,
        sessionId: payload.sid,
        expiresAt: { $gt: new Date() },
      }).lean()
      if (!session) {
        response.status(401).json({ message: 'Admin session is no longer valid.' })
        return
      }

      const admin = await model.findById(payload.sub)
        .select('name email username role status active emailVerified')
        .lean()

      const isActive = admin && admin.active !== false && (admin.status == null || admin.status === 'active')
      if (!isActive || !['admin', 'super_admin'].includes(admin.role)) {
        response.status(401).json({ message: 'Admin session is no longer valid.' })
        return
      }

      request.admin = {
        id: String(admin._id),
        name: admin.name || 'Admin',
        email: admin.email || admin.username,
        username: admin.username,
        role: admin.role,
        status: admin.status || 'active',
      }
      request.adminSessionId = payload.sid
      request.adminAuthSource = authSource
      request.adminToken = token
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireAdminCsrf(request, response, next) {
  // Requests authenticated using Authorization: Bearer tokens are impervious to CSRF attacks
  if (request.adminAuthSource === 'bearer') {
    next()
    return
  }

  const origin = request.get('origin') || request.get('referer') || request.get('host')
  const cookieToken = readCookie(request, csrfCookie)
  const headerToken = request.get('x-csrf-token')

  if (
    !origin ||
    !cookieToken ||
    !headerToken ||
    !safeEqual(cookieToken, headerToken)
  ) {
    response.status(403).json({ message: 'The admin request could not be verified.' })
    return
  }

  next()
}

/**
 * Creates the complete Admin Authentication Router with:
 * - Email / Password Login
 * - Google OAuth 2.0 Login
 * - Forgot Password (Email OTP)
 * - OTP Verification
 * - OTP Resend
 * - Password Reset
 * - Session Management (Logout & /me)
 */
export function createAdminAuthRouter({
  bootstrapPasswordHash,
  emailService,
  googleClientId = '',
  googleClientSecret = '',
  googleCallbackUrl = '',
  googleCallbackUrlValid = false,
  googleOAuthTransactionStore,
  backendPort = 4000,
  frontendOrigin = 'http://localhost:5173',
  corsOrigins = [],
  model = AdminCredential,
  nodeEnv = 'production',
  passwordResetModel = PasswordReset,
  sessionModel = AdminSession,
  sessionSecret,
  databaseReady = () => true,
  secureCookies = false,
  username = '',
}) {
  const router = Router()
  const limitLogin = createRateLimiter(
    loginWindowMilliseconds,
    loginLimit,
    'Too many sign-in attempts. Please try again after 15 minutes.',
  )
  const limitOtpRequest = createRateLimiter(
    otpWindowMilliseconds,
    otpRequestLimit,
    'Too many password reset requests. Please wait before trying again.',
  )
  const requireAdmin = createRequireAdmin({ sessionSecret, model, sessionModel })

  router.get('/google/debug', (request, response) => {
    if (nodeEnv !== 'development') {
      response.status(404).json({ message: 'Route not found.' })
      return
    }

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      environment: nodeEnv,
      googleClientId: googleClientId || null,
      configuredCallbackUrl: googleCallbackUrl || null,
      callbackRoute: '/api/admin/auth/google/callback',
      backendPort,
      frontendOrigin:
        allowedFrontendOrigin(request.query.frontend_origin, { corsOrigins, nodeEnv }) ||
        frontendOrigin,
      oauthConfigured: Boolean(
        googleClientId && googleClientSecret && googleCallbackUrlValid,
      ),
      clientSecretConfigured: Boolean(googleClientSecret),
    })
  })

  // GET /api/admin/auth/configuration
  router.get('/configuration', (_request, response) => {
    const missingConfiguration = []
    if (!username) missingConfiguration.push('ADMIN_EMAIL')
    if (!sessionSecret) missingConfiguration.push('ADMIN_SESSION_SECRET')
    const configured = missingConfiguration.length === 0
    const databaseConnected = databaseReady()
    response.json({
      configured,
      databaseConnected,
      googleEnabled: configured && databaseConnected && Boolean(
        googleClientId && googleClientSecret && googleCallbackUrlValid,
      ),
      googleClientId: googleClientId || null,
      googleClientSecretConfigured: Boolean(googleClientSecret),
      googleCallbackConfigured: Boolean(googleCallbackUrl),
      googleCallbackUrl: googleCallbackUrlValid ? googleCallbackUrl : null,
      googleMissingConfiguration: [
        !googleClientId ? 'GOOGLE_CLIENT_ID' : null,
        !googleClientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
        !googleCallbackUrlValid ? 'GOOGLE_CALLBACK_URL (valid callback URI required)' : null,
      ].filter(Boolean),
      smtpEnabled: Boolean(emailService?.isConfigured),
      missingConfiguration,
      message: !configured
        ? `Admin authentication is not configured. Set ${missingConfiguration.join(' and ')}.`
        : !databaseConnected
          ? 'The admin service is waiting for its database connection.'
          : null,
    })
  })

  router.use((_request, response, next) => {
    if (_request.path === '/google/callback') {
      next()
      return
    }

    if (!databaseReady()) {
      response.status(503).json({
        message: 'The admin database is unavailable. Please try again when the service is ready.',
      })
      return
    }
    if (!username || !sessionSecret) {
      response.status(503).json({ message: 'Admin authentication is not configured.' })
      return
    }
    next()
  })

  async function exchangeGoogleCode(code) {
    if (!googleClientId) {
      throw Object.assign(
        new Error('Google Sign-In is not configured. Set GOOGLE_CLIENT_ID on the backend.'),
        { status: 503 },
      )
    }
    if (!googleClientSecret) {
      throw Object.assign(
        new Error('Google Client Secret is not configured. Set GOOGLE_CLIENT_SECRET on the backend.'),
        { status: 503 },
      )
    }
    if (!googleCallbackUrlValid) {
      throw Object.assign(
        new Error('Google redirect URL is missing or invalid. Set GOOGLE_CALLBACK_URL to the backend /api/admin/auth/google/callback URI.'),
        { status: 503 },
      )
    }

    const params = new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleCallbackUrl,
      grant_type: 'authorization_code',
    })
    let tokenResponse
    try {
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw Object.assign(
        new Error('Google token exchange is temporarily unavailable.'),
        { status: 502 },
      )
    }
    if (!tokenResponse.ok) {
      throw Object.assign(
        new Error('Google rejected the authorization code or redirect URL.'),
        { status: 401 },
      )
    }

    const tokenData = await tokenResponse.json()
    if (typeof tokenData.id_token !== 'string' || !tokenData.id_token) {
      throw Object.assign(
        new Error('Google authorization response did not include an ID token.'),
        { status: 401 },
      )
    }
    return verifyGoogleIdentityToken(tokenData.id_token, googleClientId)
  }

  async function establishGoogleSession(googleUser, response) {
    const admin = await model.findOne({
      $or: [
        { email: googleUser.email },
        { username: googleUser.email },
        { googleId: googleUser.sub },
      ],
    })
      .select('+passwordHash name email username role status active googleId')
      .exec()

    if (!admin) {
      throw Object.assign(
        new Error('This Google account is not authorized for administrator access.'),
        { status: 403 },
      )
    }

    const isActive = admin.active !== false && (admin.status == null || admin.status === 'active')
    if (!isActive) {
      throw Object.assign(new Error('Admin account has been deactivated.'), { status: 403 })
    }
    if (
      !['admin', 'super_admin'].includes(admin.role) ||
      (admin.googleId && admin.googleId !== googleUser.sub)
    ) {
      throw Object.assign(
        new Error('This Google account is not authorized for administrator access.'),
        { status: 403 },
      )
    }

    if (!admin.googleId) admin.googleId = googleUser.sub
    if (!admin.email) admin.email = googleUser.email
    admin.emailVerified = true
    admin.lastLoginAt = new Date()
    await admin.save()

    const expiresAt = Date.now() + defaultSessionLifetimeSeconds * 1000
    const sessionId = randomBytes(32).toString('base64url')
    await sessionModel.create({
      adminId: admin._id,
      sessionId,
      expiresAt: new Date(expiresAt),
    })
    const token = signPayload(
      {
        sub: String(admin._id),
        sid: sessionId,
        exp: expiresAt,
        role: admin.role,
        email: admin.email || admin.username,
      },
      sessionSecret,
    )
    const csrfToken = randomBytes(24).toString('base64url')
    setSessionCookies(response, token, csrfToken, secureCookies)

    return {
      admin: {
        id: String(admin._id),
        name: admin.name || googleUser.name,
        email: admin.email || admin.username,
        username: admin.username,
        role: admin.role,
        status: admin.status || 'active',
      },
      csrfToken,
      token,
      expiresAt,
    }
  }

  function redirectToLogin(response, origin, reason) {
    const loginUrl = new URL('/admin/login', origin || frontendOrigin)
    if (reason) {
      loginUrl.searchParams.set('google_error', reason)
    }
    response.redirect(302, loginUrl.toString())
  }

  router.get(['/google', '/google/redirect'], async (request, response) => {
    if (!googleClientId || !googleClientSecret || !googleCallbackUrlValid) {
      response.status(503).json({
        message: 'Google Sign-In requires valid GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL settings on the backend.',
      })
      return
    }
    if (
      !googleOAuthTransactionStore ||
      typeof googleOAuthTransactionStore.create !== 'function' ||
      typeof googleOAuthTransactionStore.consume !== 'function'
    ) {
      response.status(503).json({
        message: 'Google Sign-In is temporarily unavailable. Please try again later.',
      })
      return
    }

    const isTokenMode = request.query.auth_mode === 'token'
    const randomPart = randomBytes(30).toString('base64url')
    const state = isTokenMode ? `tok_${randomPart}` : randomBytes(32).toString('base64url')
    const bindingCookie = secureCookies
      ? secureGoogleBindingCookie
      : googleBindingCookie
    const existingBinding = readCookie(request, bindingCookie)
    const browserBinding = /^[A-Za-z0-9_-]{40,64}$/.test(existingBinding)
      ? existingBinding
      : randomBytes(32).toString('base64url')
    const requestedFrontendOrigin =
      allowedFrontendOrigin(request.query.frontend_origin, { corsOrigins, nodeEnv }) ||
      frontendOrigin
    try {
      await googleOAuthTransactionStore.create({
        state,
        browserBinding,
        frontendOrigin: requestedFrontendOrigin,
      })
    } catch {
      console.error('[Google OAuth] Could not persist authorization transaction.')
      response.status(503).json({
        message: 'Google Sign-In is temporarily unavailable. Please try again later.',
      })
      return
    }

    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorizationUrl.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    }).toString()
    console.info('[Google OAuth] Authorization transaction created.')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Set-Cookie', googleBindingCookieValue(browserBinding, secureCookies))
    response.redirect(302, authorizationUrl.toString())
  })

  router.get('/google/callback', async (request, response, next) => {
    const state = typeof request.query.state === 'string' ? request.query.state : ''
    const bindingCookie = secureCookies
      ? secureGoogleBindingCookie
      : googleBindingCookie
    const browserBinding = readCookie(request, bindingCookie)
    response.setHeader('Cache-Control', 'no-store')
    const code = typeof request.query.code === 'string' ? request.query.code : ''
    if (!googleOAuthTransactionStore) {
      console.error('[Google OAuth] Callback could not access the transaction store.')
      redirectToLogin(response, frontendOrigin, 'failed')
      return
    }
    if (
      !/^[A-Za-z0-9_-]{40,64}$/.test(state) ||
      !/^[A-Za-z0-9_-]{40,64}$/.test(browserBinding)
    ) {
      console.warn('[Google OAuth] Callback rejected: missing or malformed transaction binding.')
      redirectToLogin(response, frontendOrigin, 'state')
      return
    }

    let consumed
    try {
      consumed = await googleOAuthTransactionStore.consume({ state, browserBinding })
    } catch {
      console.error('[Google OAuth] Could not validate authorization transaction.')
      redirectToLogin(response, frontendOrigin, 'failed')
      return
    }
    const transaction = consumed?.transaction
    const callbackFrontendOrigin = transaction
      ? allowedFrontendOrigin(transaction.frontendOrigin, { corsOrigins, nodeEnv }) ||
        frontendOrigin
      : frontendOrigin
    if (!transaction) {
      const reason = consumed?.error === 'expired' ? 'expired' : 'state'
      console.warn(`[Google OAuth] Callback rejected: ${reason} transaction.`)
      redirectToLogin(response, callbackFrontendOrigin, reason)
      return
    }

    const googleError = typeof request.query.error === 'string' ? request.query.error : ''
    if (googleError) {
      const reason = googleError === 'access_denied' ? 'cancelled' : 'failed'
      console.info(`[Google OAuth] Authorization ended by provider: ${reason}.`)
      redirectToLogin(response, callbackFrontendOrigin, reason)
      return
    }
    if (!code) {
      console.warn('[Google OAuth] Callback rejected: authorization code missing.')
      redirectToLogin(response, callbackFrontendOrigin, 'failed')
      return
    }

    try {
      const googleUser = await exchangeGoogleCode(code)
      const sessionResult = await establishGoogleSession(googleUser, response)
      console.info('[Google OAuth] Authorized admin session established.')
      const redirectUrl = new URL('/admin/dashboard', callbackFrontendOrigin)
      if (state.startsWith('tok_')) {
        redirectUrl.hash = new URLSearchParams({
          admin_token: sessionResult.token,
          admin_csrf: sessionResult.csrfToken,
        }).toString()
      }
      response.redirect(302, redirectUrl.toString())
    } catch (error) {
      if (error.status === 403) {
        console.warn('[Google OAuth] Sign-in denied: Google identity is not an active authorized admin.')
        redirectToLogin(response, callbackFrontendOrigin, 'unauthorized')
        return
      }

      console.error('[Google OAuth] Callback failed during code exchange or session creation.')
      if (response.headersSent) {
        next(error)
        return
      }
      redirectToLogin(response, callbackFrontendOrigin, 'failed')
    }
  })

  // POST /api/admin/auth/login
  router.post('/login', limitLogin, async (request, response, next) => {
    try {
      const rawIdentifier = request.body?.email || request.body?.username
      const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim().toLowerCase() : ''
      const password = typeof request.body?.password === 'string' ? request.body.password : ''
      const rememberMe = Boolean(request.body?.rememberMe)

      if (!identifier || !password) {
        response.status(400).json({ message: 'Email address and password are required.' })
        return
      }

      // Find by email or username
      const admin = await model.findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })
        .select('+passwordHash name email username role status active')
        .exec()

      const valid = await verifyAdminPassword(
        password,
        admin?.passwordHash ?? bootstrapPasswordHash,
      )

      const isActive = admin && admin.active !== false && (admin.status == null || admin.status === 'active')

      if (!admin || !valid || !isActive) {
        response.status(401).json({ message: 'Invalid email address or password.' })
        return
      }

      admin.lastLoginAt = new Date()
      if (!admin.email) {
        admin.email = admin.username
      }
      await admin.save()

      const lifetimeSeconds = rememberMe ? rememberMeLifetimeSeconds : defaultSessionLifetimeSeconds
      const expiresAt = Date.now() + lifetimeSeconds * 1000
      const sessionId = randomBytes(32).toString('base64url')
      await sessionModel.create({
        adminId: admin._id,
        sessionId,
        expiresAt: new Date(expiresAt),
      })
      const token = signPayload(
        {
          sub: String(admin._id),
          sid: sessionId,
          exp: expiresAt,
          role: admin.role,
          email: admin.email || admin.username,
        },
        sessionSecret,
      )
      const csrfToken = randomBytes(24).toString('base64url')
      setSessionCookies(response, token, csrfToken, secureCookies, lifetimeSeconds)

      response.json({
        admin: {
          id: String(admin._id),
          name: admin.name || 'Admin',
          email: admin.email || admin.username,
          username: admin.username,
          role: admin.role,
          status: admin.status || 'active',
        },
        csrfToken,
        token,
        expiresAt,
      })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/admin/auth/google
  router.post('/google', async (request, response, next) => {
    try {
      if (!googleClientId) {
        response.status(503).json({
          message: 'Google Sign-In is not configured. Set GOOGLE_CLIENT_ID on the backend.',
        })
        return
      }

      const { credential, code } = request.body || {}
      if (typeof credential === 'string' && credential) {
        const googleUser = await verifyGoogleIdentityToken(credential, googleClientId)
        const result = await establishGoogleSession(googleUser, response)
        response.json(result)
        return
      }
      if (typeof code === 'string' && code) {
        const googleUser = await exchangeGoogleCode(code)
        const result = await establishGoogleSession(googleUser, response)
        response.json(result)
        return
      } else {
        response.status(400).json({ message: 'Google credential token or authorization code is required.' })
        return
      }
    } catch (error) {
      next(error)
    }
  })

  // POST /api/admin/auth/forgot-password
  router.post('/forgot-password', limitOtpRequest, async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        response.status(400).json({ message: 'Please provide a valid administrator email address.' })
        return
      }
      if (!emailService?.isConfigured) {
        response.status(503).json({
          message: 'Password reset email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD on the backend.',
        })
        return
      }

      // Always return a generic success message to prevent email enumeration
      const genericMessage = 'If an admin account is registered with this email, a 6-digit verification code has been dispatched.'

      const admin = await model.findOne({
        $or: [{ email }, { username: email }],
        active: true,
      }).select('email username role status').exec()

      if (admin && admin.status === 'active') {
        // Invalidate any existing unused OTPs for this admin
        await passwordResetModel.updateMany(
          { email, usedAt: null },
          { usedAt: new Date() },
        )

        // Generate secure 6-digit random OTP
        const otp = String(randomInt(100000, 1000000))
        const otpHash = createHash('sha256')
          .update(otp + sessionSecret)
          .digest('hex')

        await passwordResetModel.create({
          adminId: admin._id,
          email,
          otpHash,
          expiresAt: new Date(Date.now() + otpExpiryMilliseconds),
          attempts: 0,
          usedAt: null,
        })

        // Dispatch email
        try {
          await emailService.sendOtpEmail({ email, otp })
        } catch (error) {
          await passwordResetModel.updateMany(
            { email, usedAt: null },
            { usedAt: new Date() },
          )
          console.error('[Forgot Password] Email delivery failed:', error.message)
          response.status(502).json({
            message: 'The verification email could not be delivered. Check SMTP configuration and try again.',
          })
          return
        }
      }

      response.json({ success: true, message: genericMessage })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/admin/auth/verify-otp
  router.post('/verify-otp', async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
      const otp = typeof request.body?.otp === 'string' ? request.body.otp.trim() : ''

      if (!email || !otp || !/^\d{6}$/.test(otp)) {
        response.status(400).json({ message: 'A valid email and 6-digit verification code are required.' })
        return
      }

      const resetRecord = await passwordResetModel.findOne({
        email,
        usedAt: null,
      }).sort({ createdAt: -1 }).exec()

      if (!resetRecord || new Date() > new Date(resetRecord.expiresAt)) {
        response.status(400).json({
          message: 'The verification code is invalid or has expired. Please request a new one.',
        })
        return
      }

      if (resetRecord.attempts >= 5) {
        resetRecord.usedAt = new Date()
        await resetRecord.save()
        response.status(429).json({
          message: 'Maximum verification attempts exceeded. Please request a new verification code.',
        })
        return
      }

      resetRecord.attempts += 1

      const incomingHash = createHash('sha256')
        .update(otp + sessionSecret)
        .digest('hex')

      if (!safeEqual(incomingHash, resetRecord.otpHash)) {
        await resetRecord.save()
        const remaining = Math.max(0, 5 - resetRecord.attempts)
        response.status(400).json({
          message: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          attemptsRemaining: remaining,
        })
        return
      }

      // Mark OTP as used and issue single-use reset token
      const resetToken = randomBytes(32).toString('hex')
      const resetTokenHash = createHash('sha256')
        .update(resetToken + sessionSecret)
        .digest('hex')

      resetRecord.usedAt = new Date()
      resetRecord.resetTokenHash = resetTokenHash
      resetRecord.resetTokenExpiresAt = new Date(Date.now() + resetTokenExpiryMilliseconds)
      await resetRecord.save()

      response.json({
        success: true,
        resetToken,
        message: 'Verification code confirmed. You may now set your new password.',
      })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/admin/auth/resend-otp
  router.post('/resend-otp', limitOtpRequest, async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        response.status(400).json({ message: 'Valid email address is required.' })
        return
      }
      if (!emailService?.isConfigured) {
        response.status(503).json({
          message: 'Password reset email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD on the backend.',
        })
        return
      }

      // Enforce 60-second cooldown
      const recentRecord = await passwordResetModel.findOne({ email }).sort({ createdAt: -1 }).exec()
      if (recentRecord) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(recentRecord.createdAt).getTime()) / 1000)
        if (elapsedSeconds < 60) {
          const waitTime = 60 - elapsedSeconds
          response.set('Retry-After', String(waitTime))
          response.status(429).json({
            message: `Please wait ${waitTime} seconds before requesting another code.`,
            retryAfter: waitTime,
          })
          return
        }
      }

      const admin = await model.findOne({
        $or: [{ email }, { username: email }],
        active: true,
      }).select('email username').exec()

      const genericMessage =
        'If an admin account is registered with this email, a fresh verification code has been sent.'

      if (admin) {
        await passwordResetModel.updateMany({ email, usedAt: null }, { usedAt: new Date() })

        const otp = String(randomInt(100000, 1000000))
        const otpHash = createHash('sha256')
          .update(otp + sessionSecret)
          .digest('hex')

        await passwordResetModel.create({
          adminId: admin._id,
          email,
          otpHash,
          expiresAt: new Date(Date.now() + otpExpiryMilliseconds),
          attempts: 0,
          usedAt: null,
        })

        try {
          await emailService.sendOtpEmail({ email, otp })
        } catch (error) {
          await passwordResetModel.updateMany(
            { email, usedAt: null },
            { usedAt: new Date() },
          )
          console.error('[Resend OTP] Email delivery failed:', error.message)
          response.status(502).json({
            message: 'The verification email could not be delivered. Check SMTP configuration and try again.',
          })
          return
        }
      }

      response.json({
        success: true,
        message: genericMessage,
      })
    } catch (error) {
      next(error)
    }
  })

  // POST /api/admin/auth/reset-password
  router.post('/reset-password', async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
      const resetToken = typeof request.body?.resetToken === 'string' ? request.body.resetToken.trim() : ''
      const newPassword = typeof request.body?.newPassword === 'string' ? request.body.newPassword : ''
      const confirmPassword = typeof request.body?.confirmPassword === 'string' ? request.body.confirmPassword : ''

      if (!email || !resetToken || !newPassword) {
        response.status(400).json({ message: 'Email, reset token, and new password are required.' })
        return
      }

      if (newPassword !== confirmPassword) {
        response.status(400).json({ message: 'Passwords do not match.' })
        return
      }

      if (newPassword.length < 12 || newPassword.length > 256) {
        response.status(400).json({ message: 'Password must be between 12 and 256 characters long.' })
        return
      }

      const incomingTokenHash = createHash('sha256')
        .update(resetToken + sessionSecret)
        .digest('hex')

      const resetRecord = await passwordResetModel.findOne({
        email,
        resetTokenHash: incomingTokenHash,
        resetTokenExpiresAt: { $gt: new Date() },
      }).exec()

      if (!resetRecord) {
        response.status(400).json({
          message: 'Password reset session is invalid or has expired. Please restart the request.',
        })
        return
      }

      // Invalidate the reset token
      resetRecord.resetTokenHash = null
      await resetRecord.save()

      // Invalidate all reset requests for this email
      await passwordResetModel.deleteMany({ email })

      // Hash and update admin password
      const passwordHash = await hashAdminPassword(newPassword)
      const admin = await model.findById(resetRecord.adminId).select('+passwordHash').exec()

      if (!admin) {
        response.status(404).json({ message: 'Admin account not found.' })
        return
      }

      admin.passwordHash = passwordHash
      await admin.save()

      await sessionModel.deleteMany({ adminId: admin._id })
      clearAdminSession(response, secureCookies)

      response.json({
        success: true,
        message: 'Your password has been successfully reset. Please sign in with your new password.',
      })
    } catch (error) {
      next(error)
    }
  })

  // GET /api/admin/auth/me (also aliased at /session for backwards compatibility)
  const handleGetMe = (request, response) => {
    response.json({
      admin: request.admin,
      csrfToken: readCookie(request, csrfCookie) || request.get('x-csrf-token') || '',
      token: request.adminToken || null,
    })
  }

  router.get('/me', requireAdmin, handleGetMe)
  router.get('/session', requireAdmin, handleGetMe)

  // POST /api/admin/auth/logout
  router.post('/logout', requireAdmin, requireAdminCsrf, async (request, response, next) => {
    try {
      await sessionModel.deleteOne({ sessionId: request.adminSessionId })
    } catch (error) {
      next(error)
      return
    }
    clearAdminSession(response, secureCookies)
    response.status(204).end()
  })

  return router
}
