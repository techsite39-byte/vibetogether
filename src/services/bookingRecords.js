import { BookingApiError } from './bookingApiResponse.js'
import { API_BASE_URL } from '../config/api.js'
import { getBookingEnquiry } from './bookingEnquiryPayment.js'

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  if (requestIdPattern.test(reference)) {
    const enquiry = await getBookingEnquiry(reference, signal)
    if (enquiry.requestId !== reference) {
      throw new BookingApiError('The booking service returned an invalid booking.')
    }
    return {
      ...enquiry,
      reference: enquiry.reference || enquiry.requestId,
      event: {
        title: enquiry.event || enquiry.category || 'Vibe Together Experience',
        category: enquiry.category || '',
        date: '',
        time: '',
        location: '',
      },
      attendee: {
        fullName: enquiry.name,
        email: enquiry.email ?? '',
        mobile: enquiry.mobile,
      },
      ticketCount: enquiry.ticketQuantity,
      total: enquiry.paymentAmount,
      currency: 'INR',
    }
  }

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
