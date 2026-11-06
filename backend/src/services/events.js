import { events as currentEventCatalog } from '../../../src/data/events.js'
import { Event } from '../models/event.js'

function toEventRecord(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? '',
    image: event.image ?? '',
    imageAlt: event.imageAlt ?? '',
    category: event.category,
    date: event.date,
    time: event.time,
    startsAt: event.startsAt,
    location: event.location,
    organizer: event.organizer,
    price: event.price,
    priceAmount: event.priceAmount,
    currency: event.currency,
    isFree: event.isFree,
    seatsAvailable: event.seatsAvailable,
    createdAt: new Date(event.createdAt),
    venueDetails: event.venueDetails ?? '',
    highlights: event.highlights ?? [],
    activities: event.activities ?? [],
    schedule: event.schedule ?? [],
    guidelines: event.guidelines ?? [],
    gallery: event.gallery ?? [],
    status: 'published',
    updatedAt: new Date(),
  }
}

export async function ensureEventCatalog() {
  await Event.init()
  const existingEvents = await Event.find({}).lean()
  const existingById = new Map(existingEvents.map((event) => [event.id, event]))
  const operations = currentEventCatalog.map((event) => {
    const record = toEventRecord(event)
    const existing = existingById.get(event.id)
    const missingFields = existing
      ? Object.fromEntries(
          Object.entries(record).filter(
            ([field]) => !Object.hasOwn(existing, field),
          ),
        )
      : {}
    return {
      updateOne: {
        filter: { id: event.id },
        update: {
          $setOnInsert: record,
          ...(Object.keys(missingFields).length > 0
            ? { $set: missingFields }
            : {}),
        },
        upsert: true,
      },
    }
  })

  try {
    await Event.bulkWrite(operations, { ordered: false })
  } catch (error) {
    const duplicateOnly =
      error.code === 11000 ||
      (Array.isArray(error.writeErrors) &&
        error.writeErrors.length > 0 &&
        error.writeErrors.every(({ code }) => code === 11000))
    if (!duplicateOnly) {
      throw error
    }
  }
}

export async function listEvents() {
  return Event.find({})
    .where({ status: 'published' })
    .sort({ title: 1 })
    .lean()
}

export async function findEventById(id) {
  return Event.findOne({ id, status: 'published' }).lean()
}
