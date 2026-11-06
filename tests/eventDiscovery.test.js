import test from 'node:test'
import assert from 'node:assert/strict'
import { filterEvents } from '../src/utils/eventDiscovery.js'

const sampleEvents = [
  {
    id: 'sing-paid',
    title: 'After Hours',
    category: 'Sing Along',
    location: 'North Hall',
    isFree: false,
    priceAmount: 25,
    startsAt: '2026-12-01T18:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'meet-free',
    title: 'Open Table',
    category: 'Strangers Meet',
    location: 'Riverside',
    isFree: true,
    priceAmount: 0,
    startsAt: '2026-12-02T18:00:00Z',
    createdAt: '2026-10-03T00:00:00Z',
  },
  {
    id: 'game-paid',
    title: 'Friendly Games',
    category: 'Fun Games',
    location: 'North Hall',
    isFree: false,
    priceAmount: 10,
    startsAt: '2026-10-01T18:00:00Z',
    createdAt: '2026-10-02T00:00:00Z',
  },
]

test('search matches event title, location, and category without case sensitivity', () => {
  assert.deepEqual(
    filterEvents(sampleEvents, { query: 'NORTH HALL' }).map((event) => event.id),
    ['game-paid', 'sing-paid'],
  )
  assert.deepEqual(
    filterEvents(sampleEvents, { query: 'strangers meet' }).map(
      (event) => event.id,
    ),
    ['meet-free'],
  )
})

test('category and price filters combine, and both selected prices include all', () => {
  assert.deepEqual(
    filterEvents(sampleEvents, {
      category: 'Sing Along',
      pricing: ['free'],
    }),
    [],
  )
  assert.deepEqual(
    filterEvents(sampleEvents, { pricing: ['free', 'paid'] }).map(
      (event) => event.id,
    ),
    ['game-paid', 'sing-paid', 'meet-free'],
  )
})

test('upcoming filtering uses provided current time and results are sorted', () => {
  assert.deepEqual(
    filterEvents(sampleEvents, {
      upcomingOnly: true,
      now: Date.parse('2026-11-01T00:00:00Z'),
    }).map((event) => event.id),
    ['sing-paid', 'meet-free'],
  )
  assert.deepEqual(
    filterEvents(sampleEvents, { sortBy: 'price-low' }).map(
      (event) => event.id,
    ),
    ['meet-free', 'game-paid', 'sing-paid'],
  )
  assert.deepEqual(
    filterEvents(sampleEvents, { sortBy: 'newest' }).map((event) => event.id),
    ['meet-free', 'game-paid', 'sing-paid'],
  )
})
