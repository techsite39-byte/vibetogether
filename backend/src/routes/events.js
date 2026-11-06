import { Router } from 'express'
import { events } from '../../../src/data/events.js'

export function createEventsRouter({ eventRepository, initialEvents = events } = {}) {
  const router = Router()

  router.get('/', async (_request, response) => {
    try {
      const availableEvents = eventRepository
        ? await eventRepository.list()
        : initialEvents
      response.json({ events: availableEvents.map(publicEventRecord) })
    } catch {
      response.status(503).json({
        message: 'Event experiences are temporarily unavailable.',
      })
    }
  })

  return router
}

function publicEventRecord(event) {
  const {
    _id: _databaseId,
    __v: _version,
    organizerId: _organizerId,
    status: _status,
    updatedAt: _updatedAt,
    ...publicFields
  } = typeof event.toObject === 'function' ? event.toObject() : event

  return {
    ...publicFields,
    description: publicFields.description ?? '',
    image: publicFields.image ?? '',
    imageAlt: publicFields.imageAlt ?? '',
  }
}

export default createEventsRouter()
