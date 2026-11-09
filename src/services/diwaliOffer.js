import { API_BASE_URL } from '../config/api.js'

export async function getDiwaliOffer(signal) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/public-settings/diwali-offer`, { signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Diwali offer details could not be loaded.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.offer) {
    throw new Error(payload.message || 'Diwali offer details could not be loaded.')
  }
  return payload.offer
}

export function getOfferRemainingMs(expiresAt, now = Date.now()) {
  const expiry = new Date(expiresAt).getTime()
  return Number.isFinite(expiry) ? Math.max(0, expiry - now) : 0
}

export function formatOfferExpiry(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}
