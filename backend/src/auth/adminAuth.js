import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { AdminCredential } from '../models/adminRecords.js'

const scrypt = promisify(scryptCallback)
const sessionCookie = 'vt_admin_session'
const csrfCookie = 'vt_admin_csrf'
const sessionLifetimeSeconds = 8 * 60 * 60
const loginWindowMilliseconds = 15 * 60 * 1000
const loginLimit = 5

function safeEqual(first, second) {
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
    'Path=/api/admin',
    'SameSite=Strict',
    maxAge == null ? '' : `Max-Age=${maxAge}`,
    httpOnly ? 'HttpOnly' : '',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

function setSessionCookies(response, token, csrfToken, secure) {
  response.setHeader('Set-Cookie', [
    `${sessionCookie}=${encodeURIComponent(token)}; ${cookieOptions({
      secure,
      maxAge: sessionLifetimeSeconds,
      httpOnly: true,
    })}`,
    `${csrfCookie}=${encodeURIComponent(csrfToken)}; ${cookieOptions({
      secure,
      maxAge: sessionLifetimeSeconds,
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

function createLoginRateLimiter() {
  const attempts = new Map()

  return function limitAdminLogin(request, response, next) {
    const now = Date.now()
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown'
    const current = attempts.get(key)
    const record =
      !current || now - current.startedAt >= loginWindowMilliseconds
        ? { startedAt: now, count: 0 }
        : current
    record.count += 1
    attempts.set(key, record)

    if (attempts.size > 10000) {
      for (const [client, value] of attempts) {
        if (now - value.startedAt >= loginWindowMilliseconds) {
          attempts.delete(client)
        }
      }
    }

    if (record.count > loginLimit) {
      response.set('Retry-After', String(loginWindowMilliseconds / 1000))
      response.status(429).json({ message: 'Too many sign-in attempts. Try again later.' })
      return
    }

    next()
  }
}

export function createRequireAdmin({ sessionSecret, model = AdminCredential }) {
  return async function requireAdmin(request, response, next) {
    try {
      if (!sessionSecret) {
        response.status(503).json({ message: 'Admin authentication is not configured.' })
        return
      }

      const payload = verifyPayload(readCookie(request, sessionCookie), sessionSecret)
      if (!payload || typeof payload.sub !== 'string') {
        response.status(401).json({ message: 'Admin sign-in is required.' })
        return
      }

      const admin = await model.findById(payload.sub).select('username role active').lean()
      if (!admin?.active || !['admin', 'super_admin'].includes(admin.role)) {
        response.status(401).json({ message: 'Admin session is no longer valid.' })
        return
      }

      request.admin = {
        id: String(admin._id),
        username: admin.username,
        role: admin.role,
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireAdminCsrf(request, response, next) {
  const origin = request.get('origin')
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

export function createAdminAuthRouter({
  bootstrapPasswordHash,
  model = AdminCredential,
  sessionSecret,
  secureCookies = false,
  username,
}) {
  const router = Router()
  const limitLogin = createLoginRateLimiter()
  const requireAdmin = createRequireAdmin({ sessionSecret, model })

  router.get('/configuration', (_request, response) => {
    response.json({
      configured: Boolean(username && sessionSecret),
    })
  })

  router.post('/login', limitLogin, async (request, response, next) => {
    try {
      if (!username || !sessionSecret) {
        response.status(503).json({ message: 'Admin authentication is not configured.' })
        return
      }

      const suppliedUsername =
        typeof request.body?.username === 'string'
          ? request.body.username.trim().toLowerCase()
          : ''
      const password =
        typeof request.body?.password === 'string' ? request.body.password : ''
      const admin = await model.findOne({ username: suppliedUsername, active: true })
        .select('+passwordHash username role')
        .exec()
      const valid = await verifyAdminPassword(
        password,
        admin?.passwordHash ?? bootstrapPasswordHash,
      )

      if (!admin || !valid) {
        response.status(401).json({ message: 'Username or password is incorrect.' })
        return
      }

      admin.lastLoginAt = new Date()
      await admin.save()
      const expiresAt = Date.now() + sessionLifetimeSeconds * 1000
      const token = signPayload({ sub: String(admin._id), exp: expiresAt }, sessionSecret)
      const csrfToken = randomBytes(24).toString('base64url')
      setSessionCookies(response, token, csrfToken, secureCookies)
      response.json({
        admin: { id: String(admin._id), username: admin.username, role: admin.role },
        csrfToken,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/session', requireAdmin, (request, response) => {
    response.json({ admin: request.admin, csrfToken: readCookie(request, csrfCookie) })
  })

  router.post('/logout', requireAdmin, requireAdminCsrf, (_request, response) => {
    clearAdminSession(response, secureCookies)
    response.status(204).end()
  })

  return router
}
