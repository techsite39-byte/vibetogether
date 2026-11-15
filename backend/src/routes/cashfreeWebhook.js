import { Router } from 'express'
import { isValidCashfreeWebhookSignature } from '../services/cashfreePayments.js'

export function createCashfreeWebhookRouter({
  payments,
  notifications,
  secret = '',
} = {}) {
  const router = Router()

  async function notifyWithoutAffectingPayment(requestId, type) {
    try {
      await notifications?.notify?.(requestId, type)
    } catch (error) {
      console.error('[Cashfree Webhook] WhatsApp notification error:', {
        name: error?.name ?? 'UnknownError',
        code: error?.code ?? '',
      })
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

      if (result?.action === 'confirmed' && result.booking?.paymentStatus === 'paid' && result.booking.reference) {
        await notifyWithoutAffectingPayment(result.booking.requestId, 'booking_confirmation')
      } else if (result?.action === 'failed' && result.booking?.paymentStatus === 'failed') {
        await notifyWithoutAffectingPayment(result.booking.requestId, 'payment_assistance')
      }

      response.status(200).json({ received: true })
    } catch (error) {
      console.error('[Cashfree Webhook] Webhook processing failed:', error.message)
      response.status(error.status ?? 503).json({
        message: error.status ? error.message : 'Cashfree payment status could not be recorded.',
      })
    }
  })

  return router
}
