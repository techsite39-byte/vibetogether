import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const bookingJsxPath = path.resolve('src/pages/Booking.jsx')
const bookingCssPath = path.resolve('src/pages/Booking.css')
const paymentJsxPath = path.resolve('src/pages/BookingPayment.jsx')
const paymentCssPath = path.resolve('src/pages/BookingPayment.css')
const adminJsxPath = path.resolve('src/admin/pages/ManageBookings.jsx')
const adminCssPath = path.resolve('src/admin/components/Admin.css')

const bookingJsx = fs.readFileSync(bookingJsxPath, 'utf8')
const bookingCss = fs.readFileSync(bookingCssPath, 'utf8')
const paymentJsx = fs.readFileSync(paymentJsxPath, 'utf8')
const paymentCss = fs.readFileSync(paymentCssPath, 'utf8')
const adminJsx = fs.readFileSync(adminJsxPath, 'utf8')
const adminCss = fs.readFileSync(adminCssPath, 'utf8')

// =============================================================================
// 1. BOOKING PAGE TESTS
// =============================================================================
test('1. Booking Page header and hero match Reference Image 1', () => {
  // Brand logo at top left
  assert.ok(bookingJsx.includes('booking-page__brand'), 'Brand container present')
  assert.ok(bookingJsx.includes('favicon-256-v1.webp'), 'Logo icon present')
  assert.ok(bookingJsx.includes('VibeTogether'), 'Brand text present')

  // Top right tagline
  assert.ok(bookingJsx.includes('Music <i /> Events <i /> Together'), 'Tagline present')

  // Centered Hero
  assert.ok(bookingJsx.includes('BOOK YOUR SPOT'), 'Eyebrow heading present')
  assert.ok(bookingJsx.includes("What&apos;s your name?") || bookingJsx.includes("What's your name?"), 'Main heading present')
  assert.ok(bookingJsx.includes("Let&apos;s get you registered") || bookingJsx.includes("Let's get you registered"), 'Subtitle present')
})

test('2. Booking Page Your Details contains ONLY Full Name and +91 Mobile', () => {
  assert.ok(bookingJsx.includes('id="booking-full-name"'), 'Full name field present')
  assert.ok(bookingJsx.includes('id="booking-mobile"'), 'Mobile field present')
  assert.ok(bookingJsx.includes('+91'), 'India +91 country code present')

  // Must NOT contain visible Email Address or Special Requests fields
  assert.ok(!bookingJsx.includes('id="booking-email"'), 'Email field removed from visible form')
  assert.ok(!bookingJsx.includes('id="booking-special-requests"'), 'Special requests removed from visible form')

  // Strictly NO WhatsApp references
  assert.ok(!bookingJsx.toLowerCase().includes('whatsapp'), 'No WhatsApp references in booking page')
})

test('3. Booking Page event selection, ticket quantity, and price summary', () => {
  assert.ok(bookingJsx.includes('booking-form__event-card'), 'Event selection cards present')
  assert.ok(bookingJsx.includes('usePublicEvents()'), 'Loads real backend events')
  assert.ok(bookingJsx.includes('Minus') && bookingJsx.includes('Plus'), 'Quantity minus and plus buttons present')
  assert.ok(bookingJsx.includes('Price Summary'), 'Price summary section present')
  assert.ok(bookingJsx.includes('Total Booking Amount'), 'Total booking amount displayed')
  assert.ok(bookingJsx.includes('Confirm Booking'), 'Confirm booking button present')
  assert.ok(bookingJsx.includes('submitBookingEnquiry'), 'Submits booking enquiry for paid booking')
  assert.ok(bookingJsx.includes('/booking/payment/'), 'Navigates to customer payment page')
})

// =============================================================================
// 2. PAYMENT PAGE TESTS
// =============================================================================
test('4. Payment Page header and hero match Reference Image 2', () => {
  assert.ok(paymentJsx.includes('booking-payment__brand-link'), 'Brand link present')
  assert.ok(paymentJsx.includes('favicon-256-v1.webp'), 'Logo icon present')
  assert.ok(paymentJsx.includes('Music <i /> Events <i /> Together'), 'Tagline present')
  assert.ok(paymentJsx.includes('Secure &amp; Encrypted Payment'), 'Secure & Encrypted badge present')
  assert.ok(paymentJsx.includes('Complete Your Payment'), 'Hero heading present')
  assert.ok(paymentJsx.includes('Choose a payment method to confirm your tickets'), 'Hero subtitle present')

  // Old 5-step modal progress bar must be removed
  assert.ok(!paymentJsx.includes('BookingProgress'), 'Legacy BookingProgress removed')
  assert.ok(!paymentJsx.includes('5 / 5'), 'Legacy 5 / 5 counter removed')
})

