export function createUpiPaymentIntent(booking) {
  const upiId = typeof booking?.upiId === 'string' ? booking.upiId.trim() : ''
  const payeeName =
    typeof booking?.upiPayeeName === 'string' ? booking.upiPayeeName.trim() : ''
  const amount = booking?.paymentAmount

  if (!upiId || !payeeName) {
    throw new Error('Verified UPI payee details are required.')
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('A valid booking amount is required for UPI payment.')
  }

  const parameters = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: 'Vibe Together Booking',
  })

  return `upi://pay?${parameters.toString()}`
}

function createAndroidUpiAppIntent(booking, packageName, fallbackUrl) {
  const fallback = new URL(fallbackUrl)
  if (!['http:', 'https:'].includes(fallback.protocol)) {
    throw new Error('UPI app fallback must use an HTTP or HTTPS URL.')
  }

  const upiIntent = new URL(createUpiPaymentIntent(booking))
  const parameters = upiIntent.searchParams.toString()

  return `intent://pay?${parameters}#Intent;scheme=upi;package=${packageName};S.browser_fallback_url=${encodeURIComponent(fallback.href)};end`
}

export function createPhonePePaymentIntent(booking, fallbackUrl) {
  return createAndroidUpiAppIntent(booking, 'com.phonepe.app', fallbackUrl)
}

export function createGooglePayPaymentIntent(booking, fallbackUrl) {
  return createAndroidUpiAppIntent(
    booking,
    'com.google.android.apps.nbu.paisa.user',
    fallbackUrl,
  )
}

export function createPaytmPaymentIntent(booking, fallbackUrl) {
  return createAndroidUpiAppIntent(booking, 'net.one97.paytm', fallbackUrl)
}
