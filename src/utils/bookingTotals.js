import { bookingConfig } from '../config/booking.js'

export function calculateBookingTotals(event, ticketCount) {
  const safeCount = Number.isInteger(ticketCount) && ticketCount > 0
    ? ticketCount
    : 0
  const subtotal = event.isFree ? 0 : event.priceAmount * safeCount
  const fees = event.isFree
    ? 0
    : bookingConfig.feePerPaidTicket * safeCount

  return {
    subtotal,
    fees,
    total: subtotal + fees,
    currency: event.currency || bookingConfig.currency,
  }
}

export function formatBookingAmount(amount, currency = bookingConfig.currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}
