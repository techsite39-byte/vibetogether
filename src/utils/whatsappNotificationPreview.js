function categoryName(booking) {
  if (booking.category) return booking.category
  if (typeof booking.event === 'string') return booking.event
  return booking.event?.title || 'Not provided'
}

function formattedDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

export function getWhatsAppNotificationPreview(booking, type = 'success') {
  const name = booking.customer || booking.name || 'Customer'
  const mobile = booking.mobile || ''
  if (type === 'failure') {
    return [
      '✨ VIBE TOGETHER – PAYMENT ASSISTANCE ✨',
      '',
      `Hello ${name}! 👋`,
      '',
      'We noticed that your Vibe Together booking payment was not completed.',
      '',
      "Don't worry! You can try again.",
      '',
      '📋 YOUR BOOKING DETAILS',
      '',
      `Name: ${name}`,
      `Mobile: ${mobile}`,
      `Category: ${categoryName(booking)}`,
      '',
      `💳 Payment Amount: ₹${booking.amount ?? booking.paymentAmount ?? 299}`,
      `Payment Status: ${booking.paymentFailureReason === 'cancelled' ? 'Cancelled' : 'Failed'}`,
      '',
      'Your booking has not yet been confirmed.',
      'Please return to Vibe Together and retry your payment to complete your booking.',
      '',
      'Need assistance? Contact our team.',
      '',
      '🌐 https://www.vibetogether.show/',
      '',
      'VIBE TOGETHER',
      'Your next story starts here! 💜',
    ].join('\n')
  }

  const amount = booking.amount ?? booking.paymentAmount ?? 0
  const priceDetail = booking.diwaliOfferApplied
    ? `Regular Price: ₹${booking.regularPrice}\nDiwali Offer Price: ₹${booking.offerPrice}\nAmount Paid: ₹${amount}`
    : `Regular Price: ₹${booking.regularPrice ?? 299}\nAmount Paid: ₹${amount}`
  return [
    '✨ VIBE TOGETHER – BOOKING CONFIRMATION ✨',
    '',
    `Hello ${name}! 👋`,
    '',
    'Thank you for choosing Vibe Together! 💜',
    '',
    'Your payment has been successfully completed and your booking has been registered.',
    '',
    '🎟️ YOUR BOOKING REFERENCE:',
    booking.reference,
    '',
    '📋 BOOKING DETAILS',
    '',
    `Name: ${name}`,
    `Mobile: ${mobile}`,
    `Email: ${booking.customerEmail || booking.email || 'Not provided'}`,
    `Category: ${categoryName(booking)}`,
    `Gender: ${booking.gender || 'Not provided'}`,
    `Booking Date: ${formattedDate(booking.createdAt)}`,
    '',
    '💳 PAYMENT DETAILS',
    '',
    priceDetail,
    `Payment Status: ${booking.paymentStatus === 'demo_paid' ? 'Demo Paid' : 'Paid'}`,
    '',
    `📌 BOOKING STATUS: ${booking.status === 'confirmed' ? 'Approved' : 'Pending Approval'}`,
    '',
    'Thank you for being part of Vibe Together!',
    '',
    'Your next story starts here! ✨',
    '',
    '🌐 https://www.vibetogether.show/',
    '',
    'VIBE TOGETHER',
    'Connect. Celebrate. Experience. 💜',
  ].join('\n')
}
