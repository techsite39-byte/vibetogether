import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteEventRecord } from '../src/routes/admin.js'

test('successful built-in deletion persists a tombstone only after hard deletion', async () => {
  const tombstones = []
  const record = { _id: '507f1f77bcf86cd799439011', id: 'after-hours-sing-along' }
  const eventModel = {
    async deleteOne(filter) {
      assert.deepEqual(filter, { _id: record._id })
      return { deletedCount: 1 }
    },
  }

  const result = await deleteEventRecord({
    record,
    eventModel,
    markDeleted: async (id) => tombstones.push(id),
  })

  assert.equal(result.status, 204)
  assert.deepEqual(tombstones, [record.id])
})

test('booking and enquiry links block deletion and tombstoning', async () => {
  let deleteCalls = 0
  let tombstoneCalls = 0
  const record = { _id: '507f1f77bcf86cd799439012', id: 'after-hours-sing-along' }
  const eventModel = {
    async deleteOne() {
      deleteCalls += 1
      return { deletedCount: 1 }
    },
  }

  const bookingResult = await deleteEventRecord({
    record,
    eventModel,
    bookingCount: 1,
    markDeleted: async () => { tombstoneCalls += 1 },
  })
  const enquiryResult = await deleteEventRecord({
    record,
    eventModel,
    enquiryCount: 1,
    markDeleted: async () => { tombstoneCalls += 1 },
  })

  assert.equal(bookingResult.status, 409)
  assert.equal(enquiryResult.status, 409)
  assert.equal(deleteCalls, 0)
  assert.equal(tombstoneCalls, 0)
})

test('custom event deletion does not create a built-in tombstone', async () => {
  let tombstoneCalls = 0
  const record = { _id: '507f1f77bcf86cd799439013', id: 'custom-event' }
  const eventModel = {
    async deleteOne() {
      return { deletedCount: 1 }
    },
  }
  const result = await deleteEventRecord({
    record,
    eventModel,
    markDeleted: async () => { tombstoneCalls += 1 },
  })

  assert.equal(result.status, 204)
  assert.equal(tombstoneCalls, 0)
})
