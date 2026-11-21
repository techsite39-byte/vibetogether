import { API_BASE_URL } from '../config/api.js'
import { readBookingApiResponse } from './bookingApiResponse.js'

function validateBooking(booking) {
  if (
    !booking ||
    typeof booking !== 'object' ||
    typeof booking.requestId !== 'string' ||
    typeof booking.name !== 'string' ||
    typeof booking.mobile !== 'string' ||
    (booking.email !== undefined && typeof booking.email !== 'string') ||
    typeof booking.gender !== 'string' ||
    typeof booking.paymentStatus !== 'string' ||
    typeof booking.paymentAmount !== 'number'
  ) {
    throw new Error('Booking details could not be verified. Please try again.')
  }
  return booking
}

async function requestBooking(path, options, signal, operation = 'Booking details') {
  const payload = await requestPayload(path, options, signal, operation)
  return validateBooking(payload.booking)
}

async function requestPayload(path, options, signal, operation) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/booking-enquiries/${path}`, {
      ...options,
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(`${operation} service could not be reached. Please try again.`)
  }

  const payload = await readBookingApiResponse(response, operation)
  return payload
}

export async function getBookingEnquiry(requestId, signal) {
  return requestBooking(encodeURIComponent(requestId), {}, signal)
}

export async function recordDemoBookingPayment(requestId) {
  return requestBooking(
    `${encodeURIComponent(requestId)}/demo-payment`,
    { method: 'POST' },
    undefined,
    'Demo payment',
  )
}

export async function recordDemoBookingFailure(requestId, outcome) {
  return requestBooking(
    `${encodeURIComponent(requestId)}/demo-payment-failure`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    },
    undefined,
    'Demo payment failure',
  )
}

export async function createCashfreeOrder(requestId, returnUrl) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/cashfree-order`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl }),
    },
    undefined,
    'Cashfree order',
  )
  if (payload.alreadyPaid) {
    return { alreadyPaid: true, booking: validateBooking(payload.booking) }
  }
  if (typeof payload.payment_session_id !== 'string' || !payload.payment_session_id) {
    throw new Error('Cashfree did not return a valid payment session.')
  }
  return {
    ...payload,
    booking: payload.booking ? validateBooking(payload.booking) : undefined,
  }
}

export async function verifyCashfreePayment(requestId, paymentData) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/cashfree-verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData || {}),
    },
    undefined,
    'Cashfree payment verification',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}

export async function checkCashfreePaymentStatus(requestId) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/cashfree-status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    undefined,
    'Cashfree payment status',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}

export async function recordCashfreePaymentFailure(requestId, failure) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/cashfree-failure`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(failure || {}),
    },
    undefined,
    'Cashfree payment failure',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}

export async function submitUpiPayment(requestId, utr) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/upi-payment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utr }),
    },
    undefined,
    'UPI payment submission',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}
