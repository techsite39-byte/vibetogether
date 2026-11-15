import { API_BASE_URL } from '../../config/api.js'

const TOKEN_KEY = 'vt_admin_token'
const CSRF_KEY = 'vt_admin_csrf'

let memoryToken = ''
let memoryCsrf = ''

export function getStoredToken() {
  if (memoryToken) return memoryToken
  if (typeof window === 'undefined') return ''
  try {
    const token =
      window.localStorage.getItem(TOKEN_KEY) ||
      window.sessionStorage.getItem(TOKEN_KEY) ||
      ''
    if (token) memoryToken = token
    return token
  } catch {
    return memoryToken
  }
}

export function getStoredCsrf() {
  if (memoryCsrf) return memoryCsrf
  if (typeof window === 'undefined') return ''
  try {
    const csrf =
      window.localStorage.getItem(CSRF_KEY) ||
      window.sessionStorage.getItem(CSRF_KEY) ||
      ''
    if (csrf) memoryCsrf = csrf
    return csrf
  } catch {
    return memoryCsrf
  }
}

export function saveStoredSession({ token, csrfToken, rememberMe = true }) {
  if (token) memoryToken = token
  if (csrfToken) memoryCsrf = csrfToken
  if (typeof window === 'undefined') return

  try {
    if (token) {
      if (rememberMe) {
        window.localStorage.setItem(TOKEN_KEY, token)
        window.sessionStorage.removeItem(TOKEN_KEY)
      } else {
        window.sessionStorage.setItem(TOKEN_KEY, token)
        window.localStorage.removeItem(TOKEN_KEY)
      }
    }
    if (csrfToken) {
      if (rememberMe) {
        window.localStorage.setItem(CSRF_KEY, csrfToken)
        window.sessionStorage.removeItem(CSRF_KEY)
      } else {
        window.sessionStorage.setItem(CSRF_KEY, csrfToken)
        window.localStorage.removeItem(CSRF_KEY)
      }
    }
  } catch {
    // Storage access might be restricted in private browsing mode
  }
}

export function clearStoredSession() {
  memoryToken = ''
  memoryCsrf = ''
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(CSRF_KEY)
    window.sessionStorage.removeItem(CSRF_KEY)
  } catch {
    // ignore storage exceptions
  }
}

// On client startup, inspect URL hash for tokens handed off by Google OAuth redirect
if (typeof window !== 'undefined' && window.location.hash) {
  try {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const hashToken = hashParams.get('admin_token')
    const hashCsrf = hashParams.get('admin_csrf')
    if (hashToken) {
      saveStoredSession({ token: hashToken, csrfToken: hashCsrf, rememberMe: true })
      const cleanUrl = window.location.pathname + window.location.search
      window.history.replaceState(null, '', cleanUrl)
    }
  } catch {
    // ignore
  }
}

async function authFetch(path, options = {}) {
  const headers = new Headers(options.headers)
  const token = getStoredToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new Error('The admin service could not be reached. Check the backend connection and retry.')
  }
  return readResponse(response)
}

async function readResponse(response) {
  let payload = {}
  try {
    payload = response.status === 204 ? {} : await response.json()
  } catch {
    throw new Error('The admin service returned an invalid response.')
  }
  if (!response.ok) {
    const error = new Error(payload.message || `Admin request failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export async function adminRequest(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getStoredToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const csrf = getStoredCsrf()
  if (csrf && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrf)
  }

  // If modifying data without bearer token or csrf token, warn the user
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !token && !csrf) {
    throw new Error('Your admin session needs to be refreshed. Sign in again.')
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new Error('The admin service could not be reached. Check the backend connection and retry.')
  }
  return readResponse(response)
}

/**
 * Checks server auth configuration, including Google OAuth & SMTP availability.
 */
export async function getAdminConfiguration() {
  return authFetch('/admin/auth/configuration')
}

/**
 * Retrieves the current authenticated admin session.
 */
export async function getAdminSession() {
  const session = await adminRequest('/admin/auth/me')
  if (session) {
    saveStoredSession({
      token: session.token || getStoredToken(),
      csrfToken: session.csrfToken || getStoredCsrf(),
    })
  }
  return session.admin
}

export async function getCurrentAdmin() {
  return getAdminSession()
}

/**
 * Signs in an admin via Email and Password.
 * Supports both signInAdmin(email, password) and signInAdmin({ email, password, rememberMe })
 */
export async function signInAdmin(identifierOrOptions, maybePassword, maybeRememberMe = false) {
  let body = {}
  if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
    body = {
      email: identifierOrOptions.email || identifierOrOptions.username,
      username: identifierOrOptions.username || identifierOrOptions.email,
      password: identifierOrOptions.password,
      rememberMe: Boolean(identifierOrOptions.rememberMe),
    }
  } else {
    body = {
      email: identifierOrOptions,
      username: identifierOrOptions,
      password: maybePassword,
      rememberMe: Boolean(maybeRememberMe),
    }
  }

  const result = await authFetch('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  saveStoredSession({
    token: result.token,
    csrfToken: result.csrfToken,
    rememberMe: body.rememberMe,
  })

  return result.admin
}

/**
 * Signs in an admin via Google OAuth 2.0 (Google Identity Services ID token or authorization code).
 */
export async function signInWithGoogle({ credential, code }) {
  const result = await authFetch('/admin/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, code }),
  })

  saveStoredSession({
    token: result.token,
    csrfToken: result.csrfToken,
    rememberMe: true,
  })

  return result.admin
}

export function getGoogleAuthRedirectUrl() {
  const redirectUrl = new URL(
    `${API_BASE_URL}/admin/auth/google/redirect`,
    window.location.origin,
  )
  redirectUrl.searchParams.set('frontend_origin', window.location.origin)
  redirectUrl.searchParams.set('auth_mode', 'token')
  return API_BASE_URL.startsWith('/')
    ? `${redirectUrl.pathname}${redirectUrl.search}`
    : redirectUrl.toString()
}

/**
 * Initiates forgot password flow by requesting a 6-digit OTP to the registered admin email.
 */
export async function requestForgotPasswordOtp(email) {
  return authFetch('/admin/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

/**
 * Verifies the 6-digit OTP submitted by the admin.
 */
export async function verifyForgotPasswordOtp({ email, otp }) {
  return authFetch('/admin/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  })
}

/**
 * Resends the 6-digit OTP (subject to 60-second cooldown).
 */
export async function resendForgotPasswordOtp(email) {
  return authFetch('/admin/auth/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

/**
 * Resets the admin password using the verified reset token.
 */
export async function resetAdminPassword({ email, resetToken, newPassword, confirmPassword }) {
  return authFetch('/admin/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, resetToken, newPassword, confirmPassword }),
  })
}

/**
 * Signs out the current admin and clears server-side session cookies.
 */
export async function signOutAdmin() {
  try {
    await adminRequest('/admin/auth/logout', { method: 'POST' })
  } finally {
    clearStoredSession()
  }
}

/**
 * Retries a failed WhatsApp notification for a booking safely without sending duplicates.
 */
export async function retryWhatsAppNotification(reference) {
  return adminRequest(`/admin/bookings/${encodeURIComponent(reference)}/whatsapp/retry`, {
    method: 'POST',
  })
}

export async function verifyUpiPayment(requestId, decision, rejectionReason = '') {
  return adminRequest(`/admin/upi-payments/${encodeURIComponent(requestId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, rejectionReason }),
  })
}
