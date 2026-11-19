import { Booking, BookingReferenceCounter } from '../models/adminRecords.js'
import { BookingEnquiry } from '../models/bookingEnquiry.js'

export const FIRST_BOOKING_REFERENCE = 10812026501

let fallbackValue = FIRST_BOOKING_REFERENCE - 1

function numericReference(reference) {
  if (typeof reference !== 'string' || !/^\d+$/.test(reference)) {
    return null
  }
  const value = Number(reference)
  return Number.isSafeInteger(value) ? value : null
}

export async function nextBookingReference({
  bookingModel = Booking,
  bookingEnquiryModel = BookingEnquiry,
  counterModel = BookingReferenceCounter,
  session,
} = {}) {
  if (
    typeof bookingModel.find === 'function' &&
    typeof bookingEnquiryModel.find === 'function' &&
    typeof counterModel.findOneAndUpdate === 'function'
  ) {
    const seedValue = FIRST_BOOKING_REFERENCE - 1
    const bookingsQuery = bookingModel.find({ reference: /^\d+$/ }, 'reference')
    const enquiriesQuery = bookingEnquiryModel.find({ reference: /^\d+$/ }, 'reference')
    const bookingsWithSession = session && typeof bookingsQuery.session === 'function'
      ? bookingsQuery.session(session)
      : bookingsQuery
    const enquiriesWithSession = session && typeof enquiriesQuery.session === 'function'
      ? enquiriesQuery.session(session)
      : enquiriesQuery
    const [bookings, enquiries] = await Promise.all([
      bookingsWithSession.lean(),
      enquiriesWithSession.lean(),
    ])
    const maxExistingReference = [...bookings, ...enquiries].reduce((max, record) => {
      const value = numericReference(record.reference)
      return value === null ? max : Math.max(max, value)
    }, seedValue)

    await counterModel.findOneAndUpdate(
      { _id: 'booking-reference-counter' },
      { $setOnInsert: { _id: 'booking-reference-counter', value: seedValue } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session },
    )
    await counterModel.updateOne(
      { _id: 'booking-reference-counter' },
      { $max: { value: maxExistingReference } },
      { session },
    )
    const counter = await counterModel.findOneAndUpdate(
      { _id: 'booking-reference-counter' },
      { $inc: { value: 1 } },
      { new: true, session },
    )
    if (!counter || !Number.isSafeInteger(counter.value)) {
      throw new Error('Booking reference generation failed.')
    }
    return String(counter.value)
  }

  fallbackValue = Math.max(fallbackValue + 1, FIRST_BOOKING_REFERENCE)
  return String(fallbackValue)
}
