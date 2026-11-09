import { validateBookingForm } from './bookingValidation.js'

const STORAGE_KEY = 'vibe-together.mock-bookings.v1'
const BOOKING_REFERENCES_KEY = 'vibe-together.booking-references.v1'
const BOOKING_REFERENCE_COUNTER_KEY = 'vibe-together.booking-reference-counter.v1'
const BOOKINGS_CHANGED_EVENT = 'vibe-together:mock-bookings-changed'
const BOOKING_REFERENCE_START = 10812026501

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Booking storage is unavailable in this browser.')
  }

  return window.localStorage
}

export function getBookings() {
  let serializedBookings

  try {
    serializedBookings = getStorage().getItem(STORAGE_KEY)
  } catch {
    throw new Error(
      'Bookings could not be read from this browser. Check storage permissions and try again.',
    )
  }

  if (!serializedBookings) {
    return []
  }

  try {
    const bookings = JSON.parse(serializedBookings)

    if (
      !Array.isArray(bookings) ||
      bookings.some(
        (booking) =>
          !booking ||
          typeof booking.reference !== 'string' ||
          typeof booking.eventId !== 'string' ||
          !Number.isInteger(booking.ticketCount),
      )
    ) {
      throw new Error('Stored booking data has an unexpected format.')
    }

    return bookings
  } catch {
    throw new Error(
      'Stored booking data could not be read. Clear the mock booking data and try again.',
    )
  }
}

function saveBookings(bookings) {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(bookings))
  } catch {
    throw new Error(
      'The booking could not be saved in this browser. Check available storage and try again.',
    )
  }

  window.dispatchEvent(new Event(BOOKINGS_CHANGED_EVENT))
}

export function subscribeToBookings(onChange) {
  function handleStorageChange(event) {
    if (!event.key || event.key === STORAGE_KEY || event.key === BOOKING_REFERENCES_KEY) {
      onChange()
    }
  }

  window.addEventListener('storage', handleStorageChange)
  window.addEventListener(BOOKINGS_CHANGED_EVENT, onChange)

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener(BOOKINGS_CHANGED_EVENT, onChange)
  }
}

export function getBookingReferences() {
  let serializedReferences
  try {
    serializedReferences = getStorage().getItem(BOOKING_REFERENCES_KEY)
  } catch {
    throw new Error('Booking references could not be read from this browser.')
  }
  if (!serializedReferences) {
    return []
  }
  try {
    const references = JSON.parse(serializedReferences)
    if (
      !Array.isArray(references) ||
      references.some((reference) => typeof reference !== 'string' || reference.length > 80)
    ) {
      throw new Error('Stored booking references have an unexpected format.')
    }
    return [...new Set(references)]
  } catch {
    throw new Error('Stored booking references could not be read.')
  }
}

export function rememberBookingReference(reference) {
  if (typeof reference !== 'string' || !reference || reference.length > 80) {
    throw new Error('The booking reference is invalid.')
  }
  const references = getBookingReferences()
  if (!references.includes(reference)) {
    try {
      getStorage().setItem(
        BOOKING_REFERENCES_KEY,
        JSON.stringify([reference, ...references].slice(0, 100)),
      )
    } catch {
      throw new Error('The booking was saved, but its reference could not be stored on this device.')
    }
  }
  window.dispatchEvent(new Event(BOOKINGS_CHANGED_EVENT))
}

export function getReservedTickets(bookings, eventId) {
  return bookings.reduce((total, booking) => {
    if (
      booking.eventId === eventId &&
      booking.status === 'confirmed' &&
      booking.paymentStatus === 'not_required'
    ) {
      return total + booking.ticketCount
    }

    return total
  }, 0)
}

export function getAvailableSeats(event, bookings) {
  return Math.max(
    0,
    event.seatsAvailable - getReservedTickets(bookings, event.id),
  )
}

