import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createGoogleOAuthTransactionStore } from '../src/services/googleOAuthTransactions.js'

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

test('OAuth transactions persist only hashes and are atomically consumed once', async () => {
  const records = new Map()
  let consumeQuery
  const model = {
    async create(record) {
      records.set(record.stateHash, record)
    },
    findOneAndDelete(query) {
      consumeQuery = query
      return {
        async lean() {
          const record = records.get(query.stateHash)
          if (
            !record ||
            record.browserBindingHash !== query.browserBindingHash ||
            record.expiresAt <= query.expiresAt.$gt
          ) {
            return null
          }
          records.delete(query.stateHash)
          return record
        },
      }
    },
    async exists(query) {
      const record = records.get(query.stateHash)
      return Boolean(record && record.expiresAt <= query.expiresAt.$lte)
    },
  }
  const store = createGoogleOAuthTransactionStore(model)
  const transaction = {
    state: 'random-oauth-state-value',
    browserBinding: 'random-browser-binding-value',
    frontendOrigin: 'https://www.vibetogether.show',
  }

  await store.create(transaction)
  const stored = records.get(digest(transaction.state))
  assert.ok(stored)
  assert.equal(stored.stateHash, digest(transaction.state))
  assert.equal(stored.browserBindingHash, digest(transaction.browserBinding))
  assert.equal(stored.frontendOrigin, transaction.frontendOrigin)
  assert.equal(stored.stateHash.includes(transaction.state), false)
  assert.equal(stored.browserBindingHash.includes(transaction.browserBinding), false)
  assert.ok(stored.expiresAt.getTime() > Date.now())

  const consumed = await store.consume({
    state: transaction.state,
    browserBinding: transaction.browserBinding,
  })
  assert.equal(consumed.transaction.frontendOrigin, transaction.frontendOrigin)
  assert.equal(consumeQuery.stateHash, digest(transaction.state))
  assert.equal(consumeQuery.browserBindingHash, digest(transaction.browserBinding))
  assert.ok(consumeQuery.expiresAt.$gt instanceof Date)

  const replay = await store.consume({
    state: transaction.state,
    browserBinding: transaction.browserBinding,
  })
  assert.deepEqual(replay, { transaction: null, error: 'invalid' })
})

test('OAuth transactions expire and reject a mismatched browser binding', async () => {
  const records = new Map()
  const model = {
    async create(record) {
      records.set(record.stateHash, record)
    },
    findOneAndDelete(query) {
      return {
        async lean() {
          const record = records.get(query.stateHash)
          if (
            !record ||
            record.browserBindingHash !== query.browserBindingHash ||
            record.expiresAt <= query.expiresAt.$gt
          ) {
            return null
          }
          records.delete(query.stateHash)
          return record
        },
      }
    },
    async exists(query) {
      const record = records.get(query.stateHash)
      return Boolean(record && record.expiresAt <= query.expiresAt.$lte)
    },
  }
  const store = createGoogleOAuthTransactionStore(model)
  await store.create({
    state: 'state-for-expiry',
    browserBinding: 'original-browser',
    frontendOrigin: 'https://www.vibetogether.show',
  })

  const invalidBinding = await store.consume({
    state: 'state-for-expiry',
    browserBinding: 'different-browser',
  })
  assert.deepEqual(invalidBinding, { transaction: null, error: 'invalid' })

  const stored = records.get(digest('state-for-expiry'))
  stored.expiresAt = new Date(Date.now() - 1)
  const expired = await store.consume({
    state: 'state-for-expiry',
    browserBinding: 'original-browser',
  })
  assert.deepEqual(expired, { transaction: null, error: 'expired' })
})
