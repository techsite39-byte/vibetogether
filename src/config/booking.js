const env = import.meta.env ?? {}
const feeValue = env.VITE_BOOKING_FEE_PER_TICKET?.trim() ?? ''
const configuredFee = feeValue === '' ? 0 : Number(feeValue)
const configuredApiUrl = env.VITE_BOOKING_API_URL?.trim() ?? ''
const providerValue = env.VITE_PAYMENT_PROVIDER?.trim().toLowerCase() ?? ''
const providerIsValid =
  providerValue === '' || /^[a-z][a-z0-9_-]{1,39}$/.test(providerValue)
const apiUrlIsValid = (() => {
  if (!configuredApiUrl) {
    return true
  }

  if (configuredApiUrl.startsWith('/') && !configuredApiUrl.startsWith('//')) {
    return true
  }

  try {
    const url = new URL(configuredApiUrl)
    const hasNoSensitiveUrlParts =
      !url.username && !url.password && !url.search && !url.hash

    return (
      hasNoSensitiveUrlParts &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)))
    )
  } catch {
    return false
  }
})()

export const bookingConfigErrors = [
  !Number.isFinite(configuredFee) || configuredFee < 0
    ? 'VITE_BOOKING_FEE_PER_TICKET must be a non-negative amount.'
    : '',
  !providerIsValid
    ? 'VITE_PAYMENT_PROVIDER must be a provider slug using letters, numbers, hyphens, or underscores.'
    : '',
  !apiUrlIsValid
    ? 'VITE_BOOKING_API_URL must use HTTPS, localhost HTTP, or a same-origin path without credentials or query parameters.'
    : '',
].filter(Boolean)

export const bookingConfig = {
  currency: 'INR',
  feePerPaidTicket: Number.isFinite(configuredFee) && configuredFee >= 0
    ? Math.round(configuredFee * 100) / 100
    : 0,
  paymentApiUrl: configuredApiUrl.replace(/\/+$/, ''),
  paymentProvider: providerIsValid && providerValue ? providerValue : 'razorpay',
}

export const isPaymentBackendConfigured =
  Boolean(bookingConfig.paymentApiUrl) && bookingConfigErrors.length === 0
