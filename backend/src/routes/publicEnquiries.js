import { Router } from 'express'
import { Enquiry, Subscriber } from '../models/adminRecords.js'

const requestWindow = 15 * 60 * 1000
const maxRequestsPerWindow = 5

function createRateLimiter() {
  const clients = new Map()
  return function rateLimit(request, response, next) {
    const now = Date.now()
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown'
    const current = clients.get(key)
    const record =
      !current || now - current.startedAt >= requestWindow
        ? { startedAt: now, count: 0 }
        : current
    record.count += 1
    clients.set(key, record)

    if (clients.size > 10000) {
      for (const [client, value] of clients) {
        if (now - value.startedAt >= requestWindow) {
          clients.delete(client)
        }
      }
    }

    if (record.count > maxRequestsPerWindow) {
      response.set('Retry-After', String(requestWindow / 1000))
      response.status(429).json({ message: 'Too many requests. Please try again later.' })
      return
    }
    next()
  }
}

function normalizeText(value, maximumLength) {
  if (typeof value !== 'string') {
    return ''
  }
  const normalized = value.normalize('NFKC').trim()
  if (
    normalized.length > maximumLength ||
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint <= 31 || codePoint === 127
    })
  ) {
    return ''
  }
  return normalized
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

export function createPublicEnquiriesRouter({
  enquiryModel = Enquiry,
  subscriberModel = Subscriber,
} = {}) {
  const router = Router()
  const rateLimit = createRateLimiter()

  router.post('/newsletter', rateLimit, async (request, response, next) => {
    try {
      const email = normalizeText(request.body?.email, 254).toLowerCase()
      if (!validEmail(email)) {
        response.status(400).json({ message: 'Enter a valid email address.' })
        return
      }

      await subscriberModel.findOneAndUpdate(
        { email },
        {
          $set: { status: 'subscribed' },
          $setOnInsert: { email, subscribedAt: new Date() },
        },
        { new: true, upsert: true, runValidators: true },
      )
      response.status(200).json({ message: 'You are subscribed.' })
    } catch (error) {
      next(error)
    }
  })

  router.post('/enquiries/:type', rateLimit, async (request, response, next) => {
    try {
      const { type } = request.params
      if (!['contact', 'host-event'].includes(type)) {
        response.status(404).json({ message: 'Enquiry type is not supported.' })
        return
      }

      const isHostEvent = type === 'host-event'
      const name = normalizeText(
        isHostEvent ? request.body?.organizerName : request.body?.fullName,
        80,
      )
      const email = normalizeText(request.body?.email, 254).toLowerCase()
      const phone = normalizeText(
        isHostEvent ? request.body?.phone : request.body?.mobile,
        24,
      )
      const subject = normalizeText(
        isHostEvent ? request.body?.eventName : request.body?.subject,
        160,
      )
      const message = normalizeText(
        isHostEvent ? request.body?.description : request.body?.message,
        4000,
      )

      if (name.length < 2 || !validEmail(email) || message.length < 5) {
        response.status(400).json({ message: 'Enter valid contact details and a message.' })
        return
      }
      if (phone && !/^\+?[0-9][0-9\s().-]{6,23}$/.test(phone)) {
        response.status(400).json({ message: 'Enter a valid phone number.' })
        return
      }

      let hostDetails = null
      if (isHostEvent) {
        const expectedAttendees = Number(request.body?.expectedAttendees)
        const proposedDate = normalizeText(request.body?.proposedDate, 30)
        const categoryId = normalizeText(request.body?.categoryId, 80)
        if (
          !Number.isInteger(expectedAttendees) ||
          expectedAttendees < 1 ||
          expectedAttendees > 10000 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) ||
          !categoryId
        ) {
          response.status(400).json({ message: 'Provide valid event proposal details.' })
          return
        }
        hostDetails = { expectedAttendees, proposedDate, categoryId }
      }

      await enquiryModel.create({
        type,
        name,
        email,
        mobile: phone,
        phone,
        subject,
        message,
        hostDetails,
        status: 'pending',
      })
      response.status(201).json({ message: 'Your enquiry was received.' })
    } catch (error) {
      next(error)
    }
  })

  return router
}