function readBookingReferenceCounter() {
  const storage = getStorage()
  const rawValue = storage.getItem(BOOKING_REFERENCE_COUNTER_KEY)
  if (rawValue === null || rawValue === '') {
    return BOOKING_REFERENCE_START - 1
  }

  const parsed = Number(rawValue)
  return Number.isInteger(parsed) && parsed >= BOOKING_REFERENCE_START - 1 ? parsed : BOOKING_REFERENCE_START - 1
}

export function createBookingReference() {
  const bookings = getBookings()
  const seedValue = BOOKING_REFERENCE_START - 1
  const highestStoredValue = bookings.reduce((max, booking) => {
    const value = Number(String(booking.reference).match(/\d+/)?.[0] ?? '')
    return Number.isInteger(value) ? Math.max(max, value) : max
  }, seedValue)

  const currentValue = Math.max(readBookingReferenceCounter(), highestStoredValue)
  const nextValue = Math.max(currentValue + 1, highestStoredValue + 1, BOOKING_REFERENCE_START)

  try {
    getStorage().setItem(BOOKING_REFERENCE_COUNTER_KEY, String(nextValue))
  } catch {
    throw new Error('The booking reference could not be stored on this device.')
  }

  return String(nextValue)
}

export function createFreeBooking({
  attendee,
  event,
  specialRequests,
  ticketCount,
  feePerTicket = 0,
}) {
  if (!event.isFree) {
    throw new Error('Only free events can be reserved without payment.')
  }

  if (!Number.isInteger(ticketCount) || ticketCount < 1) {
    throw new Error('Choose at least one attendee.')
  }

  const bookings = getBookings()
  const availableSeats = getAvailableSeats(event, bookings)
  const normalizedAttendee = {
    fullName: attendee?.fullName ?? '',
    email: attendee?.email ?? '',
    mobile: attendee?.mobile ?? '',
  }
  const normalizedRequests = specialRequests ?? ''
  const validationErrors = validateBookingForm(
    {
      ...normalizedAttendee,
      ticketCount,
      specialRequests: normalizedRequests,
    },
    availableSeats,
  )

  if (Object.keys(validationErrors).length > 0) {
    throw new Error(Object.values(validationErrors)[0])
  }

  const createdAt = new Date().toISOString()
  const reference = createBookingReference()

  if (bookings.some((booking) => booking.reference === reference)) {
    throw new Error(
      'A booking reference conflict occurred. Please try reserving again.',
    )
  }

  const booking = {
    reference,
    eventId: event.id,
    event: {
      title: event.title,
      category: event.category,
      date: event.date,
      time: event.time,
      startsAt: event.startsAt,
      location: event.location,
      image: event.image,
      imageAlt: event.imageAlt,
      organizer: event.organizer,
    },
    attendee: {
      fullName: normalizedAttendee.fullName.trim(),
      email: normalizedAttendee.email.trim(),
      mobile: normalizedAttendee.mobile.trim(),
    },
    ticketCount,
    specialRequests: normalizedRequests.trim(),
    subtotal: 0,
    fees: Math.max(0, feePerTicket) * ticketCount,
    total: 0,
    currency: event.currency || 'INR',
    paymentStatus: 'not_required',
    status: 'confirmed',
    createdAt,
    cancelledAt: null,
    storageMode: 'device-mock',
  }

  saveBookings([...bookings, booking])
  return booking
}

export function findBooking(reference, bookings = getBookings()) {
  return bookings.find((booking) => booking.reference === reference) ?? null
}

export function cancelMockBooking(reference) {
  const bookings = getBookings()
  const bookingIndex = bookings.findIndex(
    (booking) => booking.reference === reference,
  )

  if (bookingIndex < 0) {
    throw new Error('This mock booking could not be found.')
  }

  const booking = bookings[bookingIndex]

  if (booking.status !== 'confirmed') {
    throw new Error('This booking is no longer available to cancel.')
  }

  if (booking.paymentStatus !== 'not_required') {
    throw new Error(
      'Paid bookings must be cancelled through the configured booking service.',
    )
  }

  const cancelledBooking = {
    ...booking,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  }
  const updatedBookings = [...bookings]
  updatedBookings[bookingIndex] = cancelledBooking
  saveBookings(updatedBookings)

  return cancelledBooking
}
