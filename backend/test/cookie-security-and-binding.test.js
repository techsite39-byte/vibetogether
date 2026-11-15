import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearAdminSession,
  cookieOptions,
  googleBindingCookieValue,
  setSessionCookies,
} from '../src/auth/adminAuth.js'

function createMockResponse(initialHeaders = {}) {
  const headers = new Map(Object.entries(initialHeaders))
  return {
    getHeader(name) {
      return headers.get(name) ?? null
    },
    setHeader(name, value) {
      headers.set(name, value)
    },
    headers,
  }
}

test('googleBindingCookieValue formats secure production cookies with SameSite=None, Secure, and Partitioned', () => {
  const binding = 'test-binding-value-1234567890-abcdef'
  const cookieString = googleBindingCookieValue(binding, true, 600)

  assert.ok(cookieString.startsWith('__Host-vt_google_browser_binding='))
  assert.ok(cookieString.includes('Path=/'))
  assert.ok(cookieString.includes('SameSite=None'))
  assert.ok(cookieString.includes('Max-Age=600'))
  assert.ok(cookieString.includes('HttpOnly'))
  assert.ok(cookieString.includes('Secure'))
  assert.ok(cookieString.includes('Partitioned'))
})

test('googleBindingCookieValue formats development cookies with SameSite=Lax without Secure or Partitioned', () => {
  const binding = 'test-binding-value-1234567890-abcdef'
  const cookieString = googleBindingCookieValue(binding, false, 600)

  assert.ok(cookieString.startsWith('vt_google_browser_binding='))
  assert.ok(!cookieString.startsWith('__Host-'))
  assert.ok(cookieString.includes('Path=/'))
  assert.ok(cookieString.includes('SameSite=Lax'))
  assert.ok(cookieString.includes('Max-Age=600'))
  assert.ok(cookieString.includes('HttpOnly'))
  assert.ok(!cookieString.includes('Secure'))
  assert.ok(!cookieString.includes('Partitioned'))
})

test('cookieOptions matches security policy for secure and development environments', () => {
  const secureOpts = cookieOptions({ secure: true, maxAge: 86400, httpOnly: true })
  assert.ok(secureOpts.includes('SameSite=None'))
  assert.ok(secureOpts.includes('Secure'))
  assert.ok(secureOpts.includes('Partitioned'))
  assert.ok(secureOpts.includes('HttpOnly'))
  assert.ok(secureOpts.includes('Path=/'))

  const devOpts = cookieOptions({ secure: false, maxAge: 86400, httpOnly: false })
  assert.ok(devOpts.includes('SameSite=Lax'))
  assert.ok(!devOpts.includes('Secure'))
  assert.ok(!devOpts.includes('Partitioned'))
  assert.ok(!devOpts.includes('HttpOnly'))
  assert.ok(devOpts.includes('Path=/'))
})

test('setSessionCookies removes duplicate session/csrf cookies while preserving unrelated headers', () => {
  const response = createMockResponse({
    'Set-Cookie': [
      '__Host-vt_google_browser_binding=browser-token-123; Path=/; Secure',
      'vt_admin_session=old-stale-session-token; Path=/',
      'vt_admin_csrf=old-stale-csrf-token; Path=/',
      'custom_tracker=visitor-456; Path=/',
    ],
  })

  setSessionCookies(response, 'new-jwt-token-789', 'new-csrf-token-abc', true, 3600)

  const updatedCookies = response.getHeader('Set-Cookie')
  assert.ok(Array.isArray(updatedCookies))

  // Unrelated cookies must be preserved
  assert.ok(updatedCookies.some((c) => c.startsWith('__Host-vt_google_browser_binding=')))
  assert.ok(updatedCookies.some((c) => c.startsWith('custom_tracker=')))

  // Exactly one session cookie and one csrf cookie must be present (no duplicates)
  const sessionCookies = updatedCookies.filter((c) => c.startsWith('vt_admin_session='))
  const csrfCookies = updatedCookies.filter((c) => c.startsWith('vt_admin_csrf='))

  assert.equal(sessionCookies.length, 1, 'Must have exactly one vt_admin_session cookie')
  assert.equal(csrfCookies.length, 1, 'Must have exactly one vt_admin_csrf cookie')

  assert.ok(sessionCookies[0].includes('new-jwt-token-789'))
  assert.ok(sessionCookies[0].includes('Partitioned'))
  assert.ok(csrfCookies[0].includes('new-csrf-token-abc'))
})

test('clearAdminSession clears session/csrf cookies without deleting unrelated cookies', () => {
  const response = createMockResponse({
    'Set-Cookie': [
      '__Host-vt_google_browser_binding=browser-token-123; Path=/; Secure',
      'vt_admin_session=active-session; Path=/',
      'vt_admin_csrf=active-csrf; Path=/',
    ],
  })

  clearAdminSession(response, true)

  const updatedCookies = response.getHeader('Set-Cookie')
  assert.ok(Array.isArray(updatedCookies))

  // Google binding cookie preserved
  assert.ok(updatedCookies.some((c) => c.startsWith('__Host-vt_google_browser_binding=')))

  // Cleared session and csrf cookies have Max-Age=0
  const sessionCookies = updatedCookies.filter((c) => c.startsWith('vt_admin_session='))
  const csrfCookies = updatedCookies.filter((c) => c.startsWith('vt_admin_csrf='))

  assert.equal(sessionCookies.length, 1)
  assert.equal(csrfCookies.length, 1)

  assert.ok(sessionCookies[0].includes('Max-Age=0'))
  assert.ok(csrfCookies[0].includes('Max-Age=0'))
})
