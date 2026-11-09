import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DIWALI_OFFER_DURATION_MS,
  createDiwaliOfferService,
} from '../src/services/diwaliOffer.js'

function createOfferModel() {
  let record = null
  return {
    async init() {},
    findOne() {
      return { lean: async () => record && structuredClone(record) }
    },
    async create(value) {
      record = structuredClone(value)
      return { toObject: () => structuredClone(record) }
    },
    findOneAndUpdate(_query, update) {
      record = { ...record, ...structuredClone(update.$set) }
      return { lean: async () => structuredClone(record) }
    },
    get record() {
      return record && structuredClone(record)
    },
  }
}

test('creates a persisted Diwali window of exactly 72 hours and does not reset it', async () => {
  const model = createOfferModel()
  let currentTime = new Date('2026-11-09T10:00:00.000Z')
  const service = createDiwaliOfferService({ model, now: () => new Date(currentTime) })

  const initial = await service.getOffer()
  const firstExpiry = model.record.expiresAt
  assert.equal(model.record.activationAt.getTime(), currentTime.getTime())
  assert.equal(firstExpiry.getTime() - model.record.activationAt.getTime(), DIWALI_OFFER_DURATION_MS)
  assert.equal(initial.active, true)
  assert.equal((await service.getPricing()).paymentAmountPaise, 24900)

  currentTime = new Date(currentTime.getTime() + DIWALI_OFFER_DURATION_MS)
  const expired = await service.getOffer()
  assert.equal(expired.status, 'expired')
  assert.equal((await service.getPricing()).paymentAmount, 299)
  assert.equal(model.record.expiresAt.getTime(), firstExpiry.getTime())
})

test('rejects offer dates that are not exactly 72 hours apart', async () => {
  const model = createOfferModel()
  const service = createDiwaliOfferService({ model })

  await assert.rejects(
    service.updateOffer({
      enabled: true,
      regularPrice: 299,
      offerPrice: 249,
      activationAt: '2026-11-09T10:00:00.000Z',
      expiresAt: '2026-11-12T10:01:00.000Z',
    }),
    /exactly 72 hours/,
  )
})

test('admin offer updates preserve the configured prices and exact 72-hour window', async () => {
  const model = createOfferModel()
  const service = createDiwaliOfferService({
    model,
    now: () => new Date('2026-11-10T10:00:00.000Z'),
  })

  const saved = await service.updateOffer({
    enabled: true,
    regularPrice: 299,
    offerPrice: 249,
    activationAt: '2026-11-09T10:00:00.000Z',
    expiresAt: '2026-11-12T10:00:00.000Z',
  })

  assert.equal(saved.savings, 50)
  assert.equal(saved.status, 'active')
  assert.equal(
    new Date(saved.expiresAt).getTime() - new Date(saved.activationAt).getTime(),
    DIWALI_OFFER_DURATION_MS,
  )
})
