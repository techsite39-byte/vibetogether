import { API_BASE_URL } from '../config/api.js'
import { readBookingApiResponse } from './bookingApiResponse.js'

function validateBooking(booking) {
  if (
    !booking ||
    typeof booking !== 'object' ||
    typeof booking.requestId !== 'string' ||
    typeof booking.name !== 'string' ||
    typeof booking.mobile !== 'string' ||
    typeof booking.gender !== 'string' ||
    typeof booking.paymentStatus !== 'string' ||
    typeof booking.paymentAmount !== 'number'
  ) {
    throw new Error('Booking details could not be verified. Please try again.')
  }

  return booking
}

async function requestBooking(path, options, signal) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/booking-enquiries/${path}`, {
      ...options,
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('The booking service could not be reached. Please try again.')
  }

  const payload = await readBookingApiResponse(response, 'Booking details')
  return validateBooking(payload.booking)
}

export async function getBookingEnquiry(requestId, signal) {
  return requestBooking(encodeURIComponent(requestId), {}, signal)
}

export async function recordDemoBookingPayment(requestId) {
  return requestBooking(
    `${encodeURIComponent(requestId)}/demo-payment`,
    { method: 'POST' },
  )
}
