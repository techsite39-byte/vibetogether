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
} = {}) {
  if (
    typeof bookingModel.find === 'function' &&
    typeof bookingEnquiryModel.find === 'function' &&
    typeof counterModel.findOneAndUpdate === 'function'
  ) {
    const seedValue = FIRST_BOOKING_REFERENCE - 1
    const [bookings, enquiries] = await Promise.all([
      bookingModel.find({ reference: /^\d+$/ }, 'reference').lean(),
      bookingEnquiryModel.find({ reference: /^\d+$/ }, 'reference').lean(),
    ])
    const maxExistingReference = [...bookings, ...enquiries].reduce((max, record) => {
      const value = numericReference(record.reference)
      return value === null ? max : Math.max(max, value)
    }, seedValue)

    await counterModel.findOneAndUpdate(
      { _id: 'booking-reference-counter' },
      { $setOnInsert: { _id: 'booking-reference-counter', value: seedValue } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    await counterModel.updateOne(
      { _id: 'booking-reference-counter' },
      { $max: { value: maxExistingReference } },
    )
    const counter = await counterModel.findOneAndUpdate(
      { _id: 'booking-reference-counter' },
      { $inc: { value: 1 } },
      { new: true },
    )
    if (!counter || !Number.isSafeInteger(counter.value)) {
      throw new Error('Booking reference generation failed.')
    }
    return String(counter.value)
  }

  fallbackValue = Math.max(fallbackValue + 1, FIRST_BOOKING_REFERENCE)
  return String(fallbackValue)
}