test('5. Payment Page Left Column contains complete Booking Summary', () => {
  assert.ok(paymentJsx.includes('booking-payment__summary-card'), 'Summary column present')
  assert.ok(paymentJsx.includes('BOOKING SUMMARY'), 'Booking summary label present')
  assert.ok(paymentJsx.includes('booking-payment__event-poster'), 'Event image container present')
  assert.ok(paymentJsx.includes('matchedEvent?.category'), 'Event category present')
  assert.ok(paymentJsx.includes('displayEventName'), 'Event name present')
  assert.ok(paymentJsx.includes('matchedEvent?.description'), 'Event description present')
  assert.ok(paymentJsx.includes('formattedEventDate'), 'Event date present')
  assert.ok(paymentJsx.includes('matchedEventTime'), 'Event time present')
  assert.ok(paymentJsx.includes('Number of tickets'), 'Ticket count label present')
  assert.ok(paymentJsx.includes('Price per ticket'), 'Price per ticket label present')
  assert.ok(paymentJsx.includes('Total amount'), 'Total amount label present')
  assert.ok(paymentJsx.includes('FINAL PAYABLE AMOUNT'), 'Final payable label present')
  assert.ok(paymentJsx.includes('₹{finalPayable}'), 'Final payable amount displayed')
})

test('6. Payment Page Right Column contains the 5 requested Payment Methods', () => {
  assert.ok(paymentJsx.includes('PAYMENT METHOD'), 'Payment method header present')
  assert.ok(paymentJsx.includes('Choose Payment Option'), 'Choose payment title present')

  // The 5 methods
  assert.ok(paymentJsx.includes('UPI Payment'), 'Method 1: UPI Payment present')
  assert.ok(paymentJsx.includes('Credit / Debit Card'), 'Method 2: Credit / Debit Card present')
  assert.ok(paymentJsx.includes('Net Banking'), 'Method 3: Net Banking present')
  assert.ok(paymentJsx.includes('Wallets'), 'Method 4: Wallets present')
  assert.ok(paymentJsx.includes('Other UPI Apps'), 'Method 5: Other UPI Apps present')

  // Radio indicators and styling
  assert.ok(paymentJsx.includes('booking-payment__radio-indicator'), 'Radio indicators present')
  assert.ok(paymentJsx.includes('booking-payment__radio-dot'), 'Radio dot present')
})

test('7. Payment Page Footer and Cashfree Safety preservation', () => {
  // Security footer
  assert.ok(paymentJsx.includes('Your payment is 100% secure and encrypted'), 'Security footer text present')

  // Cashfree custom elements mounts preserved
  assert.ok(paymentJsx.includes('vibetogether-cf-upi-qr'), 'UPI QR mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-card-number'), 'Card number mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-card-expiry'), 'Card expiry mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-card-cvv'), 'Card CVV mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-card-holder'), 'Cardholder mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-phonepe'), 'PhonePe mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-gpay'), 'Google Pay mount preserved')
  assert.ok(paymentJsx.includes('vibetogether-cf-paytm'), 'Paytm mount preserved')

  // Payment processing hooks and verification preserved
  assert.ok(paymentJsx.includes('createCashfreeOrder'), 'createCashfreeOrder preserved')
  assert.ok(paymentJsx.includes('verifyCashfreePayment'), 'verifyCashfreePayment preserved')
  assert.ok(paymentJsx.includes('checkCashfreePaymentStatus'), 'checkCashfreePaymentStatus preserved')
  assert.ok(paymentJsx.includes('handleExecuteCustomPayment'), 'Payment execution handler preserved')
})

// =============================================================================
// 3. ADMIN BOOKINGS PAGE TESTS
// =============================================================================
test('8. Admin Bookings details dialog organized into 4 clear categories', () => {
  assert.ok(adminJsx.includes('Customer Details'), 'Category 1: Customer Details present')
  assert.ok(adminJsx.includes('Event Details'), 'Category 2: Event Details present')
  assert.ok(adminJsx.includes('Ticket Details'), 'Category 3: Ticket Details present')
  assert.ok(adminJsx.includes('Payment Details'), 'Category 4: Payment Details present')

  // Checks required fields inside the categories
  assert.ok(adminJsx.includes('Customer name'), 'Customer name field present')
  assert.ok(adminJsx.includes('Mobile number'), 'Mobile number field present')
  assert.ok(adminJsx.includes('Booking reference'), 'Booking reference field present')
  assert.ok(adminJsx.includes('Event name'), 'Event name field present')
  assert.ok(adminJsx.includes('Event date'), 'Event date field present')
  assert.ok(adminJsx.includes('Event time'), 'Event time field present')
  assert.ok(adminJsx.includes('Event category'), 'Event category field present')
  assert.ok(adminJsx.includes('Number of tickets'), 'Number of tickets field present')
  assert.ok(adminJsx.includes('Price per ticket'), 'Price per ticket field present')
  assert.ok(adminJsx.includes('Total booking amount'), 'Total booking amount field present')
  assert.ok(adminJsx.includes('Payment method'), 'Payment method field present')
  assert.ok(adminJsx.includes('Payment status'), 'Payment status field present')
  assert.ok(adminJsx.includes('Payment reference / transaction ID'), 'Payment reference field present')
  assert.ok(adminJsx.includes('Final payable amount'), 'Final payable amount field present')
})

