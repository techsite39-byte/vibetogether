const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(value) {
  return emailPattern.test(value.trim())
}

export function isValidMobile(value) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

export function validateContactForm(form) {
  const errors = {}
  const fullName = form.fullName.trim()
  const subject = form.subject.trim()
  const message = form.message.trim()

  if (fullName.length < 2 || fullName.length > 80) {
    errors.fullName = 'Enter a name between 2 and 80 characters.'
  }

  if (!isValidEmail(form.email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (!isValidMobile(form.mobile)) {
    errors.mobile = 'Enter a valid phone number with 7 to 15 digits.'
  }

  if (!subject || subject.length > 120) {
    errors.subject = 'Enter a subject of up to 120 characters.'
  }

  if (!['general', 'booking', 'partnership', 'technical'].includes(form.enquiryType)) {
    errors.enquiryType = 'Choose an enquiry type.'
  }

  if (message.length < 10 || message.length > 2000) {
    errors.message = 'Write between 10 and 2,000 characters.'
  }

  return errors
}

export function validateHostEventForm(form) {
  const errors = {}
  const organizerName = form.organizerName.trim()
  const eventName = form.eventName.trim()
  const description = form.description.trim()
  const attendeeCount = Number(form.expectedAttendees)

  if (organizerName.length < 2 || organizerName.length > 80) {
    errors.organizerName = 'Enter an organizer name between 2 and 80 characters.'
  }

  if (!isValidEmail(form.email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (!isValidMobile(form.phone)) {
    errors.phone = 'Enter a valid phone number with 7 to 15 digits.'
  }

  if (eventName.length < 3 || eventName.length > 120) {
    errors.eventName = 'Enter an event name between 3 and 120 characters.'
  }

  if (
    !['sing-along', 'strangers-meet', 'strangers-trip', 'fun-games'].includes(
      form.categoryId,
    )
  ) {
    errors.categoryId = 'Choose an event category.'
  }

  if (!Number.isInteger(attendeeCount) || attendeeCount < 1 || attendeeCount > 10000) {
    errors.expectedAttendees = 'Enter an attendee estimate between 1 and 10,000.'
  }

  if (!form.proposedDate || Number.isNaN(Date.parse(form.proposedDate))) {
    errors.proposedDate = 'Choose a valid proposed event date.'
  } else {
    const proposedDate = new Date(`${form.proposedDate}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (proposedDate < today) {
      errors.proposedDate = 'Choose today or a future date.'
    }
  }

  if (description.length < 20 || description.length > 3000) {
    errors.description = 'Write between 20 and 3,000 characters.'
  }

  return errors
}
