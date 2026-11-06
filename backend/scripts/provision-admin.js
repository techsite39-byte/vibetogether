import { createInterface } from 'node:readline'
import mongoose from 'mongoose'
import { config } from '../src/config/env.js'
import { connectDatabase } from '../src/db/connect.js'
import { provisionAdminAccount } from '../src/services/adminSetup.js'

async function promptForPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command from an interactive terminal so the password is not echoed.')
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await new Promise((resolve, reject) => {
      let value = ''
      process.stdout.write('Admin password (12-256 characters; hidden): ')
      process.stdin.setRawMode(true)
      process.stdin.resume()
      const onData = (chunk) => {
        for (const character of chunk.toString('utf8')) {
          if (character === '\u0003') {
            reject(new Error('Cancelled.'))
            return
          }
          if (character === '\r' || character === '\n') {
            process.stdout.write('\n')
            process.stdin.off('data', onData)
            resolve(value)
            return
          }
          if (character === '\u007f' || character === '\b') {
            value = value.slice(0, -1)
          } else if (value.length < 256) {
            value += character
          }
        }
      }
      process.stdin.on('data', onData)
    })
  } finally {
    process.stdin.setRawMode(false)
    process.stdin.pause()
    prompt.close()
  }
}

if (!config.adminUsername || !config.adminSessionSecret) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_SESSION_SECRET in the backend environment first.')
}

let connected = false
try {
  const password = await promptForPassword()
  await connectDatabase(config.mongoUri, config.mongoDatabaseName)
  connected = true
  const result = await provisionAdminAccount({
    password,
    username: config.adminUsername,
  })
  process.stdout.write(
    result.created
      ? `Created admin account ${config.adminUsername} in admin-cred (role: ${result.role}).\n`
      : `Admin account ${config.adminUsername} already exists and the password was verified; no duplicate was created.\n`,
  )
} finally {
  if (connected) {
    await mongoose.disconnect()
  }
}
