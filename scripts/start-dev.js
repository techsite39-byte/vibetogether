import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const backendDir = path.join(rootDir, 'backend')
const viteEntrypoint = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')

console.log('[DevRunner] Starting Vibe Together Backend & Frontend...')

if (!fs.existsSync(viteEntrypoint)) {
  throw new Error('Vite is not installed. Run npm install in the project root.')
}

const children = []
let shuttingDown = false

async function findAvailablePort(startPort) {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
    throw new Error('VITE_PORT must be an integer between 1 and 65535.')
  }

  for (let port = startPort; port <= 65535; port += 1) {
    const available = await new Promise((resolve, reject) => {
      const server = net.createServer()
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          resolve(false)
          return
        }
        reject(error)
      })
      server.listen(port, 'localhost', () => {
        server.close((error) => (error ? reject(error) : resolve(true)))
      })
    })

    if (available) return port
  }

  throw new Error('No available port was found for the Vite development server.')
}

function stopChildren(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = exitCode
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill()
  }
}

function startProcess(label, args, cwd, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  children.push(child)

  child.on('error', (error) => {
    console.error(`[DevRunner] Could not start ${label}:`, error.message)
    stopChildren(1)
  })

  child.on('exit', (code) => {
    if (shuttingDown) return
    if (code !== 0 && code !== null) {
      console.error(`[DevRunner] ${label} exited with code ${code}`)
    }
    stopChildren(code ?? 0)
  })

  return child
}

const vitePort = await findAvailablePort(Number(process.env.VITE_PORT ?? 5173))
const devFrontendOrigins = `http://localhost:${vitePort},http://127.0.0.1:${vitePort}`
startProcess('Backend', ['--watch-path=src', 'src/server.js'], backendDir, {
  DEV_FRONTEND_ORIGINS: devFrontendOrigins,
})
startProcess(
  'Vite',
  [viteEntrypoint, '--host', 'localhost', '--port', String(vitePort), '--strictPort'],
  rootDir,
)

function cleanup() {
  console.log('\n[DevRunner] Shutting down servers...')
  stopChildren(0)
}

process.once('SIGINT', cleanup)
process.once('SIGTERM', cleanup)
