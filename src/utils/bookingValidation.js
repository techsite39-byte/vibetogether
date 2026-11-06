export function validateBookingForm(values, availableSeats) {
  const errors = {}
  const name = values.fullName.trim()
  const email = values.email.trim()
  const phoneDigits = values.mobile.replace(/\D/g, '')
  const attendeeCount = values.ticketCount

  if (name.length < 2 || name.length > 100) {
    errors.fullName = 'Enter a name between 2 and 100 characters.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.mobile =
      'Enter a valid mobile number with 7 to 15 digits, including country code if needed.'
  }

  if (!Number.isInteger(attendeeCount) || attendeeCount < 1) {
    errors.ticketCount = 'Choose at least one attendee.'
  } else if (attendeeCount > availableSeats) {
    errors.ticketCount = `Only ${availableSeats} ${
      availableSeats === 1 ? 'seat is' : 'seats are'
    } available.`
  }

  if (values.specialRequests.trim().length > 500) {
    errors.specialRequests = 'Keep special requests to 500 characters or fewer.'
  }

  return errors
}
