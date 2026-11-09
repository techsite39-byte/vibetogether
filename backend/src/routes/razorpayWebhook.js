import { Router } from 'express'
import { isValidRazorpayWebhookSignature } from '../services/razorpayPayments.js'

export function createRazorpayWebhookRouter({
  payments,
  notifications,
  secret = '',
} = {}) {
  const router = Router()

  async function notifyWithoutAffectingPayment(requestId, type) {
    try {
      await notifications?.notify?.(requestId, type)
    } catch (error) {
      console.error('WhatsApp notification failed after Razorpay webhook.', {
        name: error?.name ?? 'UnknownError',
        code: error?.code ?? '',
      })
    }
  }

  router.post('/', async (request, response) => {
    if (!secret) {
      response.status(503).json({ message: 'Razorpay webhook signature verification is not configured.' })
      return
    }
    if (!isValidRazorpayWebhookSignature(
      request.rawBody,
      request.get('x-razorpay-signature'),
      secret,
    )) {
      response.status(401).json({ message: 'Razorpay webhook signature is invalid.' })
      return
    }
    if (typeof payments?.handleWebhook !== 'function') {
      response.status(503).json({ message: 'Razorpay payment processing is unavailable.' })
      return
    }

    try {
      const event = request.body?.event
      const payment = request.body?.payload?.payment?.entity
      const order = request.body?.payload?.order?.entity
      const result = await payments.handleWebhook(event, payment, order)
      if (result?.booking?.paymentStatus === 'paid' && result.booking.reference) {
        await notifyWithoutAffectingPayment(result.booking.requestId, 'booking_confirmation')
      } else if (result?.booking?.paymentStatus === 'failed') {
        await notifyWithoutAffectingPayment(result.booking.requestId, 'payment_assistance')
      }
      response.status(200).json({ received: true })
    } catch (error) {
      console.error('Razorpay webhook processing failed.')
      response.status(error.status ?? 503).json({
        message: error.status ? error.message : 'Razorpay payment status could not be recorded.',
      })
    }
  })

  return router
}
