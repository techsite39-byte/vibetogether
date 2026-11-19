import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import {
  isCompletedBookingPaymentStatus,
  isRealPaidBookingStatus,
} from '../../../src/utils/paymentStatus.js'

const retryableHttpStatuses = new Set([429, 500, 502, 503, 504])
const diagnosticOutcomes = new Set([
  'SKIPPED',
  'ATTEMPTED',
  'ACCEPTED',
  'REJECTED',
  'DELIVERED',
  'READ',
  'DELIVERY_FAILED',
])
const diagnosticSources = new Set([
  'application',
  'booking_status_lookup',
  'demo_payment',
  'cashfree_verification',
  'cashfree_status_check',
  'cashfree_failure_record',
  'demo_payment_failure',
  'cashfree_webhook',
  'admin_manual_retry',
  'automatic_retry',
  'whatsapp_status_webhook',
  'notification_persistence',
])
const diagnosticNotificationTypes = new Set([
  'booking_confirmation',
  'payment_assistance',
  'admin_alert',
  'unknown',
])
const diagnosticStages = new Set(['caller_result', 'delivery_status'])
const diagnosticDeliveryStatuses = new Set(['sent', 'delivered', 'read', 'failed'])
const diagnosticReasons = new Set([
  'Customer consent missing',
  'Customer opted out',
  'Invalid mobile number',
  'Invalid attendee mobile number',
  'Attendee mobile number missing',
  'Attendee consent missing',
  'Invalid admin mobile number',
  'Admin WhatsApp number not configured',
  'WhatsApp configuration missing',
  'Payment still pending',
  'Payment already completed',
  'Payment success not confirmed',
  'Demo payment; no real payment was processed.',
  'Previous provider response uncertain; automatic retry withheld',
  'Duplicate notification',
  'Duplicate notification; already delivered',
  'Duplicate notification; previous attempt was skipped',
  'Duplicate notification; retry is not due',
  'Duplicate notification; attendee already sent',
  'Duplicate notification; admin alert already sent',
  'Notification already in progress',
  'Duplicate recipient matches primary customer',
  'Duplicate recipient number',
  'Attendee not found',
  'Booking not found',
  'Customer cancelled payment',
  'Failure was not confirmed',
  'Cashfree did not confirm a terminal payment failure',
  'Cashfree event is not notification eligible',
  'Payment status is not notification eligible',
  'Payment failure was not recorded',
  'Notification service threw',
  'Notification service returned accepted',
  'Notification service returned failed',
  'Notification skipped',
  'Notification service returned no send result',
  'Provider response uncertain',
  'Meta rejected notification',
  'Meta accepted; delivery not yet confirmed',
  'Text window rejected; attempting approved template fallback',
  'Attendee notification state persistence failed',
  'Attendee notification processing failed',
  'Admin notification processing failed',
  'WhatsApp delivery failed',
  'WhatsApp delivered status confirmed',
  'WhatsApp read status confirmed',
  'Status callback did not match a stored notification',
  'WhatsApp webhook processing failed',
  'Duplicate Cashfree webhook',
  'Notification outcome recorded',
])

export function normalizeWhatsAppRecipient(value, defaultCountry = 'IN') {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry)
  if (parsed?.isValid()) {
    return parsed.number
  }
  if (!trimmed.startsWith('+')) {
    const withPlus = parsePhoneNumberFromString(`+${trimmed}`, defaultCountry)
    if (withPlus?.isValid()) {
      return withPlus.number
    }
  }
  return ''
}

function allowlistedValue(value, allowedValues, fallback) {
  return typeof value === 'string' && allowedValues.has(value) ? value : fallback
}

function isSafeTemplateName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_]{1,128}$/.test(value)
}

function isSafeLanguage(value) {
  return value === 'not_applicable' || (
    typeof value === 'string' && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(value)
  )
}

export function createWhatsAppCorrelationId(identity) {
  return createHash('sha256').update(String(identity ?? '')).digest('hex').slice(0, 16)
}

export function logWhatsAppNotification(outcome, context = {}) {
  const identity = context.identity ?? `${context.source ?? 'application'}:${context.notificationType ?? 'unknown'}`
  const details = {
    event: 'whatsapp_notification',
    outcome: allowlistedValue(outcome, diagnosticOutcomes, 'REJECTED'),
    source: allowlistedValue(context.source, diagnosticSources, 'application'),
    notificationType: allowlistedValue(context.notificationType, diagnosticNotificationTypes, 'unknown'),
    correlationId: createWhatsAppCorrelationId(identity),
  }

  if (diagnosticStages.has(context.stage)) details.stage = context.stage
  if (context.reason !== undefined) {
    details.reason = allowlistedValue(context.reason, diagnosticReasons, 'Notification outcome recorded')
  }
  if (isSafeTemplateName(context.template)) details.template = context.template
  if (isSafeLanguage(context.language)) details.language = context.language
  if (typeof context.messageId === 'string' && /^wamid\.[A-Za-z0-9._-]{1,256}$/.test(context.messageId)) {
    details.messageId = context.messageId
  }
  if (typeof context.deliveryTimestamp === 'string') {
    const deliveryDate = new Date(context.deliveryTimestamp)
    if (Number.isFinite(deliveryDate.getTime())) {
      details.deliveryTimestamp = deliveryDate.toISOString()
    }
  }
  if (diagnosticDeliveryStatuses.has(context.deliveryStatus)) details.deliveryStatus = context.deliveryStatus
  if (Number.isInteger(context.httpStatus) && context.httpStatus >= 100 && context.httpStatus <= 599) {
    details.httpStatus = context.httpStatus
  }
  if (Number.isSafeInteger(context.metaErrorCode)) details.metaErrorCode = context.metaErrorCode
  if (Number.isSafeInteger(context.metaErrorSubcode)) details.metaErrorSubcode = context.metaErrorSubcode
  if (typeof context.retryable === 'boolean') details.retryable = context.retryable

  const log = ['REJECTED', 'DELIVERY_FAILED'].includes(outcome) ? console.error : console.info
  log.call(console, '[WhatsApp Notification]', details)
  return details.correlationId
}

export function logWhatsAppNotificationResult(result, context = {}) {
  const outcome = result?.sent
    ? 'ACCEPTED'
    : result?.failed
      ? 'REJECTED'
      : 'SKIPPED'
  const reason = result?.sent
    ? 'Notification service returned accepted'
    : result?.failed
      ? 'Notification service returned failed'
      : result?.pending
        ? 'Payment still pending'
        : result?.duplicate
          ? 'Duplicate notification'
          : result?.skipped
            ? 'Notification skipped'
            : 'Notification service returned no send result'

  return logWhatsAppNotification(outcome, {
    ...context,
    stage: 'caller_result',
    reason: context.reason ?? reason,
  })
}

export function formatBookingDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

