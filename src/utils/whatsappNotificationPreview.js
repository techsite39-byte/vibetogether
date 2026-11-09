function categoryName(booking) {
  if (booking.category) return booking.category
  if (typeof booking.event === 'string') return booking.event
  return booking.event?.title || 'Not provided'
}

function formattedDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

function formattedTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

export function getWhatsAppNotificationPreview(booking, type = 'success') {
  const customerName = booking.customer || booking.name || 'Friend'
  const bookingCategory = categoryName(booking)
  const createdAt = booking.createdAt || new Date()
  const bookingDate = formattedDate(createdAt)
  const bookingTime = formattedTime(createdAt)
  const actualAmount = `₹${booking.amount ?? booking.paymentAmount ?? 249}`
  const applicableAmount = `₹${booking.paymentAmount ?? booking.amount ?? (booking.diwaliOfferApplied ? 249 : 299)}`
  const bookingStatus = booking.status === 'confirmed' ? 'Approved' : 'Pending Approval'
  const paymentStatus = booking.paymentFailureReason === 'cancelled' ? 'CANCELLED' : 'FAILED'

  if (type === 'failure') {
    return [
      '✨ VIBE TOGETHER – PAYMENT UPDATE ✨',
      '',
      `Hello ${customerName}!`,
      '',
      'Your payment was not completed.',
      '',
      `Amount: ${applicableAmount}`,
      `Category: ${bookingCategory}`,
      `Payment Status: ${paymentStatus}`,
      '',
      'Your booking is not confirmed yet.',
      '',
      'Please return to Vibe Together and retry your payment.',
      '',
      'Need help? Contact our team.',
      '',
      'https://www.vibetogether.show',
      '',
      'VIBE TOGETHER 💜',
    ].join('\n')
  }

  return [
    '✨ VIBE TOGETHER – PAYMENT SUCCESSFUL! ✨',
    '',
    `Hello ${customerName}! 💜`,
    '',
    'Your payment has been successfully received.',
    '',
    `🎟️ Booking Reference: ${booking.reference || '—'}`,
    '',
    `Category: ${bookingCategory}`,
    `Booking Date: ${bookingDate}`,
    `Booking Time: ${bookingTime}`,
    `Amount Paid: ${actualAmount}`,
    'Payment Status: PAID',
    `Booking Status: ${bookingStatus}`,
    '',
    'Thank you for choosing Vibe Together!',
    '',
    'Your next story starts here. ✨',
    '',
    'https://www.vibetogether.show',
    '',
    'VIBE TOGETHER',
    'Connect. Celebrate. Experience.',
  ].join('\n')
}
