import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import { config } from '../src/config/env.js'
import { connectDatabase } from '../src/db/connect.js'
import {
  AdminCredential,
  AdminSession,
  PasswordReset,
} from '../src/models/adminRecords.js'
import { hashAdminPassword } from '../src/auth/adminAuth.js'

function promptHidden(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password is not echoed.')
  }

  return new Promise((resolve, reject) => {
    let value = ''
    let finished = false
    const cleanup = () => {
      if (finished) return
      finished = true
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
    }
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup()
          process.stdout.write('\n')
          reject(new Error('Cancelled.'))
          return
        }
        if (character === '\r' || character === '\n') {
          cleanup()
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('')
        } else if (value.length < 256) {
          value += character
        }
      }
    }

    process.stdout.write(label)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

function replaceEnvValues(contents, replacements) {
  const lines = contents.split(/\r?\n/)
  for (const [name, value] of Object.entries(replacements)) {
    const matchingLines = lines
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => new RegExp(`^\\s*${name}\\s*=`).test(line))
    if (matchingLines.length !== 1) {
      throw new Error(`Expected exactly one ${name} setting in backend/.env.`)
    }

    const { index, line } = matchingLines[0]
    lines[index] = line.replace(
      /^(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*).*$/,
      (_match, prefix) => `${prefix}${value}`,
    )
  }
  return lines.join('\n')
}

function writeEnvAtomically(envPath, contents) {
  const temporaryPath = `${envPath}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    fs.renameSync(temporaryPath, envPath)
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    throw error
  }
}

const [targetEmailArgument, currentEmailArgument] = process.argv.slice(2)
const targetEmail = targetEmailArgument?.trim().toLowerCase()
const currentEmail = (currentEmailArgument || config.adminUsername).trim().toLowerCase()
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

if (process.argv.length > 4 || !isEmail(targetEmail ?? '') || !isEmail(currentEmail)) {
  console.error(
    'Usage: npm run admin:set-password -- <new-super-admin-email> [current-super-admin-email]',
  )
  process.exitCode = 1
} else {
  let connected = false
  let admin
  let previousValues
  let credentialChanged = false

  try {
    const password = await promptHidden('New admin password (12-256 characters; hidden): ')
    const confirmation = await promptHidden('Confirm new admin password: ')
    if (password !== confirmation) {
      throw new Error('Passwords do not match; no changes were made.')
    }
    const passwordHash = await hashAdminPassword(password)

    await connectDatabase(config.mongoUri, config.mongoDatabaseName)
    connected = true

    admin = await AdminCredential.findOne({
      $or: [{ email: currentEmail }, { username: currentEmail }],
    })
      .select('+passwordHash email username role status active emailVerified')
      .exec()

    if (!admin || admin.role !== 'super_admin') {
      throw new Error('The current email does not identify an existing super-admin account.')
    }

    const targetAccount = await AdminCredential.findOne({
      $or: [{ email: targetEmail }, { username: targetEmail }],
    }).select('_id').exec()
    if (targetAccount && String(targetAccount._id) !== String(admin._id)) {
      throw new Error('The new email is already assigned to another admin account.')
    }

    const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
    const originalEnv = fs.readFileSync(envPath, 'utf8')
    const updatedEnv = replaceEnvValues(originalEnv, {
      ADMIN_EMAIL: targetEmail,
      ADMIN_PASSWORD_HASH: passwordHash,
    })

    previousValues = {
      email: admin.email,
      username: admin.username,
      passwordHash: admin.passwordHash,
      emailVerified: admin.emailVerified,
    }
    admin.email = targetEmail
    admin.username = targetEmail
    admin.passwordHash = passwordHash
    admin.emailVerified = true
    await admin.save()
    credentialChanged = true

    await AdminSession.deleteMany({ adminId: admin._id })
    await PasswordReset.deleteMany({ adminId: admin._id })
    writeEnvAtomically(envPath, updatedEnv)

    console.log(`Super-admin credentials updated for ${targetEmail}. Existing sessions were revoked.`)
  } catch (error) {
    if (credentialChanged && admin && previousValues) {
      try {
        Object.assign(admin, previousValues)
        await admin.save()
      } catch (rollbackError) {
        console.error('Credential update failed and database rollback also failed:', rollbackError.message)
      }
    }
    console.error('Failed to update super-admin credentials:', error.message)
    process.exitCode = 1
  } finally {
    if (connected) await mongoose.disconnect()
  }
}
