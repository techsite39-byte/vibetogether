import mongoose from 'mongoose'
import { ActivityLog } from '../models/adminRecords.js'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { BookingResult } from '../models/bookingResult.js'
import { UnmatchedCashfreePayment } from '../models/unmatchedCashfreePayment.js'
import { nextBookingReference } from './bookingReferences.js'
import { persistBookingResult } from './bookingResults.js'
import {
  isCompletedBookingPaymentStatus,
  isRealPaidBookingStatus,
} from '../../../src/utils/paymentStatus.js'

const eligibleUnpaidStatuses = ['unpaid', 'processing', 'failed', 'FAILED']

function serviceError(status, message) {
  return Object.assign(new Error(message), { status })
}

async function queryValue(query, session, { limit, lean = false } = {}) {
  let value = query
  if (session && typeof value?.session === 'function') value = value.session(session)
  if (limit && typeof value?.limit === 'function') value = value.limit(limit)
  if (lean && typeof value?.lean === 'function') value = value.lean()
  return typeof value?.exec === 'function' ? value.exec() : value
}

function transactionError(error) {
  return /transaction numbers are only allowed|replica set|transaction support|does not support transactions/i
    .test(String(error?.message ?? ''))
}

export function createCashfreeRecoveryService({
  payments,
  bookingEnquiryModel = BookingEnquiry,
  bookingResultModel = BookingResult,
  unmatchedPaymentModel = UnmatchedCashfreePayment,
  activityLogModel = ActivityLog,
  sessionFactory = () => mongoose.startSession(),
  allocateReference = nextBookingReference,
  now = () => new Date(),
} = {}) {
  async function withTransaction(operation) {
    const session = await sessionFactory()
    try {
      let result
      await session.withTransaction(async () => {
        result = await operation(session)
      })
      return result
    } catch (error) {
      if (transactionError(error)) {
        throw serviceError(
          503,
          'Atomic payment reconciliation requires MongoDB transaction support.',
        )
      }
      throw error
    } finally {
      await session.endSession()
    }
  }

  async function writeOutcomeInSession({
    eventId,
    event,
    actor,
    caseReference,
    reasonCode,
    outcome,
    session,
  }) {
    const timestamp = now()
    const processingStatus = ['reconciled', 'review_required'].includes(event.processingStatus)
      ? event.processingStatus
      : 'reconciliation_failed'
    await unmatchedPaymentModel.updateOne(
      { _id: eventId },
      {
        $set: {
          processingStatus,
          lastAttemptedAt: timestamp,
          lastAttemptedBy: String(actor.id),
          lastAttemptCaseReference: caseReference,
          lastAttemptReason: reasonCode,
          lastAttemptOutcome: outcome,
        },
      },
      { session },
    )
    await activityLogModel.create([{
      actorId: String(actor.id),
      actorRole: String(actor.role),
      action: 'Cashfree payment reconciliation rejected',
      entity: 'cashfree-unmatched-payment',
      entityId: String(eventId),
      description: `Reconciliation ${outcome} for ${caseReference}.`,
    }], { session })
    return { reconciled: false, outcome }
  }

  async function recordOutcome({
    eventId,
    actor,
    caseReference,
    reasonCode,
    outcome,
  }) {
    return withTransaction(async (session) => {
      const event = await queryValue(
        unmatchedPaymentModel.findById(eventId),
        session,
      )
      if (!event) throw serviceError(404, 'Unmatched Cashfree payment was not found.')
      return writeOutcomeInSession({
        eventId,
        event,
        actor,
        caseReference,
        reasonCode,
        outcome,
        session,
      })
    })
  }

  async function reconcile({
    eventId,
    requestId,
    actor,
    caseReference,
    reasonCode,
  } = {}) {
    if (!actor?.id || actor.role !== 'super_admin') {
      throw serviceError(403, 'Super Admin access is required for this action.')
    }

    const event = await queryValue(unmatchedPaymentModel.findById(eventId), null)
    if (!event) throw serviceError(404, 'Unmatched Cashfree payment was not found.')
    if (event.processingStatus === 'reconciled') {
      if (event.matchedRequestId === requestId) {
        return { reconciled: true, duplicate: true, outcome: 'already_reconciled' }
      }
      return withTransaction(async (session) => {
        const currentEvent = await queryValue(unmatchedPaymentModel.findById(eventId), session)
        if (!currentEvent) throw serviceError(404, 'Unmatched Cashfree payment was not found.')
        if (currentEvent.processingStatus === 'reconciled' && currentEvent.matchedRequestId === requestId) {
          return { reconciled: true, duplicate: true, outcome: 'already_reconciled' }
        }
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'already_reconciled_conflict',
          session,
        })
      })
    }
    if (
      event.providerStatus !== 'SUCCESS' ||
      event.providerEventType !== 'PAYMENT_SUCCESS_WEBHOOK'
    ) {
      return recordOutcome({
        eventId,
        actor,
        caseReference,
        reasonCode,
        outcome: 'provider_event_not_successful',
      })
    }
    if (event.processingStatus === 'review_required') {
      return recordOutcome({
        eventId,
        actor,
        caseReference,
        reasonCode,
        outcome: 'duplicate_metadata_conflict',
      })
    }
    if (typeof payments?.verifyUnmatchedPayment !== 'function') {
      await recordOutcome({
        eventId,
        actor,
        caseReference,
        reasonCode,
        outcome: 'provider_verification_unavailable',
      })
      throw serviceError(503, 'Cashfree payment verification is unavailable.')
    }

    let verification
    try {
      verification = await payments.verifyUnmatchedPayment({
        providerOrderId: event.providerOrderId,
        providerPaymentId: event.providerPaymentId,
        expectedAmount: event.amount,
        currency: event.currency,
      })
    } catch (error) {
      await recordOutcome({
        eventId,
        actor,
        caseReference,
        reasonCode,
        outcome: 'provider_verification_unavailable',
      })
      throw error
    }
    if (!verification?.verified) {
      return recordOutcome({
        eventId,
        actor,
        caseReference,
        reasonCode,
        outcome: verification?.reasonCode || 'provider_verification_rejected',
      })
    }
    if (
      verification.providerOrderId !== event.providerOrderId ||
      verification.providerPaymentId !== event.providerPaymentId ||
      Number(verification.amount).toFixed(2) !== Number(event.amount).toFixed(2) ||
      verification.currency !== event.currency
    ) {
      return recordOutcome({
        eventId,
        actor,
        caseReference,
        reasonCode,
        outcome: 'provider_evidence_mismatch',
      })
    }

    return withTransaction(async (session) => {
      const currentEvent = await queryValue(
        unmatchedPaymentModel.findById(eventId),
        session,
      )
      if (!currentEvent) throw serviceError(404, 'Unmatched Cashfree payment was not found.')
      if (currentEvent.processingStatus === 'reconciled') {
        if (currentEvent.matchedRequestId === requestId) {
          return { reconciled: true, duplicate: true, outcome: 'already_reconciled' }
        }
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'already_reconciled_conflict',
          session,
        })
      }
      if (
        currentEvent.providerStatus !== 'SUCCESS' ||
        currentEvent.providerEventType !== 'PAYMENT_SUCCESS_WEBHOOK' ||
        currentEvent.processingStatus === 'review_required' ||
        currentEvent.providerOrderId !== event.providerOrderId ||
        currentEvent.providerPaymentId !== event.providerPaymentId ||
        Number(currentEvent.amount) !== Number(event.amount) ||
        currentEvent.currency !== event.currency
      ) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'payment_changed_during_verification',
          session,
        })
      }

      const matchingBookings = await queryValue(
        bookingEnquiryModel.find({
          $or: [
            { paymentOrderId: currentEvent.providerOrderId },
            { 'paymentOrders.orderId': currentEvent.providerOrderId },
          ],
        }),
        session,
        { limit: 2, lean: true },
      )
      if (!Array.isArray(matchingBookings) || matchingBookings.length !== 1) {
        const outcome = matchingBookings?.length ? 'booking_identity_ambiguous' : 'booking_not_found'
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome,
          session,
        })
      }

      const snapshot = matchingBookings[0]
      if (snapshot.requestId !== requestId) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'booking_identity_mismatch',
          session,
        })
      }

      const entries = (snapshot.paymentOrders || []).filter(
        (order) => String(order.orderId) === currentEvent.providerOrderId,
      )
      const orderMatches =
        snapshot.paymentOrderId
          ? String(snapshot.paymentOrderId) === currentEvent.providerOrderId
          : entries.length === 1
      const expectedBookingAmount = entries.length === 1
        ? Number(entries[0].amount)
        : Number(snapshot.paymentAmount)
      const conflictingOrder = (snapshot.paymentOrders || []).some((order) =>
        String(order.orderId) !== currentEvent.providerOrderId &&
        order.status !== 'failed',
      )
      const conflictingPaidEntry = (snapshot.paymentOrders || []).some((order) =>
        order.status === 'paid' &&
        (
          String(order.orderId) !== currentEvent.providerOrderId ||
          String(order.paymentId ?? '') !== currentEvent.providerPaymentId
        ),
      )
      if (
        !orderMatches ||
        entries.length > 1 ||
        conflictingOrder ||
        conflictingPaidEntry ||
        snapshot.paymentProvider !== 'cashfree' ||
        !Number.isFinite(expectedBookingAmount) ||
        expectedBookingAmount.toFixed(2) !== Number(currentEvent.amount).toFixed(2) ||
        snapshot.status === 'cancelled'
      ) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'booking_payment_mismatch',
          session,
        })
      }

      const enquiryQuery = bookingEnquiryModel.findOne({ requestId })
      const enquiry = await queryValue(enquiryQuery, session)
      if (!enquiry) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'booking_changed_during_reconciliation',
          session,
        })
      }

      const duplicateEnquiries = await queryValue(
        bookingEnquiryModel.find({
          $or: [
            { cfPaymentId: currentEvent.providerPaymentId },
            { 'paymentOrders.paymentId': currentEvent.providerPaymentId },
          ],
        }),
        session,
        { limit: 2, lean: true },
      )
      const otherPaymentOwner = (duplicateEnquiries || []).find(
        (record) => String(record.requestId) !== String(requestId),
      )
      const conflictingPaymentOrder = (snapshot.paymentOrders || []).some((order) =>
        String(order.paymentId ?? '') === currentEvent.providerPaymentId &&
        String(order.orderId ?? '') !== currentEvent.providerOrderId,
      )
      const duplicateResults = await queryValue(
        bookingResultModel.find({
          paymentProvider: 'cashfree',
          $or: [
            { providerPaymentId: currentEvent.providerPaymentId },
            { providerOrderId: currentEvent.providerOrderId },
          ],
        }),
        session,
        { limit: 2, lean: true },
      )
      const otherResultOwner = (duplicateResults || []).find(
        (record) => String(record.requestId) !== String(requestId),
      )
      const existingResult = await queryValue(
        bookingResultModel.findOne({ requestId }),
        session,
      )
      const existingResultIsCompleted = isCompletedBookingPaymentStatus(
        existingResult?.paymentStatus,
      )
      const existingResultConflicts = existingResultIsCompleted && (
        !isRealPaidBookingStatus(existingResult.paymentStatus) ||
        existingResult.paymentProvider !== 'cashfree' ||
        String(existingResult.providerPaymentId ?? '') !== currentEvent.providerPaymentId ||
        String(existingResult.providerOrderId ?? '') !== currentEvent.providerOrderId ||
        Number(existingResult.amount).toFixed(2) !== Number(currentEvent.amount).toFixed(2) ||
        existingResult.currency !== currentEvent.currency
      )
      if (
        otherPaymentOwner ||
        otherResultOwner ||
        conflictingPaymentOrder ||
        existingResultConflicts
      ) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'duplicate_payment',
          session,
        })
      }

      const isAlreadyPaid = isRealPaidBookingStatus(enquiry.paymentStatus)
      if (isAlreadyPaid) {
        if (
          String(enquiry.cfPaymentId ?? '') !== currentEvent.providerPaymentId ||
          String(enquiry.paymentOrderId ?? '') !== currentEvent.providerOrderId ||
          !enquiry.reference
        ) {
          return writeOutcomeInSession({
            eventId,
            event: currentEvent,
            actor,
            caseReference,
            reasonCode,
            outcome: 'paid_booking_conflict',
            session,
          })
        }
      } else if (!eligibleUnpaidStatuses.includes(enquiry.paymentStatus)) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'booking_not_eligible',
          session,
        })
      } else if (
        enquiry.cfPaymentId &&
        String(enquiry.cfPaymentId) !== currentEvent.providerPaymentId
      ) {
        return writeOutcomeInSession({
          eventId,
          event: currentEvent,
          actor,
          caseReference,
          reasonCode,
          outcome: 'booking_payment_conflict',
          session,
        })
      }

      const timestamp = now()
      if (!isAlreadyPaid) {
        if (!enquiry.reference) {
          enquiry.reference = await allocateReference({ session })
        }
        enquiry.paymentStatus = 'paid'
        enquiry.status = 'confirmed'
        enquiry.paymentProvider = 'cashfree'
        enquiry.paymentOrderId = currentEvent.providerOrderId
        enquiry.paymentAmount = expectedBookingAmount
        enquiry.paymentAmountPaise = Math.round(expectedBookingAmount * 100)
        enquiry.paymentOrderAmountPaise = Math.round(expectedBookingAmount * 100)
        enquiry.cfPaymentId = currentEvent.providerPaymentId
        enquiry.cfPaymentStatus = 'SUCCESS'
        enquiry.paidAt = enquiry.paidAt || timestamp
        enquiry.paymentVerifiedAt = timestamp
        enquiry.paymentFailureReason = ''
        if (entries.length === 1) {
          const entry = enquiry.paymentOrders.find(
            (order) => String(order.orderId) === currentEvent.providerOrderId,
          )
          entry.status = 'paid'
          entry.paymentId = currentEvent.providerPaymentId
        }
        if (typeof enquiry.set === 'function') {
          enquiry.set('expiresAt', undefined)
        } else {
          delete enquiry.expiresAt
        }
        await enquiry.save({ session })
      }

      await persistBookingResult(
        enquiry,
        {
          paymentStatus: 'SUCCESS',
          paymentProvider: 'cashfree',
          providerPaymentId: currentEvent.providerPaymentId,
          providerOrderId: currentEvent.providerOrderId,
          currency: currentEvent.currency,
        },
        { bookingResultModel, session, now: timestamp },
      )

      await unmatchedPaymentModel.updateOne(
        { _id: eventId, processingStatus: { $ne: 'reconciled' } },
        {
          $set: {
            processingStatus: 'reconciled',
            reconciledAt: timestamp,
            reconciledBy: String(actor.id),
            caseReference,
            reconciliationReason: reasonCode,
            reconciliationOutcome: isAlreadyPaid ? 'already_applied' : 'reconciled',
            matchedRequestId: String(requestId),
            lastAttemptedAt: timestamp,
            lastAttemptedBy: String(actor.id),
            lastAttemptCaseReference: caseReference,
            lastAttemptReason: reasonCode,
            lastAttemptOutcome: isAlreadyPaid ? 'already_applied' : 'reconciled',
          },
        },
        { session },
      )
      await activityLogModel.create([{
        actorId: String(actor.id),
        actorRole: String(actor.role),
        action: 'Cashfree payment reconciled',
        entity: 'cashfree-unmatched-payment',
        entityId: String(eventId),
        description: `Payment reconciliation ${isAlreadyPaid ? 'already_applied' : 'reconciled'} for ${caseReference}.`,
      }], { session })

      return {
        reconciled: true,
        duplicate: isAlreadyPaid,
        outcome: isAlreadyPaid ? 'already_applied' : 'reconciled',
        requestId: String(requestId),
        reference: enquiry.reference,
      }
    })
  }

  return { reconcile }
}
