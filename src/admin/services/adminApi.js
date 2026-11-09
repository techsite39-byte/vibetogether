import { API_BASE_URL } from '../../config/api.js'

let csrfToken = ''

async function authFetch(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
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
  const method = options.method ?? 'GET'
  const headers = new Headers(options.headers)
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    if (!csrfToken) {
      throw new Error('Your admin session needs to be refreshed. Sign in again.')
    }
    headers.set('X-CSRF-Token', csrfToken)
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
  csrfToken = session.csrfToken
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
  csrfToken = result.csrfToken
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
  csrfToken = result.csrfToken
  return result.admin
}

export function getGoogleAuthRedirectUrl() {
  const redirectUrl = new URL(
    `${API_BASE_URL}/admin/auth/google/redirect`,
    window.location.origin,
  )
  redirectUrl.searchParams.set('frontend_origin', window.location.origin)
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
    csrfToken = ''
  }
}

/**
 * Retries a failed WhatsApp notification for a booking safely without sending duplicates.
 */
export async function retryWhatsAppNotification(reference) {
  return adminRequest(`/bookings/${encodeURIComponent(reference)}/whatsapp/retry`, {
    method: 'POST',
  })
}
