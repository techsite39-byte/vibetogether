import { Router } from 'express'
import { isRealPaidBookingStatus } from '../../../src/utils/paymentStatus.js'
import { isValidCashfreeWebhookSignature } from '../services/cashfreePayments.js'
import {
  logWhatsAppNotification,
  logWhatsAppNotificationResult,
} from '../services/whatsappNotifications.js'

export function createCashfreeWebhookRouter({
  payments,
  notifications,
  secret = '',
} = {}) {
  const router = Router()

  async function notifyWithoutAffectingPayment(requestId, type, source = 'cashfree_webhook') {
    try {
      const result = await notifications?.notify?.(requestId, type, { source })
      logWhatsAppNotificationResult(result, {
        source,
        notificationType: type,
        identity: requestId,
      })
      return result
    } catch (error) {
      logWhatsAppNotification('REJECTED', {
        source,
        notificationType: type,
        identity: requestId,
        reason: 'Notification service threw',
        errorDetails: error?.code ? `Processing error code ${error.code}` : 'Processing error',
      })
      return { failed: true }
    }
  }

  router.post('/', async (request, response) => {
    if (!secret) {
      response.status(503).json({ message: 'Cashfree webhook signature verification is not configured.' })
      return
    }

    const signature = request.get('x-webhook-signature')
    const timestamp = request.get('x-webhook-timestamp')
    const rawBody = request.body

    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      response.status(400).json({ message: 'Cashfree webhook body is missing or malformed.' })
      return
    }

    if (!isValidCashfreeWebhookSignature(rawBody, signature, timestamp, secret)) {
      response.status(401).json({ message: 'Cashfree webhook signature is invalid or expired.' })
      return
    }

    let payload
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      response.status(400).json({ message: 'Cashfree webhook body contains malformed JSON.' })
      return
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      response.status(400).json({ message: 'Cashfree webhook body must be a JSON object.' })
      return
    }

    if (typeof payments?.handleWebhook !== 'function') {
      response.status(503).json({ message: 'Cashfree payment processing is unavailable.' })
      return
    }

    try {
      const result = await payments.handleWebhook(
        payload,
        signature,
        timestamp,
        rawBody,
      )

      if (result?.action === 'confirmed' && isRealPaidBookingStatus(result.booking?.paymentStatus) && result.booking.reference) {
        await notifyWithoutAffectingPayment(result.booking.requestId, 'booking_confirmation')
      } else if (
        result?.action === 'failed' &&
        result.booking?.paymentStatus === 'failed' &&
        result.booking?.paymentFailureReason !== 'cancelled' &&
        result.booking?.paymentFailureReason !== 'user_dropped' &&
        payload?.type !== 'PAYMENT_USER_DROPPED_WEBHOOK'
      ) {
        await notifyWithoutAffectingPayment(result.booking.requestId, 'payment_assistance')
      } else {
        logWhatsAppNotification('SKIPPED', {
          source: 'cashfree_webhook',
          notificationType: 'payment_assistance',
          identity: result?.booking?.requestId ?? payload?.data?.payment?.cf_payment_id ?? payload?.type,
          reason: result?.duplicate
            ? 'Duplicate Cashfree webhook'
            : result?.booking?.paymentFailureReason === 'cancelled' || payload?.type === 'PAYMENT_USER_DROPPED_WEBHOOK'
              ? 'Customer cancelled payment'
              : result?.booking?.paymentStatus === 'pending'
                ? 'Payment still pending'
                : 'Cashfree event is not notification eligible',
        })
      }

      response.status(200).json({ received: true })
    } catch (error) {
      const errorCode = Number(error?.code)
      const errorStatus = Number(error?.status)
      console.error('[Cashfree Webhook] Webhook processing failed.', {
        name: ['Error', 'TypeError', 'ValidationError', 'MongooseError', 'MongoServerError']
          .includes(error?.name)
          ? error.name
          : 'ProcessingError',
        code: Number.isSafeInteger(errorCode) ? errorCode : null,
        status: Number.isInteger(errorStatus) && errorStatus >= 400 && errorStatus <= 599
          ? errorStatus
          : 0,
      })
      response.status(error.status ?? 503).json({
        message: error.status ? error.message : 'Cashfree payment status could not be recorded.',
      })
    }
  })

  return router
}
