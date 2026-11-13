export function createUpiPaymentIntent(booking) {
  const parameters = new URLSearchParams({
    pa: booking.upiId,
    pn: booking.upiPayeeName,
    am: Number(booking.paymentAmount).toFixed(2),
    cu: 'INR',
    tn: `Vibe Together Booking ${booking.reference || booking.requestId}`,
  })

  return `upi://pay?${parameters.toString()}`
}
