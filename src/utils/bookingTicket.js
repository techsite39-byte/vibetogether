function plainText(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ')
}

export function downloadBookingTicket(booking) {
  const contents = [
    'VIBE TOGETHER — BOOKING TICKET',
    `Booking reference: ${plainText(booking.reference)}`,
    `Event: ${plainText(booking.event.title)}`,
    `Date: ${plainText(booking.event.date)} · ${plainText(booking.event.time)}`,
    `Location: ${plainText(booking.event.location)}`,
    `Attendee: ${plainText(booking.attendee.fullName)}`,
    `Email: ${plainText(booking.attendee.email)}`,
    `Tickets: ${booking.ticketCount}`,
    `Payment status: ${plainText(booking.paymentStatus)}`,
    `Booking status: ${plainText(booking.status)}`,
    `Booked on: ${plainText(booking.createdAt)}`,
    '',
    'Development preview ticket. This device-stored mock booking is not a production reservation.',
  ].join('\n')
  const file = new Blob([contents], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = `vibe-together-${booking.reference}.txt`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
