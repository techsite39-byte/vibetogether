import { BookingEnquiry } from '../models/bookingEnquiry.js'

function sameRequest(existing, enquiry) {
  return (
    existing.name === enquiry.name &&
    existing.mobile === enquiry.mobile &&
    existing.eventId === enquiry.eventId &&
    (existing.categoryId ?? '') === (enquiry.categoryId ?? '') &&
    existing.gender === enquiry.gender
  )
}

function throwIdempotencyConflict() {
  throw Object.assign(
    new Error('A booking request ID was reused with different details.'),
    { status: 409 },
  )
}

export async function saveBookingEnquiry(enquiry) {
  const existing = await BookingEnquiry.findOne({
    requestId: enquiry.requestId,
  }).lean()
  if (existing) {
    if (!sameRequest(existing, enquiry)) {
      throwIdempotencyConflict()
    }

    return { enquiry: existing, duplicate: true }
  }

  try {
    const saved = await BookingEnquiry.create(enquiry)
    return { enquiry: saved.toObject(), duplicate: false }
  } catch (error) {
    if (error.code !== 11000) {
      throw error
    }

    const duplicate = await BookingEnquiry.findOne({
      requestId: enquiry.requestId,
    }).lean()
    if (!duplicate) {
      throw error
    }

    if (!sameRequest(duplicate, enquiry)) {
      throwIdempotencyConflict()
    }

    return { enquiry: duplicate, duplicate: true }
  }
}
