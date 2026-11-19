import mongoose from 'mongoose'
import { config } from '../src/config/env.js'
import { connectDatabase } from '../src/db/connect.js'
import {
  isCompletedBookingPaymentStatus,
  normalizeBookingPaymentStatus,
} from '../../src/utils/paymentStatus.js'

function validDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function documentKey(record) {
  if (record._id != null) return `_id:${String(record._id)}`
  if (record.requestId) return `requestId:${record.requestId}`
  if (record.reference) return `reference:${record.reference}`
  return null
}

function isDuplicateKeyBulkError(error) {
  const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : []
  if (writeErrors.length > 0) {
    return (
      writeErrors.every((writeError) => writeError.code === 11000) &&
      !(error.writeConcernErrors?.length > 0)
    )
  }
  return error?.code === 11000
}

/**
 * Migrates booking records from `user-db` into `bookings-db` idempotently.
 *
 * Guarantees:
 * 1. Preserves booking data and original identifiers; blank references are omitted to avoid unique-index collisions.
 * 2. Matches all available identifiers and reports conflicting target matches.
 * 3. Promotes an existing booking to paid only when its status is absent or its source is newer.
 * 4. Dry-run mode by default; requires explicit `--execute` flag to apply writes.
 */
export async function migrateBookings({
  db,
  sourceCollectionName = 'user-db',
  targetCollectionName = 'bookings-db',
  dryRun = true,
  retryDuplicateKeyRace = true,
} = {}) {
  const sourceCol = db.collection(sourceCollectionName)
  const targetCol = db.collection(targetCollectionName)

  const sourceRecords = await sourceCol.find({}).sort({ createdAt: 1 }).toArray()
  const targetCountBefore = await targetCol.countDocuments()

  const report = {
    timestamp: new Date().toISOString(),
    dryRun,
    sourceCollection: sourceCollectionName,
    targetCollection: targetCollectionName,
    totalScanned: sourceRecords.length,
    targetCountBefore,
    targetCountAfter: targetCountBefore,
    readyToInsert: 0,
    alreadyPresent: 0,
    updated: 0,
    duplicateKeyRaceRecovered: false,
    stateConflicts: [],
    unmigrated: [],
  }

  const sourceIdentityOwners = new Map()
  const conflictingSourceRecords = new Set()
  for (let index = 0; index < sourceRecords.length; index += 1) {
    const record = sourceRecords[index]
    const reference = typeof record.reference === 'string'
      ? record.reference.trim()
      : record.reference
    const identities = [record.requestId, reference, record._id]
      .filter((value) => value != null && String(value).trim() !== '')
      .map(String)
    for (const identity of new Set(identities)) {
      const owner = sourceIdentityOwners.get(identity)
      if (owner === undefined) {
        sourceIdentityOwners.set(identity, index)
      } else if (owner !== index) {
        conflictingSourceRecords.add(owner)
        conflictingSourceRecords.add(index)
      }
    }
  }

  const operations = []

  for (let index = 0; index < sourceRecords.length; index += 1) {
    const record = sourceRecords[index]
    const sourceRecordNumber = index + 1
    if (conflictingSourceRecords.has(index)) {
      report.unmigrated.push({
        sourceRecordNumber,
        reason: 'Source identifiers collide with another source record.',
      })
      continue
    }
    const reference = typeof record.reference === 'string'
      ? record.reference.trim()
      : record.reference
    const identifier =
      record.requestId || reference || (record._id ? String(record._id) : null)

    if (!identifier) {
      report.unmigrated.push({
        sourceRecordNumber,
        reason: 'Document lacks a valid identifier (no requestId, reference, or _id).',
      })
      continue
    }

    const identityEntries = [
      ['requestId', record.requestId],
      ['reference', reference],
      ['_id', record._id],
    ].filter(([, value]) => value != null && value !== '')
    const targetMatches = await Promise.all(identityEntries.map(async ([field, value]) => ({
      field,
      record: await targetCol.findOne({ [field]: value }),
    })))
    const uniqueMatches = new Map()
    for (const match of targetMatches) {
      if (!match.record) continue
      const key = documentKey(match.record)
      uniqueMatches.set(key || `match:${uniqueMatches.size}`, match.record)
    }

    if (uniqueMatches.size > 1) {
      report.unmigrated.push({
        sourceRecordNumber,
        reason: 'Source identifiers match multiple target records.',
      })
      continue
    }

    const existingTarget = uniqueMatches.values().next().value ?? null
    const targetMatchedByRequestId = existingTarget && targetMatches.some(
      ({ field, record: match }) =>
        field === 'requestId' && match && documentKey(match) === documentKey(existingTarget),
    )
    if (
      existingTarget &&
      record.requestId &&
      existingTarget.requestId &&
      existingTarget.requestId !== record.requestId &&
      !targetMatchedByRequestId
    ) {
      report.unmigrated.push({
        sourceRecordNumber,
        reason: 'A secondary identifier matches a target with a different request ID.',
      })
      continue
    }

    const sourceQuery = record.requestId
      ? { requestId: record.requestId }
      : reference
        ? { reference }
        : { _id: record._id }
    const targetQuery = existingTarget
      ? existingTarget.requestId
        ? { requestId: existingTarget.requestId }
        : existingTarget.reference
          ? { reference: existingTarget.reference }
          : { _id: existingTarget._id }
      : sourceQuery

    const sourcePaymentStatus = normalizeBookingPaymentStatus(record.paymentStatus)
    const sourceIsPaid = isCompletedBookingPaymentStatus(sourcePaymentStatus)

    if (!existingTarget) {
      report.readyToInsert += 1

      if (!dryRun) {
        const recordToInsert = { ...record, paymentStatus: sourcePaymentStatus }
        if (reference) recordToInsert.reference = reference
        else delete recordToInsert.reference
        if (sourceIsPaid) delete recordToInsert.expiresAt
        operations.push({
          updateOne: {
            filter: targetQuery,
            update: { $setOnInsert: recordToInsert },
            upsert: true,
          },
        })
      }
    } else {
      // Check if target should be safely enriched without overwriting newer state
      const targetPaymentStatus = normalizeBookingPaymentStatus(existingTarget.paymentStatus)
      const targetIsPaid = isCompletedBookingPaymentStatus(targetPaymentStatus)
      const targetStatusMissing =
        existingTarget.paymentStatus == null || existingTarget.paymentStatus === ''
      const sourceUpdatedAt = validDate(record.updatedAt)
      const targetUpdatedAt = validDate(existingTarget.updatedAt)
      const sourceIsNewer = Boolean(
        sourceUpdatedAt && targetUpdatedAt && sourceUpdatedAt > targetUpdatedAt,
      )
      const uncertainPaidState =
        sourceIsPaid && !targetIsPaid && !targetStatusMissing && !sourceIsNewer

      const missingFields = {}
      const paymentStateFields = new Set([
        'paymentStatus',
        'status',
        'reference',
        'paidAt',
        'paymentVerifiedAt',
        'paymentFailureReason',
        'cfPaymentId',
        'cfPaymentStatus',
        'paymentProvider',
        'paymentOrderId',
        'paymentOrders',
        'cfOrderId',
        'cfPaymentSessionId',
        'expiresAt',
        'updatedAt',
      ])
      for (const [key, value] of Object.entries(record)) {
        if (key === '_id') continue
        if (uncertainPaidState && paymentStateFields.has(key)) continue
        const sourceValue = key === 'reference' ? reference : value
        if (
          existingTarget[key] === undefined ||
          existingTarget[key] === null ||
          existingTarget[key] === ''
        ) {
          if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
            missingFields[key] = sourceValue
          }
        }
      }

      if (targetPaymentStatus !== existingTarget.paymentStatus) {
        missingFields.paymentStatus = targetPaymentStatus
      } else if (missingFields.paymentStatus !== undefined) {
        missingFields.paymentStatus = sourcePaymentStatus
      }

      if (uncertainPaidState) {
        report.stateConflicts.push({
          sourceRecordNumber,
          reason: 'Paid source state lacks a strictly newer updatedAt timestamp.',
        })
      }

      // If source is paid but target is not, enrich payment state
      const applySourcePaidState =
        sourceIsPaid && !targetIsPaid && (targetStatusMissing || sourceIsNewer)
      if (applySourcePaidState) {
        missingFields.paymentStatus = sourcePaymentStatus
        missingFields.status = record.status || 'confirmed'
        missingFields.paidAt = record.paidAt || new Date()
        missingFields.paymentVerifiedAt = record.paymentVerifiedAt || new Date()
        if (reference && !existingTarget.reference) {
          missingFields.reference = reference
        }
      }

      const unsetExpiry =
        (targetIsPaid || applySourcePaidState) &&
        Object.prototype.hasOwnProperty.call(existingTarget, 'expiresAt')
      const unsetEmptyReference =
        typeof existingTarget.reference === 'string' &&
        !existingTarget.reference.trim() &&
        missingFields.reference === undefined
      if (Object.keys(missingFields).length > 0 || unsetExpiry || unsetEmptyReference) {
        report.updated += 1
        if (!dryRun) {
          const update = {}
          if (Object.keys(missingFields).length > 0) update.$set = missingFields
          if (unsetExpiry || unsetEmptyReference) {
            update.$unset = {}
            if (unsetExpiry) update.$unset.expiresAt = 1
            if (unsetEmptyReference) update.$unset.reference = 1
          }
          operations.push({
            updateOne: {
              filter: targetQuery,
              update,
            },
          })
        }
      } else {
        report.alreadyPresent += 1
      }
    }
  }

  if (!dryRun && operations.length > 0) {
    try {
      const result = await targetCol.bulkWrite(operations, { ordered: false })
      report.bulkResult = {
        upsertedCount: result.upsertedCount,
        modifiedCount: result.modifiedCount,
      }
      report.targetCountAfter = await targetCol.countDocuments()
    } catch (error) {
      if (!retryDuplicateKeyRace || !isDuplicateKeyBulkError(error)) throw error
      const recoveredReport = await migrateBookings({
        db,
        sourceCollectionName,
        targetCollectionName,
        dryRun: false,
        retryDuplicateKeyRace: false,
      })
      recoveredReport.duplicateKeyRaceRecovered = true
      return recoveredReport
    }
  }

  return report
}

