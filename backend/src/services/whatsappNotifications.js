import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { BookingEnquiry } from '../models/bookingEnquiry.js'

const retryableHttpStatuses = new Set([429, 500, 502, 503, 504])

function formatBookingDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

function normalizeRecipient(value) {
  const number = parsePhoneNumberFromString(value ?? '')
  return number?.isValid() ? number.number : ''
}

function historyEntry(status, source, note = '', eventKey = randomUUID(), at = new Date()) {
  return { status, source, note, eventKey, at }
}

function templateBodyParameters(booking, kind) {
  const amount = `₹${booking.paymentAmount ?? 299}`
  if (kind === 'success') {
    const priceLines = booking.diwaliOfferApplied
      ? `Regular Price: ₹${booking.regularPrice}\nDiwali Offer Price: ₹${booking.offerPrice}\nAmount Paid: ${amount}`
      : `Regular Price: ₹${booking.regularPrice}\nAmount Paid: ${amount}`
    return [
      booking.name,
      booking.reference,
      booking.name,
      booking.mobile,
      booking.email || 'Not provided',
      booking.category || booking.event || 'Not provided',
      booking.gender,
      formatBookingDate(booking.createdAt),
      priceLines,
      'Paid',
      booking.status === 'confirmed' ? 'Approved' : 'Pending Approval',
    ]
  }
  return [
    booking.name,
    booking.mobile,
    booking.category || booking.event || 'Not provided',
    amount,
    booking.paymentFailureReason === 'cancelled' ? 'Cancelled' : 'Failed',
  ]
}

function statusRank(status) {
  return ({ pending: 0, sent: 1, delivered: 2, read: 3 })[status] ?? -1
}

function safeFailureReason(status, responseBody) {
  const apiCode = responseBody?.error?.code
  return `WhatsApp Cloud API returned HTTP ${status}${Number.isInteger(apiCode) ? ` (code ${apiCode})` : ''}.`
}

