export class BookingApiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BookingApiError'
  }
}

function getFailureMessage(status, operation) {
  if (status === 429) {
    return 'Too many attempts. Please wait a little and try again.'
  }
  if (status === 400 || status === 409) {
    return 'Please check your details and try again.'
  }
  if (status >= 500) {
    return "We're temporarily unable to process your booking. Please try again shortly."
  }
  return `${operation} is temporarily unavailable. Please try again.`
}

export async function readBookingApiResponse(response, operation) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('json')) {
    throw new BookingApiError(
      `${operation} is temporarily unavailable. Please try again.`,
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
    throw new BookingApiError(getFailureMessage(response.status, operation))
  }

  return payload
}
