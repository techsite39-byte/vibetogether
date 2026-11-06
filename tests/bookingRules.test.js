import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBookingTotals } from '../src/utils/bookingTotals.js'
import {
  validateBookingForm,
} from '../src/utils/bookingValidation.js'
import {
  validateContactForm,
  validateHostEventForm,
} from '../src/utils/contactValidation.js'
import { bookingConfig } from '../src/config/booking.js'

const validBooking = {
  fullName: 'Alex Example',
  email: 'alex@example.com',
  mobile: '+1 555 123 4567',
  ticketCount: 2,
  specialRequests: '',
}

test('booking validation accepts valid details and rejects invalid quantities and fields', () => {
  assert.deepEqual(validateBookingForm(validBooking, 3), {})
  const errors = validateBookingForm(
    { ...validBooking, email: 'bad', ticketCount: 4 },
    3,
  )
  assert.ok(errors.email)
  assert.match(errors.ticketCount, /Only 3 seats/)
  assert.ok(validateBookingForm({ ...validBooking, ticketCount: 0 }, 3).ticketCount)
})

test('booking totals calculate free and paid amounts without false paid success', () => {
  const free = calculateBookingTotals(
    { isFree: true, priceAmount: 0, currency: 'INR' },
    3,
  )
  assert.deepEqual(free, { subtotal: 0, fees: 0, total: 0, currency: 'INR' })

  const paid = calculateBookingTotals(
    { isFree: false, priceAmount: 24, currency: 'INR' },
    2,
  )
  assert.equal(paid.subtotal, 48)
  assert.equal(paid.fees, bookingConfig.feePerPaidTicket * 2)
  assert.equal(paid.total, paid.subtotal + paid.fees)
  assert.equal(calculateBookingTotals({ isFree: false, priceAmount: 24 }, -1).total, 0)
})

test('contact form validation rejects incomplete and malformed submissions', () => {
  assert.deepEqual(
    validateContactForm({
      fullName: 'Alex Example',
      email: 'alex@example.com',
      mobile: '+1 555 123 4567',
      subject: 'Question',
      enquiryType: 'general',
      message: 'A sufficiently detailed message.',
    }),
    {},
  )
  assert.ok(
    validateContactForm({
      fullName: ' ',
      email: 'invalid',
      mobile: '123',
      subject: '',
      enquiryType: 'unknown',
      message: 'short',
    }).message,
  )
})

test('host event form validation rejects past dates and invalid attendees', () => {
  const validForm = {
    organizerName: 'Alex Example',
    email: 'alex@example.com',
    phone: '+1 555 123 4567',
    eventName: 'Community Game Night',
    categoryId: 'fun-games',
    expectedAttendees: '30',
    proposedDate: '2099-12-31',
    description: 'A friendly evening of games and community activities.',
  }
  assert.deepEqual(validateHostEventForm(validForm), {})
  assert.ok(
    validateHostEventForm({
      ...validForm,
      proposedDate: '2000-01-01',
      expectedAttendees: '0',
    }).proposedDate,
  )
})
