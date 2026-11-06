const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? '/api'
let csrfToken = ''

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

export async function getAdminConfiguration() {
  const response = await fetch(`${API_BASE_URL}/admin/auth/configuration`, {
    credentials: 'include',
  })
  return readResponse(response)
}

export async function getAdminSession() {
  const session = await adminRequest('/admin/auth/session')
  csrfToken = session.csrfToken
  return session.admin
}

export async function signInAdmin(username, password) {
  const response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })
  const result = await readResponse(response)
  csrfToken = result.csrfToken
  return result.admin
}

export async function signOutAdmin() {
  await adminRequest('/admin/auth/logout', { method: 'POST' })
  csrfToken = ''
}
