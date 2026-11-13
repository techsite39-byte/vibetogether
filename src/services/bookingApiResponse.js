export class BookingApiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BookingApiError'
  }
}

function getFailureMessage(status, operation, payload) {
  if (status === 429) {
    return 'Too many attempts. Please wait a little and try again.'
  }
  if (
    status < 500 &&
    typeof payload?.message === 'string' &&
    payload.message.trim()
  ) {
    return payload.message
  }
  if (status >= 500) {
    return `${operation} could not be completed because the service is temporarily unavailable. Please try again.`
  }
  return `${operation} failed with HTTP ${status}. Please try again.`
}

export async function readBookingApiResponse(response, operation) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('json')) {
    if (response.status === 404) {
      throw new BookingApiError(`${operation} endpoint was not found (HTTP 404).`)
    }
    if (response.status >= 500) {
      throw new BookingApiError(
        `${operation} service is temporarily unavailable (HTTP ${response.status}). Please try again.`,
      )
    }
    throw new BookingApiError(
      `${operation} returned an unreadable response (HTTP ${response.status}).`,
    )
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new BookingApiError(
      `${operation} returned an invalid response. Please try again.`,
    )
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BookingApiError(
      `${operation} returned an invalid response. Please try again.`,
    )
  }

  if (!response.ok) {
    throw new BookingApiError(
      getFailureMessage(response.status, operation, payload),
    )
  }

  return payload
}
