import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

const customLogger = createLogger()
const originalError = customLogger.error.bind(customLogger)

customLogger.error = (msg, options) => {
  if (
    options?.error?.code === 'ECONNREFUSED' &&
    typeof msg === 'string' &&
    msg.includes('http proxy error')
  ) {
    // Suppress noisy stack traces during backend startup/restarts
    return
  }
  originalError(msg, options)
}

// https://vite.dev/config/
export default defineConfig({
  customLogger,
  plugins: [react()],
  build: {
    assetsDir: 'build-assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (err.code === 'ECONNREFUSED' && res && !res.headersSent && !res.writableEnded) {
              if (typeof res.writeHead === 'function') {
                res.writeHead(503, {
                  'Content-Type': 'application/json',
                  'Retry-After': '2',
                })
                res.end(
                  JSON.stringify({
                    error: 'Backend is warming up or temporarily unavailable. Please retry in a moment.',
                  }),
                )
              }
            }
          })
        },
      },
    },
  },
})
