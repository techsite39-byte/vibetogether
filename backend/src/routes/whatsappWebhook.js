import { Router } from 'express'
import { isValidWhatsAppWebhookSignature } from '../services/whatsappNotifications.js'

export function createWhatsAppWebhookRouter({
  notifications,
  verifyToken = '',
  appSecret = '',
} = {}) {
  const router = Router()

  router.get('/', (request, response) => {
    const mode = request.query['hub.mode']
    const token = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']
    if (mode === 'subscribe' && verifyToken && token === verifyToken && typeof challenge === 'string') {
      response.type('text/plain').send(challenge)
      return
    }
    response.status(403).send('Webhook verification failed.')
  })

  router.post('/', async (request, response) => {
    if (!appSecret) {
      response.status(503).json({ message: 'WhatsApp webhook signature verification is not configured.' })
      return
    }
    if (!isValidWhatsAppWebhookSignature(
      request.rawBody,
      request.get('x-hub-signature-256'),
      appSecret,
    )) {
      response.status(401).json({ message: 'Webhook signature is invalid.' })
      return
    }
    if (!notifications?.recordWebhookStatus) {
      response.status(503).json({ message: 'WhatsApp status processing is unavailable.' })
      return
    }
    try {
      const statuses = (request.body?.entry ?? [])
        .flatMap((entry) => entry.changes ?? [])
        .flatMap((change) => change.value?.statuses ?? [])
      for (const item of statuses) {
        await notifications.recordWebhookStatus({
          messageId: item.id,
          status: item.status,
          timestamp: item.timestamp,
          error: item.errors?.[0]?.code,
        })
      }
      response.status(200).json({ received: true })
    } catch {
      console.error('WhatsApp delivery webhook processing failed.')
      response.status(503).json({ message: 'WhatsApp status could not be recorded.' })
    }
  })

  return router
}