function formattedDateOnly(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

function formattedTimeOnly(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

function categoryName(booking) {
  return booking.category || booking.event || 'Vibe Together Experience'
}

function historyEntry(status, source, note = '', eventKey = randomUUID(), at = new Date()) {
  return { status, source, note, eventKey, at }
}

function statusRank(status) {
  return ({ pending: 0, sent: 1, delivered: 2, read: 3 })[status] ?? -1
}

function safeFailureReason(status, responseBody, secrets = []) {
  const apiCode = responseBody?.error?.code
  const apiMessage = typeof responseBody?.error?.message === 'string'
    ? secrets.reduce(
        (message, secret) => secret ? message.replaceAll(secret, '[redacted]') : message,
        responseBody.error.message,
      ).replace(/[\r\n]+/g, ' ').slice(0, 180)
    : ''
  return `WhatsApp Cloud API returned HTTP ${status}${Number.isInteger(apiCode) ? ` (code ${apiCode})` : ''}${apiMessage ? `: ${apiMessage}` : '.'}`
}

export function buildWhatsAppMessage(
  booking,
  kind = 'success',
  attendee = null,
  templateName = '',
  frontendUrl = 'https://www.vibetogether.show',
) {
  const customerName = attendee?.name || booking.name || booking.customer || 'Friend'
  const bookingCategory = categoryName(booking)
  const createdAt = booking.createdAt || new Date()
  const bookingDate = formattedDateOnly(createdAt)
  const bookingTime = formattedTimeOnly(createdAt)
  const actualAmount = `₹${booking.paymentAmount ?? booking.amount ?? 249}`
  const applicableAmount = `₹${booking.paymentAmount ?? booking.amount ?? (booking.diwaliOfferApplied ? 249 : 299)}`
  const bookingStatus = booking.status === 'confirmed' ? 'Approved' : 'Pending Approval'
  const paymentStatus = booking.paymentFailureReason === 'cancelled' ? 'CANCELLED' : 'FAILED'
  const reference = booking.reference || booking.requestId || '—'
  const ticketType = booking.ticketTypeName || booking.ticketType || 'General Admission'
  const quantity = attendee ? '1' : String(booking.ticketQuantity ?? 1)
  const yourTicket = attendee ? `${attendee.name} (${ticketType})` : ticketType
  const retryUrl = booking.paymentRetryUrl || (booking.requestId ? `${frontendUrl}/booking/payment/${booking.requestId}` : `${frontendUrl}/booking`)

  if (templateName === 'vibetogether_payment_success') {
    return [
      '🎶 VIBE TOGETHER – MADURAI MUSICAL EVENING 🎶',
      '',
      `Hello ${customerName},`,
      '',
      '🎉 Great news! Your payment was successful and your booking is confirmed!',
      '',
      '🎤 EVENT DETAILS',
      '',
      '📅 Date: 22 November 2026 (Sunday)',
      '📍 Venue: Royal Party Hall, KK Nagar, Madurai',
      '',
      `🎟️ Booking ID: ${reference}`,
      `🎫 Number of Tickets: ${quantity}`,
      `💰 Amount Paid: ₹${booking.paymentAmount ?? booking.amount ?? 299}`,
      '',
      `🎟️ Your ticket: ${yourTicket}`,
      '',
      'Thank you for choosing VibeTogether!',
      '',
      'We look forward to seeing you at the event. ❤️',
      '',
      '📞 For assistance: +91 87785 95810',
    ].join('\n')
  }

  if (templateName === 'vibetogether_payment_failed') {
    return [
      '🎶 VIBE TOGETHER – MADURAI MUSICAL EVENING 🎶',
      '',
      `Hello ${customerName},`,
      '',
      'We’re sorry! Unfortunately, your payment for the event booking was unsuccessful.',
      '',
      '🎤 EVENT DETAILS',
      '',
      '📅 Date: 22 November 2026 (Sunday)',
      '📍 Venue: Royal Party Hall, KK Nagar, Madurai',
      '',
      `🎟️ Booking ID: ${reference}`,
      `💰 Payment Amount: ₹${booking.paymentAmount ?? booking.amount ?? 299}`,
      '',
      'You can try making the payment again using the link below:',
      '',
      `🔗 Retry Payment: ${retryUrl}`,
      '',
      'If the amount was deducted from your bank account, please contact us before making another payment.',
      '',
      'We sincerely apologise for the inconvenience.',
      '',
      '📞 Need help? Contact us: +91 87785 95810',
      '',
      '❤️ Team VibeTogether',
    ].join('\n')
  }

  if (kind === 'failure') {
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
    ...(attendee ? [`Ticket Assigned To: ${attendee.name}`] : []),
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

export function buildAdminAlertMessage(booking) {
  const maleCount = booking.maleCount ?? 0
  const femaleCount = booking.femaleCount ?? 0
  const attendeeLines = []
  for (let i = 0; i < maleCount; i++) {
    const name = booking.maleMemberNames?.[i]?.trim()
    const mobile = booking.maleMemberMobiles?.[i]?.trim()
    if (name) attendeeLines.push(`• Male: ${name}${mobile ? ` (${mobile})` : ''}`)
  }
  for (let i = 0; i < femaleCount; i++) {
    const name = booking.femaleMemberNames?.[i]?.trim()
    const mobile = booking.femaleMemberMobiles?.[i]?.trim()
    if (name) attendeeLines.push(`• Female: ${name}${mobile ? ` (${mobile})` : ''}`)
  }

  return [
    '🔔 VIBETOGETHER — NEW BOOKING CONFIRMED',
    '',
    `Customer: ${booking.name}`,
    `Mobile: ${booking.mobile}`,
    `Reference: ${booking.reference || '—'}`,
    `Event/Category: ${categoryName(booking)}`,
    `Ticket Type: ${booking.ticketTypeName || booking.ticketType || 'General Admission'}`,
    `Quantity: ${booking.ticketQuantity ?? 1}`,
    ...(attendeeLines.length > 0 ? ['', 'Attendees:', ...attendeeLines] : []),
    '',
    `Amount Paid: ₹${booking.paymentAmount ?? booking.amount ?? 299}`,
    `Payment Gateway: ${booking.paymentProvider === 'cashfree' ? 'Cashfree Payments' : booking.paymentProvider || 'Online'}`,
    'Payment Status: PAID',
    `Session: ${formatBookingDate(booking.createdAt)}`,
  ].join('\n')
}

export function templateBodyParameters(
  booking,
  kind,
  templateName = '',
  attendee = null,
  frontendUrl = 'https://www.vibetogether.show',
  options = {},
) {
  const amountNumeric = String(booking.paymentAmount ?? booking.amount ?? 299)
  const amountWithSymbol = `₹${amountNumeric}`
  const customerName = attendee?.name || booking.name || 'Friend'
  const reference = booking.reference || booking.requestId || '—'
  const eventName = categoryName(booking)
  const ticketType = booking.ticketTypeName || booking.ticketType || 'General Admission'
  const sessionDateTime = formatBookingDate(booking.createdAt)

  // 1. vibetogether_payment_success (5 parameters)
  if (
    templateName === 'vibetogether_payment_success' ||
    templateName.includes('payment_success')
  ) {
    const quantity = attendee ? '1' : String(booking.ticketQuantity ?? 1)
    const ticketUrl = booking.reference
      ? `${frontendUrl}/booking/confirmation/${booking.reference}`
      : `${frontendUrl}/booking`
    const useUrl = options?.ticketParamFormat === 'url' || process.env.WHATSAPP_SUCCESS_TICKET_PARAM === 'url'
    const yourTicket = useUrl
      ? ticketUrl
      : (attendee ? `${attendee.name} (${ticketType})` : ticketType)
    return [
      customerName,   // {{1}} Hello {{1}},
      reference,      // {{2}} Booking ID: {{2}}
      quantity,       // {{3}} Number of Tickets: {{3}}
      amountNumeric,  // {{4}} Amount Paid: ₹{{4}}
      yourTicket,     // {{5}} Your ticket: {{5}} (Ticket Type or Ticket URL)
    ]
  }

  // 2. vibetogether_payment_failed (4 parameters)
  if (
    templateName === 'vibetogether_payment_failed' ||
    templateName.includes('payment_failed')
  ) {
    const retryUrl =
      booking.paymentRetryUrl ||
      (booking.requestId
        ? `${frontendUrl}/booking/payment/${booking.requestId}`
        : `${frontendUrl}/booking`)
    return [
      customerName,   // {{1}} Hello {{1}},
      reference,      // {{2}} Booking ID: {{2}}
      amountNumeric,  // {{3}} Payment Amount: ₹{{3}}
      retryUrl,       // {{4}} Retry Payment: {{4}}
    ]
  }

  // 3. failure assistance
  if (kind === 'payment_assistance' || templateName.includes('payment_assistance')) {
    return [
      customerName,
      attendee?.mobile || booking.mobile,
      eventName,
      amountWithSymbol,
      booking.paymentFailureReason === 'cancelled' ? 'Cancelled' : 'Failed',
    ]
  }

  // 4. vibetogether_booking_confirmation (official 8 parameters)
  if (templateName === 'vibetogether_booking_confirmation' || (!templateName.includes('vibe_booking_confirmation') && templateName !== 'vibe_booking_confirmation')) {
    const quantity = attendee ? `1 Ticket (of ${booking.ticketQuantity ?? 1})` : String(booking.ticketQuantity ?? 1)
    return [
      customerName,        // {{1}} Customer / Attendee Name
      reference,           // {{2}} Booking Reference
      eventName,           // {{3}} Event / Category
      ticketType,          // {{4}} Ticket Type
      quantity,            // {{5}} Quantity
      amountWithSymbol,    // {{6}} Amount Paid
      'PAID',              // {{7}} Payment Status
      sessionDateTime,     // {{8}} Session Date & Time
    ]
  }

  // 5. vibe_booking_confirmation (legacy 11 parameters)
  if (kind === 'success' || kind === 'booking_confirmation') {
    const priceLines = booking.diwaliOfferApplied
      ? `Regular Price: ₹${booking.regularPrice}\nDiwali Offer Price: ₹${booking.offerPrice}\nAmount Paid: ${amountWithSymbol}`
      : `Regular Price: ₹${booking.regularPrice}\nAmount Paid: ${amountWithSymbol}`
    return [
      customerName,
      reference,
      customerName,
      attendee?.mobile || booking.mobile,
      booking.email || 'Not provided',
      eventName,
      attendee?.gender || booking.gender,
      sessionDateTime,
      priceLines,
      'Paid',
      booking.status === 'confirmed' ? 'Approved' : 'Pending Approval',
    ]
  }

  return [customerName, reference, eventName, ticketType, '1', amountWithSymbol, 'PAID', sessionDateTime]
}

export function isValidWhatsAppWebhookSignature(rawBody, signature, appSecret) {
  if (!rawBody || !signature || !appSecret) return false
  const trimmedSignature = String(signature).trim().toLowerCase()
  const expectedSignature = `sha256=${createHmac('sha256', appSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex')}`
  const signatureBuffer = Buffer.from(trimmedSignature, 'utf8')
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
  if (signatureBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(signatureBuffer, expectedBuffer)
}

const processedWebhookEvents = new Map()
const EVENT_TTL_MS = 24 * 60 * 60 * 1000

function isDuplicateWebhookEvent(eventKey) {
  if (!eventKey) return false
  const nowMs = Date.now()
  if (processedWebhookEvents.size > 10000) {
    for (const [key, ts] of processedWebhookEvents.entries()) {
      if (nowMs - ts > EVENT_TTL_MS) {
        processedWebhookEvents.delete(key)
      }
    }
  }
  if (processedWebhookEvents.has(eventKey)) {
    return true
  }
  processedWebhookEvents.set(eventKey, nowMs)
  return false
}

export function createWhatsAppService({
  bookingEnquiryModel = BookingEnquiry,
  phoneNumberId = '',
  accessToken = '',
  businessAccountId: _businessAccountId = '',
  apiVersion = '',
  bookingTemplate = '',
  bookingTemplateLanguage = 'en',
  adminPhoneNumber = '',
  notificationsEnabled = true,
  successTemplateName = '',
  failureTemplateName = '',
  webhookVerifyToken = '',
  appSecret = '',
  successTicketParam = (process.env.WHATSAPP_SUCCESS_TICKET_PARAM?.trim() || 'type').toLowerCase(),
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const effectiveApiVersion = apiVersion || 'v22.0'
  const activeTemplateName = successTemplateName || bookingTemplate || 'vibetogether_payment_success'
  const activeFailureTemplateName = failureTemplateName || 'vibetogether_payment_failed'
  if (bookingTemplateLanguage !== 'en') {
    throw new Error('WhatsApp payment templates must use the approved en language.')
  }
  if (
    activeTemplateName !== 'vibetogether_payment_success' ||
    activeFailureTemplateName !== 'vibetogether_payment_failed'
  ) {
    throw new Error('WhatsApp payment templates must use the approved VibeTogether template names.')
  }

  const missingNotificationConfiguration = [
    ['WHATSAPP_PHONE_NUMBER_ID', phoneNumberId],
    ['WHATSAPP_ACCESS_TOKEN', accessToken],
    ['WHATSAPP_API_VERSION', apiVersion],
    ['WHATSAPP_SUCCESS_TEMPLATE_NAME', successTemplateName || bookingTemplate],
    ['WHATSAPP_FAILURE_TEMPLATE_NAME', failureTemplateName],
  ].filter(([, value]) => !value).map(([name]) => name)

  const missingWebhookConfiguration = [
    ['WHATSAPP_WEBHOOK_VERIFY_TOKEN', webhookVerifyToken],
    ['WHATSAPP_APP_SECRET', appSecret],
  ].filter(([, value]) => !value).map(([name]) => name)

  const configured = Boolean(
    notificationsEnabled &&
    phoneNumberId &&
    accessToken &&
    /^v\d+\.\d+$/.test(effectiveApiVersion) &&
    activeTemplateName &&
    typeof fetchImpl === 'function',
  )

  async function getDiagnostics() {
    const diagnostics = {
      notificationConfigured: configured,
      notificationsEnabled,
      missingNotificationConfiguration,
      webhookConfigured: missingWebhookConfiguration.length === 0,
      missingWebhookConfiguration,
      apiAccess: 'not_checked',
      apiError: '',
      adminNotificationConfigured: Boolean(adminPhoneNumber && normalizeWhatsAppRecipient(adminPhoneNumber)),
    }
    if (!configured) return diagnostics

    try {
      const response = await fetchImpl(
        `https://graph.facebook.com/${effectiveApiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        },
      )
      const body = await response.json().catch(() => ({}))
      diagnostics.apiAccess = response.ok && body.id === phoneNumberId ? 'accepted' : 'rejected'
      if (diagnostics.apiAccess === 'rejected') {
        const code = body.error?.code
        diagnostics.apiError = `Meta Graph API returned HTTP ${response.status}${Number.isInteger(code) ? ` (code ${code})` : ''}.`
      }
    } catch {
      diagnostics.apiAccess = 'unavailable'
      diagnostics.apiError = 'Meta Graph API could not be reached.'
    }
    return diagnostics
  }

  async function getBooking(requestId, model = bookingEnquiryModel) {
    return model.findOne({ requestId }).lean()
  }

  async function getUniqueBookingForRetry(requestId, model) {
    const matches = await model.find({ requestId }).limit(2).lean()
    if (matches.length > 1) {
      throw Object.assign(
        new Error('Booking request ID matches multiple enquiries.'),
        { status: 409 },
      )
    }
    return matches[0] ?? null
  }

  function bookingFilter(booking, filter = {}) {
    return {
      ...(booking?._id != null ? { _id: booking._id } : {}),
      requestId: booking.requestId,
      ...filter,
    }
  }

  function logSkipped(booking, type, source, reason, identity = '') {
    logWhatsAppNotification('SKIPPED', {
      source,
      notificationType: type,
      identity: identity || `${booking?.requestId ?? 'unknown'}:${type}:${reason}`,
      reason,
    })
  }

  async function postWhatsAppGraph(payload, context = {}) {
    logWhatsAppNotification('ATTEMPTED', context)
    const response = await fetchImpl(
      `https://graph.facebook.com/${effectiveApiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, body }
  }

  async function setSkipped(booking, idempotencyKey, reason, model = bookingEnquiryModel) {
    const at = now()
    return model.findOneAndUpdate(
      bookingFilter(booking, { whatsappConsent: { $ne: true } }),
      {
        $set: {
          'whatsappNotification.messageType': idempotencyKey.includes('payment_assistance')
            ? 'payment_assistance'
            : 'booking_confirmation',
          'whatsappNotification.idempotencyKey': idempotencyKey,
          'whatsappNotification.status': 'skipped',
          'whatsappNotification.inProgress': false,
          'whatsappNotification.failureReason': '',
          'whatsappNotification.retryable': false,
          'whatsappNotification.nextRetryAt': null,
        },
        $push: {
          'whatsappNotification.history': historyEntry('skipped', 'system', reason, idempotencyKey, at),
        },
      },
      { new: true, runValidators: true },
    ).lean()
  }

  async function setUnavailable(booking, type, idempotencyKey, reason, retryable = false, model = bookingEnquiryModel) {
    const at = now()
    return model.findOneAndUpdate(
      bookingFilter(booking, { whatsappConsent: true }),
      {
        $set: {
          'whatsappNotification.messageType': type === 'payment_assistance'
            ? 'payment_assistance'
            : 'booking_confirmation',
          'whatsappNotification.idempotencyKey': idempotencyKey,
          'whatsappNotification.recipient': normalizeWhatsAppRecipient(booking.mobile),
          'whatsappNotification.status': 'failed',
          'whatsappNotification.inProgress': false,
          'whatsappNotification.failureReason': reason,
          'whatsappNotification.retryable': retryable,
          'whatsappNotification.nextRetryAt': retryable ? at : null,
          'whatsappNotification.lastAttemptAt': at,
        },
        $push: {
          'whatsappNotification.history': historyEntry('failed', 'system', reason, idempotencyKey, at),
        },
      },
      { new: true, runValidators: true },
    ).lean()
  }

  // Build eligible attendees list from booking
  function getEligibleAttendees(booking) {
    const maleCount = booking.maleCount ?? 0
    const femaleCount = booking.femaleCount ?? 0
    const attendees = []

    for (let i = 0; i < maleCount; i++) {
      const name = (booking.maleMemberNames?.[i] || '').trim()
      const rawMobile = (booking.maleMemberMobiles?.[i] || '').trim()
      const consent = Array.isArray(booking.maleMemberConsents) && typeof booking.maleMemberConsents[i] === 'boolean'
        ? booking.maleMemberConsents[i]
        : false
      const mobile = normalizeWhatsAppRecipient(rawMobile)
      attendees.push({
        index: i,
        gender: 'Male',
        name: name || `Male Member ${i + 1}`,
        rawMobile,
        mobile,
        whatsappConsent: consent,
      })
    }
    for (let i = 0; i < femaleCount; i++) {
      const name = (booking.femaleMemberNames?.[i] || '').trim()
      const rawMobile = (booking.femaleMemberMobiles?.[i] || '').trim()
      const consent = Array.isArray(booking.femaleMemberConsents) && typeof booking.femaleMemberConsents[i] === 'boolean'
        ? booking.femaleMemberConsents[i]
        : false
      const mobile = normalizeWhatsAppRecipient(rawMobile)
      attendees.push({
        index: i,
        gender: 'Female',
        name: name || `Female Member ${i + 1}`,
        rawMobile,
        mobile,
        whatsappConsent: consent,
      })
    }
    return attendees
  }

  // Send to primary customer
  async function sendPrimaryConfirmation(booking, {
    retry = false,
    force = false,
    targetType = null,
    source = 'application',
    bookingModel = bookingEnquiryModel,
  } = {}) {
    const requestId = booking.requestId
    const effectiveType = targetType || (isCompletedBookingPaymentStatus(booking.paymentStatus) ? 'booking_confirmation' : 'payment_assistance')
    const isSuccess = effectiveType === 'booking_confirmation'
    const type = effectiveType
    if (!isSuccess) {
      if (isRealPaidBookingStatus(booking.paymentStatus) && Boolean(booking.reference)) {
        logSkipped(booking, type, source, 'Payment already completed')
        return { booking, duplicate: true, alreadyPaid: true }
      }
      if (booking.paymentStatus !== 'failed') {
        logSkipped(booking, type, source, 'Payment still pending')
        return { booking, pending: true }
      }
    }

    if (isSuccess && booking.paymentStatus === 'demo_paid') {
      const skipped = await bookingModel.findOneAndUpdate(
        bookingFilter(booking, { paymentStatus: 'demo_paid', whatsappConsent: true }),
        {
          $set: {
            'whatsappNotification.status': 'skipped',
            'whatsappNotification.inProgress': false,
            'whatsappNotification.failureReason': 'No real payment was processed in demo mode.',
          },
          $push: {
            'whatsappNotification.history': historyEntry(
              'skipped',
              'system',
              'No real payment was processed in demo mode.',
              `${requestId}:demo-payment:skipped`,
              now(),
            ),
          },
        },
        { new: true, runValidators: true },
      ).lean()
      logSkipped(booking, type, source, 'Demo payment; no real payment was processed.')
      return { booking: skipped ?? booking, skipped: true }
    }

    if (isSuccess && !(isRealPaidBookingStatus(booking.paymentStatus) && booking.reference)) {
      if (booking.paymentStatus === 'pending' || !booking.paymentStatus) {
        logSkipped(booking, type, source, 'Payment still pending')
        return { booking, pending: true }
      }
      logSkipped(booking, type, source, 'Payment success not confirmed')
      return { booking, skipped: true }
    }

    const idempotencyKey = isSuccess
      ? `${requestId}:booking_confirmation:${booking.reference}:primary`
      : `${requestId}:payment_assistance:${booking.paymentOrderId || booking.paymentAttemptedAt?.toISOString() || 'attempt'}`

    if (!booking.whatsappConsent) {
      const skipped = await setSkipped(
        booking,
        idempotencyKey,
        'Skipped – no WhatsApp notification consent.',
        bookingModel,
      )
      logSkipped(
        booking,
        type,
        source,
        booking.whatsappOptedOutAt ? 'Customer opted out' : 'Customer consent missing',
        idempotencyKey,
      )
      return { booking: skipped ?? booking, skipped: true }
    }

    const previousNotification = booking.whatsappNotification ?? {}
    if (
      previousNotification.status === 'failed' &&
      previousNotification.failureReason?.includes('response was uncertain')
    ) {
      logSkipped(booking, type, source, 'Previous provider response uncertain; automatic retry withheld', idempotencyKey)
      return { booking, duplicate: true, uncertain: true }
    }

    const recipient = normalizeWhatsAppRecipient(booking.mobile)
    if (!recipient) {
      const invalid = await setUnavailable(
        booking,
        type,
        idempotencyKey,
        'The saved mobile number is not a valid WhatsApp recipient.',
        false,
        bookingModel,
      )
      logSkipped(booking, type, source, 'Invalid mobile number', idempotencyKey)
      return { booking: invalid ?? booking, failed: true }
    }

    if (!configured) {
      const unavailable = await setUnavailable(
        booking,
        type,
        idempotencyKey,
        'WhatsApp Cloud API or approved templates are not configured.',
        true,
        bookingModel,
      )
      logSkipped(booking, type, source, 'WhatsApp configuration missing', idempotencyKey)
      return { booking: unavailable ?? booking, failed: true }
    }

    if (previousNotification.idempotencyKey === idempotencyKey) {
      if (['delivered', 'read'].includes(previousNotification.status)) {
        logSkipped(booking, type, source, 'Duplicate notification; already delivered', idempotencyKey)
        return { booking, duplicate: true, alreadyDelivered: true }
      }
      if (previousNotification.inProgress) {
        logSkipped(booking, type, source, 'Notification already in progress', idempotencyKey)
        return { booking, duplicate: true }
      }
      if (previousNotification.status === 'sent') {
        logSkipped(booking, type, source, 'Duplicate notification', idempotencyKey)
        return { booking, duplicate: true }
      }
      if (
        force &&
        previousNotification.status === 'failed' &&
        previousNotification.failureReason?.includes('response was uncertain')
      ) {
        logSkipped(booking, type, source, 'Previous provider response uncertain; automatic retry withheld', idempotencyKey)
        return { booking, duplicate: true, uncertain: true }
      }
      if (!force) {
        if (previousNotification.status === 'skipped') {
          logSkipped(booking, type, source, 'Duplicate notification; previous attempt was skipped', idempotencyKey)
          return { booking, duplicate: true }
        }
        if (!retry || !previousNotification.retryable || new Date(previousNotification.nextRetryAt) > now()) {
          logSkipped(booking, type, source, 'Duplicate notification; retry is not due', idempotencyKey)
          return { booking, duplicate: true }
        }
      }
    }

    const at = now()
    const claimFilter = bookingFilter(booking, {
      whatsappConsent: true,
      'whatsappNotification.inProgress': { $ne: true },
      ...(force
        ? {
            $or: [
              { 'whatsappNotification.idempotencyKey': { $ne: idempotencyKey } },
              { 'whatsappNotification.status': { $nin: ['sent', 'delivered', 'read'] } },
            ],
          }
        : {
            ...(previousNotification.idempotencyKey === idempotencyKey
              ? {
                  'whatsappNotification.idempotencyKey': idempotencyKey,
                  'whatsappNotification.status': 'failed',
                  'whatsappNotification.retryable': true,
                  'whatsappNotification.nextRetryAt': { $lte: at },
                }
              : { 'whatsappNotification.idempotencyKey': { $ne: idempotencyKey } }),
          }),
    })

    const claimed = await bookingModel.findOneAndUpdate(
      claimFilter,
      {
        $set: {
          'whatsappNotification.messageType': type,
          'whatsappNotification.idempotencyKey': idempotencyKey,
          'whatsappNotification.bookingReference': booking.reference ?? '',
          'whatsappNotification.recipient': recipient,
          'whatsappNotification.status': 'pending',
          'whatsappNotification.inProgress': true,
          'whatsappNotification.failureReason': '',
          'whatsappNotification.retryable': false,
          'whatsappNotification.nextRetryAt': null,
          'whatsappNotification.sentAt': null,
          'whatsappNotification.lastAttemptAt': at,
        },
        $inc: { 'whatsappNotification.attemptCount': 1 },
        $push: {
          'whatsappNotification.history': historyEntry('pending', 'system', 'Cloud API request started.', `${idempotencyKey}:pending:${at.getTime()}`, at),
        },
      },
      { new: true, runValidators: true },
    ).lean()

    if (!claimed) {
      logSkipped(booking, type, source, 'Notification already in progress', idempotencyKey)
      return {
        booking: await bookingModel.findOne(bookingFilter(booking)).lean(),
        duplicate: true,
      }
    }

    const templateName = isSuccess ? activeTemplateName : activeFailureTemplateName
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: bookingTemplateLanguage },
        components: [{
          type: 'body',
          parameters: templateBodyParameters(
            booking,
            isSuccess ? 'success' : 'failure',
            templateName,
            null,
            undefined,
            { ticketParamFormat: successTicketParam },
          ).map((text) => ({ type: 'text', text: String(text) })),
        }],
      },
      biz_opaque_callback_data: idempotencyKey,
    }

    let graphResult
    try {
      graphResult = await postWhatsAppGraph(payload, {
        source,
        notificationType: type,
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
      })
    } catch {
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: type,
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
        reason: 'Provider response uncertain',
        retryable: false,
      })
      const reason = 'WhatsApp provider response was uncertain; automatic retry was withheld to prevent duplicate messages.'
      const failed = await bookingModel.findOneAndUpdate(
        bookingFilter(booking, { 'whatsappNotification.idempotencyKey': idempotencyKey }),
        {
          $set: {
            'whatsappNotification.status': 'failed',
            'whatsappNotification.inProgress': false,
            'whatsappNotification.failureReason': reason,
            'whatsappNotification.retryable': false,
          },
          $push: {
            'whatsappNotification.history': historyEntry('failed', 'system', reason, `${idempotencyKey}:uncertain`, now()),
          },
        },
        { new: true, runValidators: true },
      ).lean()
      return { booking: failed ?? claimed, failed: true }
    }

    const { ok, status, body } = graphResult
    if (!ok || typeof body.messages?.[0]?.id !== 'string') {
      const retryable = retryableHttpStatuses.has(status)
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: type,
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
        httpStatus: status,
        metaErrorCode: body?.error?.code,
        metaErrorSubcode: body?.error?.error_subcode,
        reason: 'Meta rejected notification',
        retryable,
      })
      const attempts = claimed.whatsappNotification?.attemptCount ?? 1
      const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5))
      const reason = safeFailureReason(status, body, [accessToken])
      const failed = await bookingModel.findOneAndUpdate(
        bookingFilter(booking, { 'whatsappNotification.idempotencyKey': idempotencyKey }),
        {
          $set: {
            'whatsappNotification.status': 'failed',
            'whatsappNotification.inProgress': false,
            'whatsappNotification.failureReason': reason,
            'whatsappNotification.retryable': retryable,
            'whatsappNotification.nextRetryAt': retryable
              ? new Date(now().getTime() + delayMinutes * 60_000)
              : null,
          },
          $push: {
            'whatsappNotification.history': historyEntry('failed', 'system', reason, `${idempotencyKey}:http:${status}:${attempts}`, now()),
          },
        },
        { new: true, runValidators: true },
      ).lean()
      return { booking: failed ?? claimed, failed: true }
    }

    const messageId = body.messages[0].id
    logWhatsAppNotification('ACCEPTED', {
      source,
      notificationType: type,
      identity: idempotencyKey,
      template: templateName,
      language: bookingTemplateLanguage,
      httpStatus: status,
      messageId,
      reason: 'Meta accepted; delivery not yet confirmed',
    })
    const sentAt = now()
    const sent = await bookingModel.findOneAndUpdate(
      bookingFilter(booking, { 'whatsappNotification.idempotencyKey': idempotencyKey }),
      {
        $set: {
          'whatsappNotification.status': 'sent',
          'whatsappNotification.providerMessageId': messageId,
          'whatsappNotification.inProgress': false,
          'whatsappNotification.failureReason': '',
          'whatsappNotification.retryable': false,
          'whatsappNotification.nextRetryAt': null,
          'whatsappNotification.sentAt': sentAt,
        },
        $push: {
          'whatsappNotification.history': historyEntry('sent', 'system', 'Accepted by WhatsApp Cloud API; delivery is not yet confirmed.', `${idempotencyKey}:sent`, sentAt),
        },
      },
      { new: true, runValidators: true },
    ).lean()

    return { booking: sent ?? claimed, sent: true }
  }

  // Send confirmation to an individual attendee
  async function sendAttendeeConfirmation(
    booking,
    attendee,
    { force = false, source = 'application', bookingModel = bookingEnquiryModel } = {},
  ) {
    const requestId = booking.requestId
    const idempotencyKey = `${requestId}:booking_confirmation:${booking.reference}:attendee:${attendee.gender}:${attendee.index}:${attendee.mobile}`
    const identity = idempotencyKey || `${requestId}:booking_confirmation:attendee:${attendee.index}`

    if (!configured) {
      logSkipped(booking, 'booking_confirmation', source, 'WhatsApp configuration missing', identity)
      return { skipped: true, reason: 'unconfigured' }
    }
    if (!attendee.mobile) {
      logSkipped(booking, 'booking_confirmation', source, attendee.rawMobile ? 'Invalid mobile number' : 'Attendee mobile number missing', identity)
      return { skipped: true, reason: attendee.rawMobile ? 'invalid_mobile_number' : 'no_mobile' }
    }
    if (attendee.whatsappConsent === false) {
      logSkipped(booking, 'booking_confirmation', source, 'Attendee consent missing', identity)
      return { skipped: true, reason: 'no_consent' }
    }

    // Check if already delivered/sent
    const existingIndex = booking.attendeeNotifications?.findIndex(
      (an) => an.attendeeIndex === attendee.index && an.recipient === attendee.mobile,
    )
    const existing = existingIndex !== -1 ? booking.attendeeNotifications?.[existingIndex] : null

    if (!force && existing && ['sent', 'delivered', 'read'].includes(existing.status)) {
      logSkipped(booking, 'booking_confirmation', source, 'Duplicate notification; attendee already sent', idempotencyKey)
      return { skipped: true, duplicate: true, alreadyDelivered: true }
    }

    const templateName = activeTemplateName
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: attendee.mobile.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: bookingTemplateLanguage },
        components: [{
          type: 'body',
          parameters: templateBodyParameters(
            booking,
            'success',
            templateName,
            attendee,
            undefined,
            { ticketParamFormat: successTicketParam },
          ).map((text) => ({ type: 'text', text: String(text) })),
        }],
      },
      biz_opaque_callback_data: idempotencyKey,
    }

    let graphResult
    try {
      graphResult = await postWhatsAppGraph(payload, {
        source,
        notificationType: 'booking_confirmation',
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
      })
    } catch {
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: 'booking_confirmation',
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
        reason: 'Provider response uncertain',
        retryable: false,
      })
      const record = {
        attendeeIndex: attendee.index,
        name: attendee.name,
        recipient: attendee.mobile,
        gender: attendee.gender,
        status: 'failed',
        providerMessageId: '',
        failureReason: 'WhatsApp provider network timeout.',
        sentAt: null,
        idempotencyKey,
      }
      await updateAttendeeNotificationRecord(booking, record, bookingModel)
      return { failed: true, error: 'Network error' }
    }

    const { ok, status, body } = graphResult
    const messageId = typeof body.messages?.[0]?.id === 'string' ? body.messages[0].id : ''
    const notificationStatus = ok && messageId ? 'sent' : 'failed'
    const failureReason = notificationStatus === 'failed' ? safeFailureReason(status, body, [accessToken]) : ''

    if (notificationStatus === 'sent') {
      logWhatsAppNotification('ACCEPTED', {
        source,
        notificationType: 'booking_confirmation',
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
        httpStatus: status,
        messageId,
        reason: 'Meta accepted; delivery not yet confirmed',
      })
    } else {
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: 'booking_confirmation',
        identity: idempotencyKey,
        template: templateName,
        language: bookingTemplateLanguage,
        httpStatus: status,
        metaErrorCode: body?.error?.code,
        metaErrorSubcode: body?.error?.error_subcode,
        reason: 'Meta rejected notification',
        retryable: retryableHttpStatuses.has(status),
      })
    }

    const record = {
      attendeeIndex: attendee.index,
      name: attendee.name,
      recipient: attendee.mobile,
      gender: attendee.gender,
      status: notificationStatus,
      providerMessageId: messageId,
      failureReason,
      sentAt: notificationStatus === 'sent' ? now() : null,
      idempotencyKey,
    }

    await updateAttendeeNotificationRecord(booking, record, bookingModel)
    return { sent: notificationStatus === 'sent', failed: notificationStatus === 'failed', messageId }
  }

  async function updateAttendeeNotificationRecord(booking, record, bookingModel) {
    try {
      // Remove any prior notification for this exact attendee index and push new record
      await bookingModel.findOneAndUpdate(
        bookingFilter(booking),
        {
          $pull: {
            attendeeNotifications: {
              attendeeIndex: record.attendeeIndex,
              recipient: record.recipient,
            },
          },
        },
      )
      await bookingModel.findOneAndUpdate(
        bookingFilter(booking),
        {
          $push: { attendeeNotifications: record },
        },
        { new: true, runValidators: true },
      )
    } catch {
      logWhatsAppNotification('REJECTED', {
        source: record.idempotencyKey ? 'notification_persistence' : 'application',
        notificationType: 'booking_confirmation',
        identity: record.idempotencyKey || requestId,
        reason: 'Attendee notification state persistence failed',
      })
    }
  }

  // Send admin alert
  async function sendAdminAlert(
    booking,
    { force = false, source = 'application', bookingModel = bookingEnquiryModel } = {},
  ) {
    if (!configured || !adminPhoneNumber) {
      logSkipped(booking, 'admin_alert', source, 'WhatsApp configuration missing')
      return { skipped: true, reason: 'unconfigured' }
    }
    const adminRecipient = normalizeWhatsAppRecipient(adminPhoneNumber)
    if (!adminRecipient) {
      logSkipped(booking, 'admin_alert', source, 'Invalid admin mobile number')
      return { skipped: true, reason: 'invalid_admin_phone' }
    }

    const requestId = booking.requestId
    const idempotencyKey = `${requestId}:booking_confirmation:${booking.reference}:admin:${adminRecipient}`

    const previous = booking.adminNotification
    if (!force && previous && ['sent', 'delivered'].includes(previous.status)) {
      logSkipped(booking, 'admin_alert', source, 'Duplicate notification; admin alert already sent', idempotencyKey)
      return { skipped: true, duplicate: true }
    }

    const alertText = buildAdminAlertMessage(booking)
    // Send as text if supported or template
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: adminRecipient.replace(/^\+/, ''),
      type: 'text',
      text: {
        preview_url: false,
        body: alertText,
      },
      biz_opaque_callback_data: idempotencyKey,
    }

    let graphResult
    let activeAdminTemplate = 'text'
    try {
      graphResult = await postWhatsAppGraph(payload, {
        source,
        notificationType: 'admin_alert',
        identity: idempotencyKey,
        template: 'text',
        language: 'not_applicable',
      })
      // If Meta rejects standard text with 131047 (outside 24h window), fallback to utility template
      if (!graphResult.ok && graphResult.body?.error?.code === 131047) {
        logWhatsAppNotification('REJECTED', {
          source,
          notificationType: 'admin_alert',
          identity: idempotencyKey,
          template: 'text',
          language: 'not_applicable',
          httpStatus: graphResult.status,
          metaErrorCode: graphResult.body?.error?.code,
          metaErrorSubcode: graphResult.body?.error?.error_subcode,
          reason: 'Text window rejected; attempting approved template fallback',
          retryable: false,
        })
        const fallbackPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: adminRecipient.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: activeTemplateName,
            language: { code: bookingTemplateLanguage },
            components: [{
              type: 'body',
              parameters: templateBodyParameters(booking, 'success', activeTemplateName)
                .map((text) => ({ type: 'text', text: String(text) })),
            }],
          },
          biz_opaque_callback_data: idempotencyKey,
        }
        activeAdminTemplate = activeTemplateName
        graphResult = await postWhatsAppGraph(fallbackPayload, {
          source,
          notificationType: 'admin_alert',
          identity: idempotencyKey,
          template: activeTemplateName,
          language: bookingTemplateLanguage,
        })
      }
    } catch {
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: 'admin_alert',
        identity: idempotencyKey,
        template: activeAdminTemplate,
        language: activeAdminTemplate === 'text' ? 'not_applicable' : bookingTemplateLanguage,
        reason: 'Provider response uncertain',
        retryable: false,
      })
      await bookingModel.findOneAndUpdate(
        bookingFilter(booking),
        {
          $set: {
            'adminNotification.recipient': adminRecipient,
            'adminNotification.status': 'failed',
            'adminNotification.failureReason': 'Network error contacting WhatsApp API.',
            'adminNotification.idempotencyKey': idempotencyKey,
          },
        },
      ).catch(() => {})
      return { failed: true }
    }

    const { ok, status, body } = graphResult
    const messageId = typeof body.messages?.[0]?.id === 'string' ? body.messages[0].id : ''
    const notificationStatus = ok && messageId ? 'sent' : 'failed'
    const failureReason = notificationStatus === 'failed' ? safeFailureReason(status, body, [accessToken]) : ''

    if (notificationStatus === 'sent') {
      logWhatsAppNotification('ACCEPTED', {
        source,
        notificationType: 'admin_alert',
        identity: idempotencyKey,
        template: activeAdminTemplate,
        language: activeAdminTemplate === 'text' ? 'not_applicable' : bookingTemplateLanguage,
        httpStatus: status,
        messageId,
        reason: 'Meta accepted; delivery not yet confirmed',
      })
    } else {
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: 'admin_alert',
        identity: idempotencyKey,
        template: activeAdminTemplate,
        language: activeAdminTemplate === 'text' ? 'not_applicable' : bookingTemplateLanguage,
        httpStatus: status,
        metaErrorCode: body?.error?.code,
        metaErrorSubcode: body?.error?.error_subcode,
        reason: 'Meta rejected notification',
        retryable: retryableHttpStatuses.has(status),
      })
    }

    await bookingModel.findOneAndUpdate(
      bookingFilter(booking),
      {
        $set: {
          'adminNotification.recipient': adminRecipient,
          'adminNotification.status': notificationStatus,
          'adminNotification.providerMessageId': messageId,
          'adminNotification.failureReason': failureReason,
          'adminNotification.sentAt': notificationStatus === 'sent' ? now() : null,
          'adminNotification.idempotencyKey': idempotencyKey,
        },
      },
    ).catch(() => {})

    return {
      sent: notificationStatus === 'sent',
      failed: notificationStatus === 'failed',
      messageId,
      failureReason,
    }
  }

  // Unified send logic for a booking confirmation event
  async function send(requestId, type, options = {}) {
    const booking = await getBooking(requestId)
    const source = options.source ?? 'application'
    if (!booking) {
      logWhatsAppNotification('SKIPPED', {
        source,
        notificationType: type,
        identity: requestId,
        reason: 'Booking not found',
      })
      return null
    }

    const isSuccess = type === 'booking_confirmation'
    if (!isSuccess) {
      // Payment assistance / failure notifications go to primary contact only
      return sendPrimaryConfirmation(booking, { ...options, targetType: type })
    }

    // 1. Send primary confirmation
    const primaryResult = await sendPrimaryConfirmation(booking, { ...options, targetType: type })

    // 2. If payment is paid and reference allocated, dispatch to consented attendees
    if (isRealPaidBookingStatus(booking.paymentStatus) && booking.reference && configured) {
      const attendees = getEligibleAttendees(booking)
      const primaryRecipient = normalizeWhatsAppRecipient(booking.mobile)
      const sentNumbers = new Set(primaryRecipient ? [primaryRecipient] : [])

      for (const attendee of attendees) {
        // Must have valid mobile and not opted out
        if (!attendee.mobile || attendee.whatsappConsent === false) {
          logSkipped(
            booking,
            'booking_confirmation',
            source,
            !attendee.mobile
              ? (attendee.rawMobile ? 'Invalid attendee mobile number' : 'Attendee mobile number missing')
              : 'Attendee consent missing',
            `${booking.requestId}:booking_confirmation:attendee:${attendee.gender}:${attendee.index}`,
          )
          continue
        }
        // If identical name and phone to primary, skip duplicate
        if (
          attendee.mobile === primaryRecipient &&
          attendee.name.trim().toLowerCase() === (booking.name || '').trim().toLowerCase()
        ) {
          logSkipped(
            booking,
            'booking_confirmation',
            source,
            'Duplicate recipient matches primary customer',
            `${booking.requestId}:booking_confirmation:attendee:${attendee.gender}:${attendee.index}`,
          )
          continue
        }
        // Avoid sending duplicate identical message to the exact same phone number in same booking
        if (sentNumbers.has(attendee.mobile) && !options.force) {
          logSkipped(
            booking,
            'booking_confirmation',
            source,
            'Duplicate recipient number',
            `${booking.requestId}:booking_confirmation:attendee:${attendee.gender}:${attendee.index}`,
          )
          continue
        }

        try {
          await sendAttendeeConfirmation(booking, attendee, options)
          sentNumbers.add(attendee.mobile)
        } catch {
          logWhatsAppNotification('REJECTED', {
            source,
            notificationType: 'booking_confirmation',
            identity: `${booking.requestId}:booking_confirmation:attendee:${attendee.gender}:${attendee.index}`,
            reason: 'Attendee notification processing failed',
          })
        }
      }

      // 3. Dispatch admin alert
      if (adminPhoneNumber) {
        try {
          await sendAdminAlert(booking, options)
        } catch {
          logWhatsAppNotification('REJECTED', {
            source,
            notificationType: 'admin_alert',
            identity: `${booking.requestId}:admin_alert`,
            reason: 'Admin notification processing failed',
          })
        }
      } else {
        logSkipped(booking, 'admin_alert', source, 'Admin WhatsApp number not configured')
      }
    } else if (isRealPaidBookingStatus(booking.paymentStatus) && booking.reference) {
      for (const attendee of getEligibleAttendees(booking)) {
        logSkipped(
          booking,
          'booking_confirmation',
          source,
          !attendee.mobile
            ? (attendee.rawMobile ? 'Invalid attendee mobile number' : 'Attendee mobile number missing')
            : attendee.whatsappConsent === false
              ? 'Attendee consent missing'
              : 'WhatsApp configuration missing',
          `${booking.requestId}:booking_confirmation:attendee:${attendee.gender}:${attendee.index}`,
        )
      }
      logSkipped(
        booking,
        'admin_alert',
        source,
        adminPhoneNumber ? 'WhatsApp configuration missing' : 'Admin WhatsApp number not configured',
      )
    }

    return primaryResult
  }

  // Admin manual resend action for a specific target
  async function resendNotification(requestId, {
    target = 'primary',
    attendeeIndex = 0,
    force = true,
    source = 'admin_manual_retry',
    booking: resolvedBooking,
    bookingModel = bookingEnquiryModel,
  } = {}) {
    const booking = resolvedBooking ?? await getUniqueBookingForRetry(requestId, bookingModel)
    if (!booking) {
      logWhatsAppNotification('SKIPPED', {
        source,
        notificationType: target === 'admin' ? 'admin_alert' : target === 'attendee' ? 'booking_confirmation' : 'payment_assistance',
        identity: requestId,
        reason: 'Booking not found',
      })
      throw Object.assign(new Error('Booking not found.'), { status: 404 })
    }
    if (String(booking.requestId) !== String(requestId)) {
      throw Object.assign(new Error('Booking identity does not match the retry request.'), { status: 409 })
    }
    const isPaid = isCompletedBookingPaymentStatus(booking.paymentStatus)

    if (target === 'primary') {
      if (!booking.whatsappConsent) {
        logSkipped(booking, isPaid ? 'booking_confirmation' : 'payment_assistance', source,
          booking.whatsappOptedOutAt ? 'Customer opted out' : 'Customer consent missing')
        return { success: false, message: 'Primary customer has not provided WhatsApp consent.' }
      }
      const result = await sendPrimaryConfirmation(booking, {
        force,
        retry: true,
        source,
        bookingModel,
      })
      return { success: Boolean(result?.sent), result, message: result?.sent ? 'Primary WhatsApp sent.' : result?.failureReason || 'Failed to send.' }
    }

    if (target === 'attendee') {
      const attendees = getEligibleAttendees(booking)
      const attendee = attendees.find((a) => a.index === attendeeIndex)
      if (!attendee) {
        logSkipped(booking, 'booking_confirmation', source, 'Attendee not found', `${booking.requestId}:attendee:${attendeeIndex}`)
        return { success: false, message: `Attendee with index ${attendeeIndex} not found.` }
      }
      if (!attendee.rawMobile) {
        logSkipped(booking, 'booking_confirmation', source, 'Attendee mobile number missing', `${booking.requestId}:attendee:${attendeeIndex}`)
        return { success: false, message: `No mobile number was entered for ${attendee.name}.` }
      }
      if (!attendee.mobile) {
        logSkipped(booking, 'booking_confirmation', source, 'Invalid attendee mobile number', `${booking.requestId}:attendee:${attendeeIndex}`)
        return { success: false, message: `The mobile number entered for ${attendee.name} is invalid.` }
      }
      if (!attendee.whatsappConsent) {
        logSkipped(booking, 'booking_confirmation', source, 'Attendee consent missing', `${booking.requestId}:attendee:${attendeeIndex}`)
        return { success: false, message: `${attendee.name} has not consented to WhatsApp updates.` }
      }
      const result = await sendAttendeeConfirmation(booking, attendee, {
        force: true,
        source,
        bookingModel,
      })
      return { success: Boolean(result?.sent), result, message: result?.sent ? `WhatsApp sent to ${attendee.name}.` : result?.error || 'Failed to send.' }
    }

    if (target === 'admin') {
      if (!adminPhoneNumber) {
        logSkipped(booking, 'admin_alert', source, 'Admin WhatsApp number not configured')
        return { success: false, message: 'WHATSAPP_ADMIN_PHONE_NUMBER is not configured.' }
      }
      const result = await sendAdminAlert(booking, { force: true, source, bookingModel })
      return {
        success: Boolean(result?.sent),
        result,
        message: result?.sent
          ? 'Admin WhatsApp alert accepted by Meta.'
          : result?.failureReason || 'Failed to send admin alert.',
      }
    }

    throw new Error(`Unsupported resend target: ${target}`)
  }

  async function notify(requestId, type, options = {}) {
    if (!['booking_confirmation', 'payment_assistance'].includes(type)) {
      throw new Error('Unsupported WhatsApp notification type.')
    }
    return send(requestId, type, options)
  }

  async function processRetries() {
    if (!configured) {
      logWhatsAppNotification('SKIPPED', {
        source: 'automatic_retry',
        notificationType: 'payment_assistance',
        reason: 'WhatsApp configuration missing',
      })
      return 0
    }
    const due = await bookingEnquiryModel.find({
      'whatsappNotification.status': 'failed',
      'whatsappNotification.retryable': true,
      'whatsappNotification.nextRetryAt': { $lte: now() },
      whatsappConsent: true,
    }).select('requestId whatsappNotification.messageType').limit(25).lean()
    let retried = 0
    for (const booking of due) {
      const type = booking.whatsappNotification.messageType
      const result = await send(booking.requestId, type, { retry: true, source: 'automatic_retry' })
      logWhatsAppNotificationResult(result, {
        source: 'automatic_retry',
        notificationType: type,
        identity: booking.whatsappNotification.idempotencyKey || `${booking.requestId}:${type}:automatic_retry`,
      })
      retried += 1
    }
    return retried
  }

  async function recordWebhookStatus({ messageId, status, timestamp, error = '' }) {
    if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(status)) return null
    const parsedTimestamp = timestamp ? new Date(Number(timestamp) * 1000) : now()
    const at = Number.isFinite(parsedTimestamp.getTime()) ? parsedTimestamp : now()
    const safeNote = status === 'failed'
      ? `WhatsApp delivery failed${error ? ` (provider code ${error})` : ''}.`
      : `WhatsApp status update: ${status}.`

    // Check primary notification match
    let booking = await bookingEnquiryModel.findOne({
      'whatsappNotification.providerMessageId': messageId,
    }).lean()

    if (booking) {
      const previousStatus = booking.whatsappNotification?.status ?? 'pending'
      if (
        status === previousStatus ||
        (status === 'failed' && statusRank(previousStatus) >= statusRank('delivered'))
      ) {
        return booking
      }
      if (status !== 'failed' && statusRank(status) <= statusRank(previousStatus)) {
        return booking
      }

      const update = {
        $set: {
          'whatsappNotification.status': status,
          'whatsappNotification.inProgress': false,
        },
        $push: {
          'whatsappNotification.history': historyEntry(
            status,
            'webhook',
            safeNote,
            `${messageId}:${status}:${timestamp ?? 'unknown'}`,
            at,
          ),
        },
      }
      if (status === 'delivered' || status === 'read') {
        update.$set['whatsappNotification.deliveredAt'] = at
      }
      if (status === 'sent') {
        update.$set['whatsappNotification.sentAt'] = at
      }
      if (status === 'failed') {
        update.$set['whatsappNotification.failureReason'] = safeNote
        update.$set['whatsappNotification.retryable'] = false
        update.$set['whatsappNotification.nextRetryAt'] = null
      }
      const updated = await bookingEnquiryModel.findOneAndUpdate(
        { requestId: booking.requestId, 'whatsappNotification.providerMessageId': messageId },
        update,
        { new: true, runValidators: true },
      ).lean()
      if (updated && ['delivered', 'read', 'failed'].includes(status)) {
        logWhatsAppNotification(
          status === 'delivered' ? 'DELIVERED' : status === 'read' ? 'READ' : 'DELIVERY_FAILED',
          {
            source: 'whatsapp_status_webhook',
            notificationType: booking.whatsappNotification?.messageType ?? 'booking_confirmation',
            identity: messageId,
            stage: 'delivery_status',
            messageId,
            deliveryTimestamp: at.toISOString(),
            deliveryStatus: status,
            reason: status === 'failed' ? 'WhatsApp delivery failed' : `WhatsApp ${status} status confirmed`,
          },
        )
      }
      return updated
    }

    const eventKey = `${messageId}:${status}:${timestamp ?? 'unknown'}`
    if (isDuplicateWebhookEvent(eventKey)) {
      return booking || null
    }

    // Check attendee notifications match
    const attendeeBooking = await bookingEnquiryModel.findOne({
      'attendeeNotifications.providerMessageId': messageId,
    }).lean()

    if (attendeeBooking) {
      const updateSet = {
        'attendeeNotifications.$.status': status,
      }
      if (status === 'delivered') {
        updateSet['attendeeNotifications.$.deliveredAt'] = at
      }
      if (status === 'read') {
        updateSet['attendeeNotifications.$.readAt'] = at
      }
      if (status === 'failed') {
        updateSet['attendeeNotifications.$.failureReason'] = safeNote
      }
      const updated = await bookingEnquiryModel.findOneAndUpdate(
        { requestId: attendeeBooking.requestId, 'attendeeNotifications.providerMessageId': messageId },
        { $set: updateSet },
        { new: true },
      ).lean()
      if (updated && ['delivered', 'read', 'failed'].includes(status)) {
        logWhatsAppNotification(
          status === 'delivered' ? 'DELIVERED' : status === 'read' ? 'READ' : 'DELIVERY_FAILED',
          {
            source: 'whatsapp_status_webhook',
            notificationType: 'booking_confirmation',
            identity: messageId,
            stage: 'delivery_status',
            messageId,
            deliveryTimestamp: at.toISOString(),
            deliveryStatus: status,
            reason: status === 'failed' ? 'WhatsApp delivery failed' : `WhatsApp ${status} status confirmed`,
          },
        )
      }
      return updated
    }

    // Check admin notification match
    const adminBooking = await bookingEnquiryModel.findOne({
      'adminNotification.providerMessageId': messageId,
    }).lean()

    if (adminBooking) {
      const updateSet = {
        'adminNotification.status': status,
      }
      if (status === 'delivered') {
        updateSet['adminNotification.deliveredAt'] = at
      }
      if (status === 'failed') {
        updateSet['adminNotification.failureReason'] = safeNote
      }
      const updated = await bookingEnquiryModel.findOneAndUpdate(
        { requestId: adminBooking.requestId, 'adminNotification.providerMessageId': messageId },
        { $set: updateSet },
        { new: true },
      ).lean()
      if (updated && ['delivered', 'read', 'failed'].includes(status)) {
        logWhatsAppNotification(
          status === 'delivered' ? 'DELIVERED' : status === 'read' ? 'READ' : 'DELIVERY_FAILED',
          {
            source: 'whatsapp_status_webhook',
            notificationType: 'admin_alert',
            identity: messageId,
            stage: 'delivery_status',
            messageId,
            deliveryTimestamp: at.toISOString(),
            deliveryStatus: status,
            reason: status === 'failed' ? 'WhatsApp delivery failed' : `WhatsApp ${status} status confirmed`,
          },
        )
      }
      return updated
    }

    return null
  }

  async function recordIncomingMessage({
    messageId,
    from,
    timestamp,
    type = 'text',
    text = '',
    button = '',
    interactive = null,
  }) {
    if (!messageId || !from) return null
    const eventKey = `${messageId}:incoming`
    if (isDuplicateWebhookEvent(eventKey)) {
      return null
    }

    const parsedTimestamp = timestamp ? new Date(Number(timestamp) * 1000) : now()
    const at = Number.isFinite(parsedTimestamp.getTime()) ? parsedTimestamp : now()
    const messageBody = String(text || button || (interactive?.button_reply?.title || interactive?.list_reply?.title || '')).trim()
    const isOptOut = /^(stop|unsubscribe|cancel|optout|opt-out|quit|end)$/i.test(messageBody)

    const rawDigits = from.replace(/\D/g, '')
    const last10 = rawDigits.slice(-10)
    if (!last10) return null

    const matchRegex = new RegExp(`${last10}$`)
    const booking = await bookingEnquiryModel.findOne({
      $or: [
        { mobile: { $regex: matchRegex } },
        { maleMemberMobiles: { $regex: matchRegex } },
        { femaleMemberMobiles: { $regex: matchRegex } },
      ],
    }).sort({ createdAt: -1 })

    if (!booking) {
      return null
    }

    const alreadyRecorded = booking.whatsappNotification?.history?.some((h) => h.eventKey === eventKey)
    if (alreadyRecorded) {
      return booking
    }

    const note = isOptOut
      ? `Customer requested WhatsApp opt-out ("${messageBody}"). Communications paused.`
      : messageBody
        ? `Customer incoming message: "${messageBody.slice(0, 200)}"`
        : `Customer sent incoming message (${type}).`

    const update = {
      $push: {
        'whatsappNotification.history': historyEntry('received', 'customer', note, eventKey, at),
      },
    }

    if (isOptOut) {
      update.$set = {
        whatsappConsent: false,
        whatsappOptedOutAt: at,
      }
    }

    return bookingEnquiryModel.findByIdAndUpdate(booking._id, update, { new: true }).lean()
  }

  return {
    configured,
    getDiagnostics,
    notify,
    processRetries,
    recordWebhookStatus,
    recordIncomingMessage,
    resendNotification,
    send,
    sendAdminAlert,
    sendAttendeeConfirmation,
    sendPrimaryConfirmation,
  }
}
