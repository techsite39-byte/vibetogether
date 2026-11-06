import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { hashAdminPassword } from '../src/auth/adminAuth.js'

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  throw new Error('Run this command from an interactive terminal so the password is not echoed.')
}

const prompt = createInterface({ input: process.stdin, output: process.stdout })
const password = await new Promise((resolve, reject) => {
  let value = ''
  process.stdout.write('Admin password (12+ characters; hidden): ')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', (chunk) => {
    for (const character of chunk.toString('utf8')) {
      if (character === '\u0003') {
        reject(new Error('Cancelled.'))
        return
      }
      if (character === '\r' || character === '\n') {
        process.stdout.write('\n')
        resolve(value)
        return
      }
      if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1)
      } else if (value.length < 256) {
        value += character
      }
    }
  })
})

process.stdin.setRawMode(false)
process.stdin.pause()
prompt.close()
const passwordHash = await hashAdminPassword(password)
const sessionSecret = randomBytes(48).toString('base64url')
process.stdout.write(`ADMIN_PASSWORD_HASH=${passwordHash}\n`)
process.stdout.write(`ADMIN_SESSION_SECRET=${sessionSecret}\n`)
