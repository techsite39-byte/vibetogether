import assert from 'node:assert/strict'
import http from 'node:http'
import { Socket } from 'node:net'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { normalizeMediaBuffer } from '../src/models/mediaAsset.js'

test('normalizeMediaBuffer converts various binary representations into Node Buffer', () => {
  // 1. Raw Node.js Buffer
  const rawBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const norm1 = normalizeMediaBuffer(rawBuf)
  assert.ok(Buffer.isBuffer(norm1))
  assert.deepEqual(norm1, rawBuf)

  // 2. BSON Binary-like object with length method and read method
  const bsonBinary = {
    buffer: Buffer.from([1, 2, 3, 4, 5]),
    sub_type: 0,
    length() {
      return 5
    },
    read(offset, length) {
      return this.buffer.subarray(offset, offset + length)
    },
  }
  const norm2 = normalizeMediaBuffer(bsonBinary)
  assert.ok(Buffer.isBuffer(norm2))
  assert.equal(norm2.length, 5)
  assert.deepEqual(norm2, Buffer.from([1, 2, 3, 4, 5]))

  // 3. Uint8Array
  const uint8 = new Uint8Array([10, 20, 30])
  const norm3 = normalizeMediaBuffer(uint8)
  assert.ok(Buffer.isBuffer(norm3))
  assert.deepEqual(norm3, Buffer.from([10, 20, 30]))

  // 4. Null / undefined / empty
  const norm4 = normalizeMediaBuffer(null)
  assert.ok(Buffer.isBuffer(norm4))
  assert.equal(norm4.length, 0)
})

function dispatch(app, { method = 'GET', url = '/' }) {
  return new Promise((resolve) => {
    const socket = new Socket()
    const req = new http.IncomingMessage(socket)
    req.method = method
    req.url = url
    req.headers = { host: 'localhost' }

    const res = new http.ServerResponse(req)
    const chunks = []

    res.write = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return true
    }

    res.end = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const rawBody = Buffer.concat(chunks)
      const contentType = res.getHeader('content-type') || ''
      let parsedBody = rawBody
      if (contentType.includes('application/json')) {
        try {
          parsedBody = JSON.parse(rawBody.toString('utf8'))
        } catch {}
      }
      resolve({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body: parsedBody,
        rawBody,
      })
    }

    app(req, res)
  })
}

test('GET /api/media/:id successfully retrieves binary asset with correct headers', async () => {
  const assetId = '6afd831f36a155f3d5694376'
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // Mock BSON Binary object as returned by Mongoose .lean()
  const mockBsonData = {
    buffer: imageBytes,
    sub_type: 0,
    length() {
      return imageBytes.length
    },
    read(start, len) {
      return imageBytes.subarray(start, start + len)
    },
  }

  const mockMediaModel = {
    findById(id) {
      return {
        lean: async () => {
          if (String(id) === assetId) {
            return {
              _id: assetId,
              filename: 'img1.png',
              mimeType: 'image/png',
              size: imageBytes.length,
              data: mockBsonData,
            }
          }
          return null
        },
      }
    },
  }

  const app = createApp({
    mediaAssetModel: mockMediaModel,
    corsOrigins: ['http://localhost:5173'],
  })

  const res = await dispatch(app, { url: `/api/media/${assetId}` })

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'image/png')
  assert.equal(typeof res.headers['content-length'], 'string')
  assert.equal(res.headers['content-length'], String(imageBytes.length))
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable')
  assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin')
  assert.deepEqual(res.rawBody, imageBytes)
})

test('GET /api/media/:id returns 404 for missing media ID', async () => {
  const missingId = '6afd831f36a155f3d5694377'

  const mockMediaModel = {
    findById() {
      return {
        lean: async () => null,
      }
    },
  }

  const app = createApp({
    mediaAssetModel: mockMediaModel,
    corsOrigins: ['http://localhost:5173'],
  })

  const res = await dispatch(app, { url: `/api/media/${missingId}` })

  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.body, { message: 'Media not found.' })
})

test('GET /api/media/:id returns 404 for invalid ObjectId', async () => {
  const app = createApp({
    mediaAssetModel: { findById: () => ({ lean: async () => null }) },
    corsOrigins: ['http://localhost:5173'],
  })

  const res = await dispatch(app, { url: '/api/media/not-an-object-id' })

  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.body, { message: 'Media not found.' })
})

test('GET /api/media/:id forwards database error to error handler', async () => {
  const validId = '6afd831f36a155f3d5694376'
  const dbError = new Error('Database connection failed')

  const mockMediaModel = {
    findById() {
      return {
        lean: async () => {
          throw dbError
        },
      }
    },
  }

  const app = createApp({
    mediaAssetModel: mockMediaModel,
    corsOrigins: ['http://localhost:5173'],
  })

  const res = await dispatch(app, { url: `/api/media/${validId}` })

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, { message: 'Internal server error.' })
})
