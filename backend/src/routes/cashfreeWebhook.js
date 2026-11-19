import { Router } from 'express'
import { isValidCashfreeWebhookSignature } from '../services/cashfreePayments.js'

export function createCashfreeWebhookRouter({
  payments,
  secret = '',
} = {}) {
  const router = Router()

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
      await payments.handleWebhook(
        payload,
        signature,
        timestamp,
        rawBody,
      )

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
