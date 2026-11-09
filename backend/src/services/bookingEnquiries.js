import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { randomUUID } from 'node:crypto'

const demoPaymentAmount = 299

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

export async function findBookingEnquiry(requestId) {
  return BookingEnquiry.findOne({ requestId }).lean()
}

export async function markBookingEnquiryDemoPaid(requestId) {
  const updated = await BookingEnquiry.findOneAndUpdate(
    {
      requestId,
      status: { $ne: 'cancelled' },
      paymentStatus: { $ne: 'demo_paid' },
    },
    {
      $set: {
        paymentStatus: 'demo_paid',
        paymentAmount: demoPaymentAmount,
        paymentProvider: 'razorpay_demo',
        paymentReference: `demo_${randomUUID()}`,
        paidAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  ).lean()

  if (updated) {
    return { enquiry: updated, duplicate: false }
  }

  const existing = await findBookingEnquiry(requestId)
  if (!existing || existing.status === 'cancelled') {
    return null
  }
  if (existing.paymentStatus === 'demo_paid') {
    return { enquiry: existing, duplicate: true }
  }

  throw new Error('The demo payment status could not be updated.')
}
