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

export async function createRazorpayOrder(requestId) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/razorpay-order`,
    { method: 'POST' },
    undefined,
    'Razorpay order',
  )
  if (payload.pending) {
    return { pending: true, booking: validateBooking(payload.booking) }
  }
  if (
    typeof payload.order_id !== 'string' ||
    typeof payload.key_id !== 'string' ||
    !Number.isInteger(payload.amount) ||
    typeof payload.currency !== 'string'
  ) {
    throw new Error('Razorpay did not return a valid payment order.')
  }
  return payload
}

export async function verifyRazorpayPayment(requestId, payment) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/verify-payment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment),
    },
    undefined,
    'Razorpay payment verification',
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

export async function checkRazorpayPaymentStatus(requestId) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/razorpay-status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    undefined,
    'Razorpay payment status',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}

export async function recordRazorpayPaymentFailure(requestId, failure) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/razorpay-failure`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(failure),
    },
    undefined,
    'Razorpay payment failure',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}

export async function optOutOfWhatsAppUpdates(requestId) {
  return requestBooking(
    `${encodeURIComponent(requestId)}/whatsapp-opt-out`,
    { method: 'POST' },
    undefined,
    'WhatsApp preference update',
  )
}
