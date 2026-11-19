const realPaidStatuses = new Set(['paid', 'SUCCESS', 'verified'])

export function normalizeBookingPaymentStatus(status) {
  if (status === 'SUCCESS' || status === 'verified') return 'paid'
  if (status === 'FAILED') return 'failed'
  return status
}

export function isRealPaidBookingStatus(status) {
  return realPaidStatuses.has(status) || normalizeBookingPaymentStatus(status) === 'paid'
}

export function isCompletedBookingPaymentStatus(status) {
  const normalizedStatus = normalizeBookingPaymentStatus(status)
  return normalizedStatus === 'paid' || normalizedStatus === 'demo_paid'
}
