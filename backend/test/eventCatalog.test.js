import assert from 'node:assert/strict'
import { test } from 'node:test'
import { events as builtInEvents } from '../../src/data/events.js'
import {
  createEventCatalogService,
  DELETED_BUILT_IN_EVENTS_SETTING_KEY,
} from '../src/services/events.js'

function createEventModel(existingEvents = []) {
  const model = {
    initCalls: 0,
    bulkWriteCalls: [],
    async init() {
      this.initCalls += 1
    },
    find(query) {
      assert.deepEqual(query, {})
      return { lean: async () => structuredClone(existingEvents) }
    },
    async bulkWrite(operations, options) {
      this.bulkWriteCalls.push({ operations, options })
    },
  }
  return model
}

function createPlatformSettingModel(value) {
  const model = {
    findOneCalls: [],
    updateCalls: [],
    findOne(query) {
      this.findOneCalls.push(query)
      return {
        lean: async () =>
          value === undefined ? null : { key: query.key, value: structuredClone(value) },
      }
    },
    async findOneAndUpdate(query, update, options) {
      this.updateCalls.push({ query, update, options })
    },
  }
  return model
}

test('startup skips a tombstoned built-in and still upserts other catalog entries', async () => {
  const deletedId = builtInEvents[0].id
  const retainedMissingEvent = builtInEvents[1]
  const eventModel = createEventModel()
  const platformSettingModel = createPlatformSettingModel([deletedId])
  const service = createEventCatalogService({ eventModel, platformSettingModel })

  await service.ensureEventCatalog()

  assert.deepEqual(platformSettingModel.findOneCalls, [
    { key: DELETED_BUILT_IN_EVENTS_SETTING_KEY },
  ])
  assert.equal(eventModel.initCalls, 1)
  assert.equal(eventModel.bulkWriteCalls.length, 1)
  const { operations, options } = eventModel.bulkWriteCalls[0]
  const upsertIds = operations.map(({ updateOne }) => updateOne.filter.id)
  assert.equal(upsertIds.includes(deletedId), false)
  assert.equal(upsertIds.includes(retainedMissingEvent.id), true)
  assert.equal(options.ordered, false)
  const retainedUpsert = operations.find(
    ({ updateOne }) => updateOne.filter.id === retainedMissingEvent.id,
  ).updateOne
  assert.equal(retainedUpsert.upsert, true)
  assert.ok(retainedUpsert.update.$setOnInsert.title)
})

test('startup seeds a missing built-in when no tombstone setting exists', async () => {
  const missingEvent = builtInEvents[0]
  const eventModel = createEventModel()
  const platformSettingModel = createPlatformSettingModel()
  const service = createEventCatalogService({ eventModel, platformSettingModel })

  await service.ensureEventCatalog()

  const { operations } = eventModel.bulkWriteCalls[0]
  assert.ok(
    operations.some(({ updateOne }) => updateOne.filter.id === missingEvent.id),
  )
})

test('only built-in event IDs can be tombstoned and persistence errors propagate', async () => {
  const builtInId = builtInEvents[0].id
  const platformSettingModel = createPlatformSettingModel()
  const service = createEventCatalogService({
    eventModel: createEventModel(),
    platformSettingModel,
  })

  assert.equal(await service.markBuiltInEventDeleted('custom-event'), false)
  assert.equal(platformSettingModel.updateCalls.length, 0)
  assert.equal(await service.markBuiltInEventDeleted(builtInId), true)
  assert.deepEqual(platformSettingModel.updateCalls[0], {
    query: { key: DELETED_BUILT_IN_EVENTS_SETTING_KEY },
    update: { $addToSet: { value: builtInId } },
    options: { upsert: true, new: true },
  })

  const failingService = createEventCatalogService({
    eventModel: createEventModel(),
    platformSettingModel: {
      async findOneAndUpdate() {
        throw new Error('setting persistence failed')
      },
    },
  })
  await assert.rejects(
    failingService.markBuiltInEventDeleted(builtInId),
    /setting persistence failed/,
  )
})
