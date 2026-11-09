import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextBookingReference } from '../src/services/bookingReferences.js'

function createReferenceModel(records) {
  return {
    find() {
      return { lean: async () => records }
    },
  }
}

function createCounterModel(initialValue = null) {
  const record = { value: initialValue }
  return {
    async findOneAndUpdate(_filter, update) {
      if (update.$setOnInsert && record.value === null) {
        record.value = update.$setOnInsert.value
      }
      if (update.$inc) {
        record.value += update.$inc.value
      }
      return { ...record }
    },
    async updateOne(_filter, update) {
      if (update.$max.value > record.value) {
        record.value = update.$max.value
      }
    },
  }
}

test('starts at the required reference and preserves higher legacy numeric references', async () => {
  const bookingModel = createReferenceModel([])
  const enquiryModel = createReferenceModel([{ reference: '10812026509' }])
  const counterModel = createCounterModel()

  assert.equal(await nextBookingReference({ bookingModel, bookingEnquiryModel: enquiryModel, counterModel }), '10812026510')
})

test('allocates distinct sequential references from the shared atomic counter', async () => {
  const bookingModel = createReferenceModel([])
  const enquiryModel = createReferenceModel([])
  const counterModel = createCounterModel()

  const references = await Promise.all([
    nextBookingReference({ bookingModel, bookingEnquiryModel: enquiryModel, counterModel }),
    nextBookingReference({ bookingModel, bookingEnquiryModel: enquiryModel, counterModel }),
  ])
  assert.deepEqual(references.sort(), ['10812026501', '10812026502'])
})
