import { Router } from 'express'
import { isValidWhatsAppWebhookSignature } from '../services/whatsappNotifications.js'
import { config } from '../config/env.js'

export function createWhatsAppWebhookRouter({
  notifications,
  verifyToken,
  appSecret,
} = {}) {
  const router = Router()
  const effectiveVerifyToken = verifyToken !== undefined ? verifyToken : config.whatsappWebhookVerifyToken
  const effectiveAppSecret = appSecret !== undefined ? appSecret : config.whatsappAppSecret

  // GET: Meta Webhook Handshake Verification
  router.get('/', (request, response) => {
    const mode = request.query['hub.mode']
    const token = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']

    if (!effectiveVerifyToken) {
      response.status(503).type('text/plain').send('WhatsApp webhook verification token is not configured.')
      return
    }

    if (mode === 'subscribe' && token === effectiveVerifyToken && typeof challenge === 'string') {
      response.status(200).type('text/plain').send(challenge)
      return
    }

    response.status(403).type('text/plain').send('Webhook verification failed.')
  })

  // POST: Meta Webhook Event Handler (Statuses & Inbound Messages)
  router.post('/', async (request, response) => {
    if (!effectiveAppSecret) {
      response.status(503).json({ message: 'WhatsApp webhook signature verification is not configured.' })
      return
    }

    const signature = request.get('x-hub-signature-256')
    if (!signature) {
      response.status(401).json({ message: 'Webhook signature header missing.' })
      return
    }

    if (!isValidWhatsAppWebhookSignature(
      request.rawBody,
      signature,
      effectiveAppSecret,
    )) {
      response.status(401).json({ message: 'Webhook signature is invalid.' })
      return
    }

    if (!notifications?.recordWebhookStatus) {
      response.status(503).json({ message: 'WhatsApp status processing is unavailable.' })
      return
    }

    try {
      const entries = request.body?.entry ?? []
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const value = change.value ?? {}

          // 1. Process Status Updates (sent, delivered, read, failed)
          const statuses = value.statuses ?? []
          for (const item of statuses) {
            await notifications.recordWebhookStatus({
              messageId: item.id,
              status: item.status,
              timestamp: item.timestamp,
              recipientId: item.recipient_id,
              error: item.errors?.[0]?.code,
              errorMessage: item.errors?.[0]?.message || item.errors?.[0]?.title,
            })
          }

          // 2. Process Incoming Messages (customer queries, opt-outs)
          const messages = value.messages ?? []
          for (const item of messages) {
            if (notifications.recordIncomingMessage) {
              await notifications.recordIncomingMessage({
                messageId: item.id,
                from: item.from,
                timestamp: item.timestamp,
                type: item.type,
                text: item.text?.body,
                button: item.button?.text,
                interactive: item.interactive,
              })
            }
          }
        }
      }

      response.status(200).json({ received: true })
    } catch (err) {
      console.error('WhatsApp webhook processing error:', err.message)
      response.status(500).json({ message: 'Webhook processing encountered an error.' })
    }
  })

  return router
}
