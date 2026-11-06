import { BookingApiError } from './bookingApiResponse.js'

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    if (options.signal?.aborted) {
      throw new DOMException('The request was aborted.', 'AbortError')
    }
    throw new BookingApiError('The booking service could not be reached. Please try again.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new BookingApiError('The booking service returned an unreadable response.')
  }
  if (!response.ok) {
    throw new BookingApiError(
      typeof payload.message === 'string'
        ? payload.message
        : 'The booking service could not complete the request.',
    )
  }
  return payload
}

export async function createBooking(record) {
  const response = await request('/bookings', {
    method: 'POST',
    body: JSON.stringify(record),
  })
  if (!response.booking || typeof response.booking.reference !== 'string') {
    throw new BookingApiError('The booking service returned an invalid booking.')
  }
  return response.booking
}

export async function getBooking(reference, signal) {
  const response = await request(`/bookings/${encodeURIComponent(reference)}`, { signal })
  if (!response.booking || response.booking.reference !== reference) {
    throw new BookingApiError('The booking service returned an invalid booking.')
  }
  return response.booking
}

export async function cancelBooking(reference) {
  const response = await request(
    `/bookings/${encodeURIComponent(reference)}/cancel`,
    { method: 'POST', body: '{}' },
  )
  if (!response.booking || response.booking.reference !== reference) {
    throw new BookingApiError('The booking service returned an invalid booking.')
  }
  return response.booking
}
