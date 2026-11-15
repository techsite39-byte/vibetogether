import assert from 'node:assert/strict'
import { test } from 'node:test'

async function loadBookingService() {
  return import(`../src/services/bookingEnquiry.js?test=${Math.random()}`)
}

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
  }
}

test('public events are cached briefly without sharing mutable result objects', async () => {
  const { getBookingEvents } = await loadBookingService()
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  let fetchCount = 0
  let now = 1_000
  Date.now = () => now
  globalThis.fetch = async () => {
    fetchCount += 1
    return jsonResponse({
      events: [{ id: 'event-1', title: 'Sing Along' }],
    })
  }

  try {
    const firstResult = await getBookingEvents()
    firstResult[0].title = 'Changed locally'
    const secondResult = await getBookingEvents()

    assert.equal(fetchCount, 1)
    assert.equal(secondResult[0].title, 'Sing Along')
    assert.notEqual(firstResult, secondResult)

    const abortedRequest = new AbortController()
    abortedRequest.abort()
    await assert.rejects(getBookingEvents(abortedRequest.signal), {
      name: 'AbortError',
    })

    now += 30_001
    await getBookingEvents()
    assert.equal(fetchCount, 2)
  } finally {
    globalThis.fetch = originalFetch
    Date.now = originalNow
  }
})

test('failed public event requests are not cached', async () => {
  const { getBookingEvents } = await loadBookingService()
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  globalThis.fetch = async () => {
    fetchCount += 1
    return fetchCount === 1
      ? jsonResponse({}, { ok: false, status: 503 })
      : jsonResponse({ events: [{ id: 'event-1', title: 'Sing Along' }] })
  }

  try {
    await assert.rejects(getBookingEvents(), /temporarily unavailable/)
    const events = await getBookingEvents()

    assert.equal(fetchCount, 2)
    assert.equal(events[0].title, 'Sing Along')
  } finally {
    globalThis.fetch = originalFetch
  }
})
