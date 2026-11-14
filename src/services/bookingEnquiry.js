import { BookingApiError, readBookingApiResponse } from './bookingApiResponse.js'
import { API_BASE_URL } from '../config/api.js'

const PUBLIC_EVENTS_CACHE_TTL_MS = 30_000
let publicEventsCache
let publicEventsCachedAt = 0

export async function getBookingEvents(signal) {
  if (signal?.aborted) {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    throw error
  }

  if (
    publicEventsCache &&
    Date.now() - publicEventsCachedAt < PUBLIC_EVENTS_CACHE_TTL_MS
  ) {
    return publicEventsCache.map((event) => ({ ...event }))
  }

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

  const events = payload.events.map((event) => ({
    ...event,
    description: event.description ?? '',
    image: event.image ?? '',
    imageAlt: event.imageAlt ?? '',
  }))
  publicEventsCache = events
  publicEventsCachedAt = Date.now()
  return events.map((event) => ({ ...event }))
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
      'Connection interrupted. Your details are still here; please retry.',
    )
  }
}
