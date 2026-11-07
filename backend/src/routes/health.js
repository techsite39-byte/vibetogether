import { Router } from 'express'
import mongoose from 'mongoose'

const router = Router()

// GET /api/health - Main liveness health check
router.get('/', (request, response) => {
  response.status(200).json({
    status: 'ok',
    message: 'Backend is running',
    port: request.socket.localPort,
  })
})

// GET /api/health/ready - Readiness check for database connectivity
router.get('/ready', (_request, response) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1
  response.status(isDatabaseConnected ? 200 : 503).json({
    status: isDatabaseConnected ? 'ready' : 'unavailable',
    database: isDatabaseConnected ? 'connected' : 'disconnected',
  })
})

export default router
