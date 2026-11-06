import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deleteDemoEvent,
  updateDemoEvent,
} from '../src/admin/data/adminEventOperations.js'

const demoEvents = [
  { id: 'sing-along', title: 'Sing Along', status: 'pending' },
  { id: 'fun-games', title: 'Fun Games', status: 'published' },
]

test('event management updates the selected event without mutating existing data', () => {
  const updatedEvents = updateDemoEvent(demoEvents, 'sing-along', {
    title: 'Sing Along Together',
    status: 'published',
  })

  assert.deepEqual(updatedEvents, [
    { id: 'sing-along', title: 'Sing Along Together', status: 'published' },
    demoEvents[1],
  ])
  assert.equal(demoEvents[0].title, 'Sing Along')
  assert.equal(demoEvents[0].status, 'pending')
})

test('event management deletes only the selected event', () => {
  assert.deepEqual(deleteDemoEvent(demoEvents, 'sing-along'), [demoEvents[1]])
  assert.deepEqual(deleteDemoEvent(demoEvents, 'missing'), demoEvents)
})
