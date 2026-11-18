import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deleteDemoEvent,
  updateDemoEvent,
  buildEventImageUpdate,
} from '../src/admin/data/adminEventOperations.js'
import {
  clearStoredSession,
  resolveMediaAssetUrl,
  saveStoredSession,
  uploadMediaImage,
} from '../src/admin/services/adminApi.js'

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

test('image upload reports read failures and sends valid data to the existing media endpoint', async () => {
  const originalFileReader = globalThis.FileReader
  const originalFetch = globalThis.fetch
  const requests = []
  let shouldFail = true
  globalThis.FileReader = class {
    readAsDataURL() {
      if (shouldFail) {
        this.onerror?.()
        return
      }
      this.result = 'data:image/png;base64,c2FtcGxl'
      this.onload?.({ target: this })
    }
  }
  globalThis.fetch = async (url, options) => {
    requests.push([url, options])
    return new Response(JSON.stringify({ id: 'test-media-id', relativeUrl: '/api/media/test-media-id' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  saveStoredSession({ token: 'test-token', csrfToken: 'test-csrf' })

  try {
    const file = new File([new Uint8Array([1, 2, 3])], 'sample.png', { type: 'image/png' })
    await assert.rejects(uploadMediaImage(file), /Failed to read image file/)
    assert.equal(requests.length, 0)

    shouldFail = false
    const uploaded = await uploadMediaImage(file)
    assert.equal(requests.length, 1)
    assert.equal(requests[0][0], '/api/admin/upload')
    assert.equal(requests[0][1].method, 'POST')
    assert.equal(JSON.parse(requests[0][1].body).data, 'data:image/png;base64,c2FtcGxl')
    assert.equal(uploaded.url, '/api/media/test-media-id')
  } finally {
    clearStoredSession()
    globalThis.fetch = originalFetch
    if (originalFileReader === undefined) {
      delete globalThis.FileReader
    } else {
      globalThis.FileReader = originalFileReader
    }
  }
})
