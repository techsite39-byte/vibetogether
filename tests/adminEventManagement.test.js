import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deleteDemoEvent,
  updateDemoEvent,
  buildEventImageUpdate,
} from '../src/admin/data/adminEventOperations.js'
import { resolveMediaAssetUrl } from '../src/admin/services/adminApi.js'

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

test('event image updates changed and cleared posters while omitting unchanged legacy values', () => {
  assert.deepEqual(
    buildEventImageUpdate('/legacy/poster.webp', '/api/media/new-poster'),
    { image: '/api/media/new-poster' },
  )
  assert.deepEqual(buildEventImageUpdate('/legacy/poster.webp', ''), { image: '' })
  assert.deepEqual(buildEventImageUpdate('/legacy/poster.webp', '/legacy/poster.webp'), {})
  assert.deepEqual(buildEventImageUpdate(' https://example.test/poster.webp ', 'https://example.test/poster.webp'), {})
})

test('uploaded media URLs resolve through the configured HTTPS API host', () => {
  assert.equal(
    resolveMediaAssetUrl('/api/media/asset-id', 'https://api.example.test/api'),
    'https://api.example.test/api/media/asset-id',
  )
  assert.equal(
    resolveMediaAssetUrl('/api/media/asset-id', '/api'),
    '/api/media/asset-id',
  )
  assert.equal(
    resolveMediaAssetUrl('https://cdn.example.test/poster.webp', 'https://api.example.test/api'),
    'https://cdn.example.test/poster.webp',
  )
  assert.equal(
    resolveMediaAssetUrl('/legacy/poster.webp', 'https://api.example.test/api'),
    '/legacy/poster.webp',
  )
})