test('9. Admin Bookings table and CSV export match the 4 categories with NO WhatsApp', () => {
  // Table headers
  assert.ok(adminJsx.includes('<th scope="col">Customer Details</th>'), 'Customer Details table column')
  assert.ok(adminJsx.includes('<th scope="col">Event Details</th>'), 'Event Details table column')
  assert.ok(adminJsx.includes('<th scope="col">Ticket Details</th>'), 'Ticket Details table column')
  assert.ok(adminJsx.includes('<th scope="col">Payment Details</th>'), 'Payment Details table column')

  // Strictly NO WhatsApp UI in ManageBookings
  assert.ok(!adminJsx.toLowerCase().includes('whatsapp'), 'Zero WhatsApp in ManageBookings')

  // Admin capabilities preserved
  assert.ok(adminJsx.includes('exportCsv'), 'CSV export preserved')
  assert.ok(adminJsx.includes('decideUpiPayment'), 'UPI verification preserved')
  assert.ok(adminJsx.includes('cancel(booking)'), 'Booking cancellation preserved')
  assert.ok(adminJsx.includes('removeBooking(booking)'), 'Booking deletion preserved')
})

test('10. CSS styling supports the purple neon dark theme and responsive layout', () => {
  // Booking Page CSS
  assert.ok(bookingCss.includes('.booking-page__topbar'), 'Booking topbar styled')
  assert.ok(bookingCss.includes('.booking-form__phone-wrap'), 'Booking phone input styled')
  assert.ok(bookingCss.includes('.booking-form__country-code'), 'India country code styled')
  assert.ok(bookingCss.includes('.booking-form__event-card'), 'Event card styled')

  // Payment Page CSS
  assert.ok(paymentCss.includes('.booking-payment__topbar'), 'Payment topbar styled')
  assert.ok(paymentCss.includes('.booking-payment__layout'), 'Two-column layout styled')
  assert.ok(paymentCss.includes('.booking-payment__method-card'), 'Method card styled')
  assert.ok(paymentCss.includes('.booking-payment__radio-indicator'), 'Radio indicator styled')
  assert.ok(paymentCss.includes('.booking-payment__trust-footer'), 'Trust footer styled')

  // Admin CSS
  assert.ok(adminCss.includes('.admin-booking-details'), 'Admin details styled')
  assert.ok(adminCss.includes('.admin-booking-section'), 'Admin 4-category section styled')
})

test('11. All Book Now entry points navigate directly to the new Booking page (/booking)', () => {
  const navbarJsx = fs.readFileSync(path.resolve('src/components/layout/Navbar.jsx'), 'utf8')
  const eventCardJsx = fs.readFileSync(path.resolve('src/components/events/EventCard.jsx'), 'utf8')
  const categoryCardJsx = fs.readFileSync(path.resolve('src/components/events/CategoryCard.jsx'), 'utf8')
  const contextJsx = fs.readFileSync(path.resolve('src/context/BookingEnquiryContext.jsx'), 'utf8')

  // Navbar Book Now button links to /booking
  assert.ok(navbarJsx.includes('to="/booking"'), 'Navbar Book Now links directly to /booking')

  // EventCard Book Now button links to /booking/:eventId
  assert.ok(eventCardJsx.includes('/booking/'), 'EventCard Book Now links to /booking/:eventId')

  // CategoryCard Book Now button links to /booking?category=
  assert.ok(categoryCardJsx.includes('/booking'), 'CategoryCard Book Now links to /booking')

  // Context redirects stale bookingJourneyStep URLs to /booking and does NOT mount BookingJourney modal
  assert.ok(!contextJsx.includes('<BookingJourney'), 'Legacy BookingJourney modal is completely removed')
  assert.ok(contextJsx.includes('navigate(destination, { replace: true })'), 'Redirects stale journeyStepQuery to /booking')
})
