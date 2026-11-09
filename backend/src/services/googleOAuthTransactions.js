import { createHash } from 'node:crypto'
import { GoogleOAuthTransaction } from '../models/adminRecords.js'

const transactionLifetimeMs = 10 * 60 * 1000

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function createGoogleOAuthTransactionStore(model = GoogleOAuthTransaction) {
  return {
    async create({ state, browserBinding, frontendOrigin }) {
      const expiresAt = new Date(Date.now() + transactionLifetimeMs)
      await model.create({
        stateHash: hash(state),
        browserBindingHash: hash(browserBinding),
        frontendOrigin,
        expiresAt,
      })

      return { expiresAt }
    },
    async consume({ state, browserBinding }) {
      const stateHash = hash(state)
      const browserBindingHash = hash(browserBinding)
      const now = new Date()
      const transaction = await model.findOneAndDelete({
        stateHash,
        browserBindingHash,
        expiresAt: { $gt: now },
      }).lean()

      if (transaction) {
        return { transaction, error: '' }
      }

      const expired = await model.exists({
        stateHash,
        expiresAt: { $lte: now },
      })
      return { transaction: null, error: expired ? 'expired' : 'invalid' }
    },
  }
}

const defaultStore = createGoogleOAuthTransactionStore()
export const createGoogleOAuthTransaction = defaultStore.create
export const consumeGoogleOAuthTransaction = defaultStore.consume
