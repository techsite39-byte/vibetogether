import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { normalizeWhatsAppNumber } from '../services/whatsapp.js'

function validSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !appSecret) {
    return false
  }
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
}

export function createWhatsAppWebhookRouter({ whatsappService, repository } = {}) {
  const router = Router()

  router.get('/', (request, response) => {
    const mode = request.query['hub.mode']
    const token = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']
    if (
      mode === 'subscribe' &&
      token &&
      token === whatsappService?.webhookVerifyToken &&
      typeof challenge === 'string'
    ) {
      response.type('text/plain').send(challenge)
      return
    }
    response.status(403).json({ message: 'Webhook verification failed.' })
  })

  router.post('/', async (request, response) => {
    if (!whatsappService?.appSecret) {
      response.status(503).json({ message: 'Webhook verification is not configured.' })
      return
    }
    if (!validSignature(
      request.body,
      request.get('x-hub-signature-256'),
      whatsappService.appSecret,
    )) {
      response.status(401).json({ message: 'Webhook signature is invalid.' })
      return
    }

    let payload
    try {
      payload = JSON.parse(request.body.toString('utf8'))
    } catch {
      response.status(400).json({ message: 'Webhook payload is invalid.' })
      return
    }

    const statuses = []
    const optOutPhones = []
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          const text = message.type === 'text' ? message.text?.body : ''
          if (
            typeof message.from === 'string' &&
            typeof text === 'string' &&
            /^(stop|unsubscribe|cancel)$/i.test(text.trim())
          ) {
            const phone = normalizeWhatsAppNumber(`+${message.from}`)
            if (phone) {
              optOutPhones.push(`+${phone}`)
            }
          }
        }
        for (const status of change.value?.statuses ?? []) {
          if (
            typeof status.id === 'string' &&
            ['sent', 'delivered', 'read', 'failed'].includes(status.status)
          ) {
            const failureReason = status.errors?.[0]?.title
            statuses.push({
              messageId: status.id,
              status: status.status,
              timestamp: status.timestamp,
              failureReason: typeof failureReason === 'string'
                ? failureReason.slice(0, 300)
                : '',
            })
          }
        }
      }
    }
    try {
      for (const status of statuses) {
        await repository.updateWhatsAppDeliveryStatus(status)
      }
      for (const phone of new Set(optOutPhones)) {
        await repository.optOutWhatsAppByPhone?.(phone)
      }
      response.status(200).json({ received: true })
    } catch {
      console.error('WhatsApp delivery status update failed.')
      response.status(503).json({ message: 'Webhook status update could not be saved.' })
    }
  })

  return router
}
