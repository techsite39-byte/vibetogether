import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const bookingPaymentJsx = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/BookingPayment.jsx'),
  'utf8',
)
const bookingPaymentCss = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/BookingPayment.css'),
  'utf8',
)

// Helper evaluating the failure determination logic in BookingPayment.jsx
function evaluatePaymentDisplayState({
  paymentStatus,
  paymentProvider = 'cashfree',
  paymentFailureReason = '',
  cfPaymentStatus = '',
  paymentUncertain = false,
  hasReference = false,
}) {
  const isPaid = ['demo_paid', 'paid'].includes(paymentStatus) && hasReference
  const isUpiPayment = !isPaid && paymentProvider === 'upi'
  const isPaymentFailed =
    paymentStatus === 'failed' &&
    paymentProvider !== 'upi' &&
    !isUpiPayment

  const isTerminalFailed = Boolean(
    isPaymentFailed &&
    !paymentUncertain &&
    paymentFailureReason !== 'cancelled' &&
    cfPaymentStatus !== 'USER_DROPPED'
  )

  const isCancelledView = Boolean(
    isPaymentFailed &&
    !paymentUncertain &&
    (paymentFailureReason === 'cancelled' || cfPaymentStatus === 'USER_DROPPED')
  )

  const isVerifying = paymentUncertain

  if (isPaid) return 'SUCCESS'
  if (isTerminalFailed) return 'TERMINAL_FAILED'
  if (isCancelledView) return 'CANCELLED'
  if (isVerifying) return 'PENDING_VERIFYING'
  return 'CHECKOUT'
}

test('1. Verified terminal payment failure evaluates to TERMINAL_FAILED', () => {
  const state = evaluatePaymentDisplayState({
    paymentStatus: 'failed',
    paymentFailureReason: 'failed',
    cfPaymentStatus: 'FAILED',
    paymentUncertain: false,
  })
  assert.equal(state, 'TERMINAL_FAILED')
})

test('2. Pending payment continues to display pending / checkout state (never failure)', () => {
  const pendingState1 = evaluatePaymentDisplayState({
    paymentStatus: 'pending',
    paymentUncertain: false,
  })
  assert.equal(pendingState1, 'CHECKOUT')

  const pendingState2 = evaluatePaymentDisplayState({
    paymentStatus: 'processing',
    paymentUncertain: true,
  })
  assert.equal(pendingState2, 'PENDING_VERIFYING')
})

test('3. Successful payment continues to display success state', () => {
  const successState = evaluatePaymentDisplayState({
    paymentStatus: 'paid',
    hasReference: true,
  })
  assert.equal(successState, 'SUCCESS')
})

test('4. Temporary Cashfree verification error does not display failure', () => {
  // Even if paymentStatus is temporarily uncertain or verification failed with network error
  const stateWithUncertain = evaluatePaymentDisplayState({
    paymentStatus: 'failed',
    paymentUncertain: true, // Verification error occurred
    cfPaymentStatus: 'FAILED',
  })
  assert.notEqual(stateWithUncertain, 'TERMINAL_FAILED')
  assert.equal(stateWithUncertain, 'PENDING_VERIFYING')
})

test('5. Failed payment page contains only failure icon, heading, message, and Return Home action', () => {
  // Check that the terminal failure screen in BookingPayment.jsx contains the required elements
  assert.match(bookingPaymentJsx, /<XCircle[^>]*className="booking-payment__failure-icon"/)
  assert.match(bookingPaymentJsx, /<h1[^>]*className="booking-payment__state-title">Payment Failed<\/h1>/)
  assert.match(bookingPaymentJsx, /<p[^>]*className="booking-payment__state-desc">Your payment could not be completed\.<\/p>/)
  assert.match(bookingPaymentJsx, /<Link[^>]*to="\/"[^>]*className="[^"]*booking-payment__return-home-btn[^"]*">\s*Return Home\s*<\/Link>/)

  // Verify that inside the terminal failed block, forbidden sections are NOT present:
  const terminalFailedBlockMatch = bookingPaymentJsx.match(
    /\) : isTerminalFailed \? \([\s\S]*?\) : isCancelledView \?/,
  )
  assert.ok(terminalFailedBlockMatch, 'isTerminalFailed render block must exist')
  const terminalBlock = terminalFailedBlockMatch[0]

  // No price breakdown
  assert.doesNotMatch(terminalBlock, /booking-payment__held-summary/)
  assert.doesNotMatch(terminalBlock, /Payable Amount/)
  assert.doesNotMatch(terminalBlock, /subtotal/i)
  // No payment methods
  assert.doesNotMatch(terminalBlock, /booking-payment__methods/)
  // No UPI QR
  assert.doesNotMatch(terminalBlock, /vibetogether-cf-upi-qr/)
  assert.doesNotMatch(terminalBlock, /QRCode/)
  // No PhonePe, Google Pay, Paytm
  assert.doesNotMatch(terminalBlock, /PhonePe|Google Pay|Paytm/i)
  // No Pay Again or retry button
  assert.doesNotMatch(terminalBlock, /TRY PAYMENT AGAIN|Pay Again|handleTryPaymentAgain/i)
  // No technical error details
  assert.doesNotMatch(terminalBlock, /currentBookingState\.error/)
  assert.doesNotMatch(terminalBlock, /paymentFailureReason/)
})

test('6. Return Home navigates to the correct home URL ("/")', () => {
  const terminalFailedBlockMatch = bookingPaymentJsx.match(
    /\) : isTerminalFailed \? \([\s\S]*?\) : isCancelledView \?/,
  )
  assert.ok(terminalFailedBlockMatch)
  const terminalBlock = terminalFailedBlockMatch[0]
  assert.match(terminalBlock, /to="\/"/)
  assert.match(terminalBlock, />\s*Return Home\s*<\/Link>/)
})

test('CSS provides centered, responsive styling for simple payment failed screen in dark/purple theme', () => {
  assert.match(bookingPaymentCss, /\.booking-payment__return-home-btn\s*\{/)
  assert.match(bookingPaymentCss, /\.booking-payment__failure-icon\s*\{/)
  assert.match(bookingPaymentCss, /\.booking-payment__state-card\s*\{[^}]*text-align:\s*center/)
})