// CLI Execution entrypoint
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const isExecute = process.argv.includes('--execute')
  const isDryRun = !isExecute || process.argv.includes('--dry-run')

  console.info(`[Migration] Starting booking migration (Mode: ${isDryRun ? 'DRY-RUN' : 'EXECUTE'})...`)

  try {
    await connectDatabase(config.mongoUri, config.mongoDatabaseName)
    const db = mongoose.connection.db

    const report = await migrateBookings({
      db,
      dryRun: isDryRun,
    })

    console.info('====================================================')
    console.info('           BOOKING MIGRATION REPORT                ')
    console.info('====================================================')
    console.info(`Timestamp:              ${report.timestamp}`)
    console.info(`Mode:                   ${report.dryRun ? 'DRY RUN (No writes)' : 'LIVE EXECUTION'}`)
    console.info(`Source Collection:      ${report.sourceCollection}`)
    console.info(`Target Collection:      ${report.targetCollection}`)
    console.info(`Total Records Scanned:  ${report.totalScanned}`)
    console.info(`Target Count Before:    ${report.targetCountBefore}`)
    console.info(`Ready to Insert:        ${report.readyToInsert}`)
    console.info(`Already Present:        ${report.alreadyPresent}`)
    console.info(`Enriched / Updated:     ${report.updated}`)
    console.info(`Duplicate Key Recovery: ${report.duplicateKeyRaceRecovered ? 'yes' : 'no'}`)
    console.info(`State Conflicts:        ${report.stateConflicts.length}`)
    console.info(`Unmigrated / Corrupt:   ${report.unmigrated.length}`)
    if (!report.dryRun) {
      console.info(`\nTarget Count After:     ${report.targetCountAfter}`)
    }
    console.info('====================================================')
  } catch (error) {
    console.error('[Migration Error]:', error)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}
