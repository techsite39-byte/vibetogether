import {
  bookingConfig,
  isPaymentBackendConfigured,
} from '../config/booking.js'

function getApiUrl(path) {
  if (!isPaymentBackendConfigured) {
    throw new Error(
      'Online payments are unavailable until the booking backend is configured.',
    )
  }

  return `${bookingConfig.paymentApiUrl}/${path}`
}

async function readJsonResponse(response) {
  let payload

  try {
    payload = await response.json()
  } catch {
    throw new Error('The booking service returned an unreadable response.')
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The booking service returned an invalid response.')
  }

  if (!response.ok) {
    throw new Error(
      typeof payload.message === 'string'
        ? payload.message
        : 'The booking service could not complete the request.',
    )
  }

  return payload
}

function validateCheckoutUrl(value) {
  let url

  try {
    url = new URL(value)
  } catch {
    throw new Error('The booking service returned an invalid checkout link.')
  }

  const isLocalDevelopment =
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
    url.protocol === 'http:'

  if (url.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error('The checkout link must use a secure HTTPS connection.')
  }

  return url.href
}

export async function createCheckoutSession({
  attendee,
  eventId,
  specialRequests,
  ticketCount,
}) {
  const response = await fetch(getApiUrl('checkout-sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      provider: bookingConfig.paymentProvider,
      currency: bookingConfig.currency,
      eventId,
      ticketCount,
      attendee,
      specialRequests,
      returnUrl: `${window.location.origin}/booking/confirmation`,
    }),
  })
  const payload = await readJsonResponse(response)

  if (typeof payload.checkoutUrl !== 'string') {
    throw new Error('The booking service did not provide a checkout link.')
  }

  return {
    checkoutUrl: validateCheckoutUrl(payload.checkoutUrl),
    checkoutSessionId:
      typeof payload.checkoutSessionId === 'string'
        ? payload.checkoutSessionId
        : null,
  }
}

export async function verifyPayment(paymentReference, signal) {
  const response = await fetch(getApiUrl('payments/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    signal,
    body: JSON.stringify({ paymentReference }),
  })

  return readJsonResponse(response)
}
