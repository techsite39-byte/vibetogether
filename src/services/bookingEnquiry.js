import { BookingApiError, readBookingApiResponse } from './bookingApiResponse.js'

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? '/api'

export async function getBookingEvents(signal) {
  let payload
  try {
    const response = await fetch(`${API_BASE_URL}/events`, { signal })
    payload = await readBookingApiResponse(response, 'Events')
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof BookingApiError) {
      throw error
    }
    throw new BookingApiError(
      'We could not load experiences right now. Please try again.',
    )
  }

  if (
    !Array.isArray(payload.events) ||
    payload.events.some(
      (event) =>
        !event ||
        typeof event.id !== 'string' ||
        typeof event.title !== 'string' ||
        (event.description != null && typeof event.description !== 'string') ||
        (event.image != null && typeof event.image !== 'string') ||
        (event.imageAlt != null && typeof event.imageAlt !== 'string'),
    )
  ) {
    throw new BookingApiError(
      'Experiences could not be loaded. Please try again.',
    )
  }

  return payload.events.map((event) => ({
    ...event,
    description: event.description ?? '',
    image: event.image ?? '',
    imageAlt: event.imageAlt ?? '',
  }))
}

export async function submitBookingEnquiry(enquiry, signal) {
  try {
    const response = await fetch(`${API_BASE_URL}/booking-enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(enquiry),
    })

    return await readBookingApiResponse(response, 'Booking requests')
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof BookingApiError) {
      throw error
    }
    throw new BookingApiError(
      'We could not submit your request right now. Please try again.',
    )
  }
}
