const requestTimeoutMs = 12_000
const bookingTimezone = 'Asia/Kolkata'

function formatBookingTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return { date: '', time: '' }
  }
  const options = { timeZone: bookingTimezone }
  return {
    date: new Intl.DateTimeFormat('en-IN', {
      ...options,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('en-IN', {
      ...options,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date),
  }
}

export function normalizeWhatsAppNumber(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!trimmed.startsWith('+')) {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return ''
    }
    return `91${digits}`
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    return ''
  }
  if (digits.startsWith('91') && !/^91[6-9]\d{9}$/.test(digits)) {
    return ''
  }
  return digits
}

export function createBookingTemplateParameters(booking) {
  const { date, time } = formatBookingTimestamp(booking.createdAt)
  const category = booking.category || booking.event
  const paymentStatus = booking.paymentStatus === 'demo_paid'
    ? 'Demo Paid (no real money collected)'
    : 'Unpaid'
  return [
    booking.name,
    booking.reference,
    booking.mobile,
    category,
    booking.gender,
    date,
    time,
    paymentStatus,
    'Booking Received (not yet approved)',
  ].filter((value) => typeof value === 'string' && value.trim())
}

export function createWhatsAppService({
  phoneNumberId = '',
  businessAccountId = '',
  accessToken = '',
  apiVersion = '',
  appSecret = '',
  webhookVerifyToken = '',
  templateName = 'vibe_booking_confirmation_v1',
  templateLanguage = 'en',
  fetchImpl = globalThis.fetch,
} = {}) {
  const configured = Boolean(phoneNumberId && accessToken && apiVersion && fetchImpl)

  function getConfigurationStatus(settings = {}) {
    return {
      configured,
      webhookConfigured: Boolean(appSecret && webhookVerifyToken),
      phoneNumberConfigured: Boolean(phoneNumberId),
      businessAccountConfigured: Boolean(businessAccountId),
      templateName: settings.templateName || templateName,
      templateLanguage: settings.templateLanguage || templateLanguage,
    }
  }

  async function sendTemplate(recipientNumber, components, settings = {}) {
    const recipient = normalizeWhatsAppNumber(recipientNumber)
    const selectedTemplateName = settings.templateName || templateName
    const selectedTemplateLanguage = settings.templateLanguage || templateLanguage
    if (!recipient) {
      return { status: 'failed', retryable: false, reason: 'Test/customer phone number is not a valid international mobile number.' }
    }
    if (!configured) {
      return { status: 'failed', retryable: true, reason: 'WhatsApp Cloud API is not configured.' }
    }
    if (
      !/^[a-zA-Z0-9._-]{1,80}$/.test(selectedTemplateName) ||
      !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(selectedTemplateLanguage)
    ) {
      return { status: 'failed', retryable: true, reason: 'WhatsApp confirmation template settings are invalid.' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetchImpl(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'template',
            template: {
              name: selectedTemplateName,
              language: { code: selectedTemplateLanguage },
              components: [{ type: 'body', parameters: components.map((text) => ({ type: 'text', text })) }],
            },
          }),
          signal: controller.signal,
        },
      )
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        return {
          status: 'failed',
          retryable: response.status < 500,
          reason: response.status === 429
            ? 'WhatsApp rate limit reached. Retry after the service recovers.'
            : `WhatsApp Cloud API rejected the message (HTTP ${response.status}).`,
        }
      }
      const messageId = payload?.messages?.[0]?.id
      return typeof messageId === 'string' && messageId
        ? { status: 'sent', messageId }
        : { status: 'failed', retryable: false, reason: 'WhatsApp accepted no message ID for the request.' }
    } catch (error) {
      return {
        status: 'failed',
        retryable: false,
        reason: error?.name === 'AbortError'
          ? 'WhatsApp request timed out; delivery could not be confirmed.'
          : 'WhatsApp service could not be reached; delivery could not be confirmed.',
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  async function sendBookingConfirmation(booking, settings = {}) {
    if (settings.enabled === false) {
      return { status: 'skipped', reason: 'Automatic booking confirmations are disabled.' }
    }

    return sendTemplate(booking.mobile, createBookingTemplateParameters(booking), settings)
  }

  async function sendTestMessage(recipientNumber, settings = {}) {
    return sendTemplate(recipientNumber, [
      'Vibe Together test',
      'TEST',
      recipientNumber,
      'Configuration check',
      'Not applicable',
      'Not applicable',
      'Not applicable',
      'Not applicable',
      'Test message (not a booking)',
    ], settings)
  }

  return {
    sendBookingConfirmation,
    sendTestMessage,
    getConfigurationStatus,
    get webhookVerifyToken() {
      return webhookVerifyToken
    },
    get appSecret() {
      return appSecret
    },
  }
}