export function createWhatsAppNotificationService({
  bookingEnquiryModel = BookingEnquiry,
  phoneNumberId = '',
  accessToken = '',
  apiVersion = '',
  successTemplateName = '',
  failureTemplateName = '',
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const configured = Boolean(
    phoneNumberId &&
    accessToken &&
    /^v\d+\.\d+$/.test(apiVersion) &&
    successTemplateName &&
    failureTemplateName &&
    typeof fetchImpl === 'function',
  )

  async function getBooking(requestId) {
    return bookingEnquiryModel.findOne({ requestId }).lean()
  }

  async function setSkipped(booking, idempotencyKey, reason) {
    const at = now()
    return bookingEnquiryModel.findOneAndUpdate(
      { requestId: booking.requestId, whatsappConsent: { $ne: true } },
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

  async function setUnavailable(booking, type, idempotencyKey, reason, retryable = false) {
    const at = now()
    return bookingEnquiryModel.findOneAndUpdate(
      { requestId: booking.requestId, whatsappConsent: true },
      {
        $set: {
          'whatsappNotification.messageType': type === 'payment_assistance'
            ? 'payment_assistance'
            : 'booking_confirmation',
          'whatsappNotification.idempotencyKey': idempotencyKey,
          'whatsappNotification.recipient': normalizeRecipient(booking.mobile),
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

  async function send(requestId, type, { retry = false } = {}) {
    const booking = await getBooking(requestId)
    if (!booking) return null

    const isSuccess = type === 'booking_confirmation'
    if (isSuccess && booking.paymentStatus === 'demo_paid') {
      const skipped = await bookingEnquiryModel.findOneAndUpdate(
        { requestId, paymentStatus: 'demo_paid', whatsappConsent: true },
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
      return { booking: skipped ?? booking, skipped: true }
    }
    if (isSuccess && !(booking.paymentStatus === 'paid' && booking.reference)) {
      return { booking, skipped: true }
    }
    if (!isSuccess && booking.paymentStatus !== 'failed') {
      return { booking, pending: true }
    }

    const idempotencyKey = isSuccess
      ? `${requestId}:booking_confirmation:${booking.reference}`
      : `${requestId}:payment_assistance:${booking.paymentOrderId || booking.paymentAttemptedAt?.toISOString() || 'attempt' }`
    if (!booking.whatsappConsent) {
      const skipped = await setSkipped(booking, idempotencyKey, 'Skipped – no WhatsApp notification consent.')
      return { booking: skipped ?? booking, skipped: true }
    }

    const recipient = normalizeRecipient(booking.mobile)
    if (!recipient) {
      const invalid = await setUnavailable(booking, type, idempotencyKey, 'The saved mobile number is not a valid WhatsApp recipient.')
      return { booking: invalid ?? booking, failed: true }
    }
    if (!configured) {
      const unavailable = await setUnavailable(
        booking,
        type,
        idempotencyKey,
        'WhatsApp Cloud API or approved templates are not configured.',
        true,
      )
      return { booking: unavailable ?? booking, failed: true }
    }

    const previousNotification = booking.whatsappNotification ?? {}
    if (previousNotification.idempotencyKey === idempotencyKey) {
      if (
        ['sent', 'delivered', 'read', 'skipped'].includes(previousNotification.status) ||
        previousNotification.inProgress
      ) {
        return { booking, duplicate: true }
      }
      if (!retry || !previousNotification.retryable || new Date(previousNotification.nextRetryAt) > now()) {
        return { booking, duplicate: true }
      }
    }

    const at = now()
    const claimFilter = {
      requestId,
      whatsappConsent: true,
      'whatsappNotification.inProgress': { $ne: true },
      ...(previousNotification.idempotencyKey === idempotencyKey
        ? {
            'whatsappNotification.idempotencyKey': idempotencyKey,
            'whatsappNotification.status': 'failed',
            'whatsappNotification.retryable': true,
            'whatsappNotification.nextRetryAt': { $lte: at },
          }
        : { 'whatsappNotification.idempotencyKey': { $ne: idempotencyKey } }),
    }
    const claimed = await bookingEnquiryModel.findOneAndUpdate(
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
      return { booking: await getBooking(requestId), duplicate: true }
    }

    const templateName = isSuccess ? successTemplateName : failureTemplateName
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient.slice(1),
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: templateBodyParameters(booking, isSuccess ? 'success' : 'failure')
            .map((text) => ({ type: 'text', text: String(text) })),
        }],
      },
      biz_opaque_callback_data: idempotencyKey,
    }
    let response
    let body
    try {
      response = await fetchImpl(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
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
      body = await response.json().catch(() => ({}))
    } catch {
      const reason = 'WhatsApp provider response was uncertain; automatic retry was withheld to prevent duplicate messages.'
      const failed = await bookingEnquiryModel.findOneAndUpdate(
        { requestId, 'whatsappNotification.idempotencyKey': idempotencyKey },
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

    if (!response.ok || typeof body.messages?.[0]?.id !== 'string') {
      const retryable = retryableHttpStatuses.has(response.status)
      const attempts = claimed.whatsappNotification?.attemptCount ?? 1
      const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5))
      const reason = safeFailureReason(response.status, body)
      const failed = await bookingEnquiryModel.findOneAndUpdate(
        { requestId, 'whatsappNotification.idempotencyKey': idempotencyKey },
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
            'whatsappNotification.history': historyEntry('failed', 'system', reason, `${idempotencyKey}:http:${response.status}:${attempts}`, now()),
          },
        },
        { new: true, runValidators: true },
      ).lean()
      return { booking: failed ?? claimed, failed: true }
    }

    const messageId = body.messages[0].id
    const sentAt = now()
    const sent = await bookingEnquiryModel.findOneAndUpdate(
      { requestId, 'whatsappNotification.idempotencyKey': idempotencyKey },
      {
        $set: {
          'whatsappNotification.status': 'sent',
          'whatsappNotification.providerMessageId': messageId,
          'whatsappNotification.inProgress': false,
          'whatsappNotification.failureReason': '',
          'whatsappNotification.retryable': false,
          'whatsappNotification.nextRetryAt': null,
        },
        $push: {
          'whatsappNotification.history': historyEntry('sent', 'system', 'Accepted by WhatsApp Cloud API; delivery is not yet confirmed.', `${idempotencyKey}:sent`, sentAt),
        },
      },
      { new: true, runValidators: true },
    ).lean()
    return { booking: sent ?? claimed, sent: true }
  }

  async function notify(requestId, type) {
    if (!['booking_confirmation', 'payment_assistance'].includes(type)) {
      throw new Error('Unsupported WhatsApp notification type.')
    }
    return send(requestId, type)
  }

  async function processRetries() {
    if (!configured) return 0
    const due = await bookingEnquiryModel.find({
      'whatsappNotification.status': 'failed',
      'whatsappNotification.retryable': true,
      'whatsappNotification.nextRetryAt': { $lte: now() },
      whatsappConsent: true,
    }).select('requestId whatsappNotification.messageType').limit(25).lean()
    let retried = 0
    for (const booking of due) {
      await send(booking.requestId, booking.whatsappNotification.messageType, { retry: true })
      retried += 1
    }
    return retried
  }

  async function recordWebhookStatus({ messageId, status, timestamp, error = '' }) {
    if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(status)) return null
    const booking = await bookingEnquiryModel.findOne({
      'whatsappNotification.providerMessageId': messageId,
    }).lean()
    if (!booking) return null
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
    const parsedTimestamp = timestamp ? new Date(Number(timestamp) * 1000) : now()
    const at = Number.isFinite(parsedTimestamp.getTime()) ? parsedTimestamp : now()
    const safeNote = status === 'failed'
      ? `WhatsApp delivery failed${error ? ` (provider code ${error})` : ''}.`
      : `WhatsApp status update: ${status}.`
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
    if (status === 'failed') {
      update.$set['whatsappNotification.failureReason'] = safeNote
      update.$set['whatsappNotification.retryable'] = false
      update.$set['whatsappNotification.nextRetryAt'] = null
    }
    return bookingEnquiryModel.findOneAndUpdate(
      {
        _id: booking._id,
        'whatsappNotification.status': previousStatus,
      },
      update,
      { new: true, runValidators: true },
    ).lean()
  }

  return {
    configured,
    notify,
    processRetries,
    recordWebhookStatus,
  }
}

export function isValidWhatsAppWebhookSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !appSecret) return false
  const [algorithm, digest] = signature.split('=')
  if (algorithm !== 'sha256' || !/^[a-f\d]{64}$/i.test(digest ?? '')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  const actual = Buffer.from(digest, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
