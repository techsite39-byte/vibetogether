import { events as currentEventCatalog } from '../../../src/data/events.js'
import { PlatformSetting } from '../models/adminRecords.js'
import { Event } from '../models/event.js'

export const DELETED_BUILT_IN_EVENTS_SETTING_KEY = 'deletedBuiltInEventIds'

const builtInEventIds = new Set(currentEventCatalog.map(({ id }) => id))

export function isBuiltInEventId(id) {
  return typeof id === 'string' && builtInEventIds.has(id)
}

function normalizeDeletedBuiltInEventIds(value) {
  if (value === undefined || value === null) {
    return new Set()
  }
  const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null
  if (!ids) {
    throw new TypeError('Deleted built-in event setting must contain an array of IDs.')
  }
  return new Set(ids.filter(isBuiltInEventId))
}

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

export function createEventCatalogService({
  eventModel = Event,
  platformSettingModel = PlatformSetting,
} = {}) {
  async function ensureEventCatalog() {
    const deletedBuiltInSetting = await platformSettingModel
      .findOne({ key: DELETED_BUILT_IN_EVENTS_SETTING_KEY })
      .lean()
    const deletedBuiltInEventIds = normalizeDeletedBuiltInEventIds(
      deletedBuiltInSetting?.value,
    )

    await eventModel.init()
    const existingEvents = await eventModel.find({}).lean()
    const existingById = new Map(existingEvents.map((event) => [event.id, event]))
    const operations = currentEventCatalog
      .filter((event) => !deletedBuiltInEventIds.has(event.id))
      .map((event) => {
        const record = toEventRecord(event)
        const existing = existingById.get(event.id)
        const missingFields = existing
          ? Object.fromEntries(
              Object.entries(record).filter(
                ([field]) => !Object.hasOwn(existing, field),
              ),
            )
          : {}
        const insertFields = Object.fromEntries(
          Object.entries(record).filter(
            ([field]) => !Object.hasOwn(missingFields, field),
          ),
        )
        return {
          updateOne: {
            filter: { id: event.id },
            update: {
              $setOnInsert: insertFields,
              ...(Object.keys(missingFields).length > 0
                ? { $set: missingFields }
                : {}),
            },
            upsert: true,
          },
        }
      })

    if (operations.length === 0) {
      return
    }

    try {
      await eventModel.bulkWrite(operations, { ordered: false })
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

  async function markBuiltInEventDeleted(id) {
    if (!isBuiltInEventId(id)) {
      return false
    }
    await platformSettingModel.findOneAndUpdate(
      { key: DELETED_BUILT_IN_EVENTS_SETTING_KEY },
      { $addToSet: { value: id } },
      { upsert: true, new: true },
    )
    return true
  }

  return { ensureEventCatalog, markBuiltInEventDeleted }
}

const eventCatalogService = createEventCatalogService()

export const ensureEventCatalog = eventCatalogService.ensureEventCatalog
export const markBuiltInEventDeleted = eventCatalogService.markBuiltInEventDeleted

export async function listEvents() {
  return Event.find({})
    .where({ status: 'published' })
    .sort({ title: 1 })
    .lean()
}

export async function findEventById(id) {
  return Event.findOne({ id, status: 'published' }).lean()
}
