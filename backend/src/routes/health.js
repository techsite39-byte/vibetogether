import { Router } from 'express'
import mongoose from 'mongoose'

const router = Router()

router.get('/', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

router.get('/ready', (_request, response) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1
  response.status(isDatabaseConnected ? 200 : 503).json({
    status: isDatabaseConnected ? 'ready' : 'unavailable',
    database: isDatabaseConnected ? 'connected' : 'disconnected',
  })
})

export default router
