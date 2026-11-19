import mongoose from 'mongoose'

const unmatchedCashfreePaymentSchema = new mongoose.Schema(
  {
    providerOrderId: {
      type: String,
      required: true,
      maxlength: 100,
    },
    providerPaymentId: {
      type: String,
      required: true,
      maxlength: 100,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      maxlength: 3,
    },
    providerStatus: {
      type: String,
      enum: [
        'SUCCESS',
        'FAILED',
        'PENDING',
        'USER_DROPPED',
        'CANCELLED',
        'REFUNDED',
        'REVERSED',
        'UNKNOWN',
      ],
      required: true,
      maxlength: 40,
    },
    providerEventType: {
      type: String,
      enum: [
        'PAYMENT_SUCCESS_WEBHOOK',
        'PAYMENT_FAILED_WEBHOOK',
        'PAYMENT_USER_DROPPED_WEBHOOK',
        'REFUND_STATUS_WEBHOOK',
        'PAYMENT_REVERSED_WEBHOOK',
        'UNKNOWN',
      ],
      required: true,
      maxlength: 80,
    },
    eventTime: {
      type: Date,
      default: null,
    },
    processingStatus: {
      type: String,
      enum: ['unmatched', 'review_required', 'reconciliation_failed', 'reconciled'],
      default: 'unmatched',
      required: true,
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    reconciledAt: {
      type: Date,
      default: null,
    },
    reconciledBy: {
      type: String,
      maxlength: 80,
      default: '',
    },
    caseReference: {
      type: String,
      maxlength: 80,
      default: '',
    },
    reconciliationReason: {
      type: String,
      maxlength: 40,
      default: '',
    },
    reconciliationOutcome: {
      type: String,
      maxlength: 60,
      default: '',
    },
    matchedRequestId: {
      type: String,
      maxlength: 80,
      default: '',
    },
    lastAttemptedAt: {
      type: Date,
      default: null,
    },
    lastAttemptedBy: {
      type: String,
      maxlength: 80,
      default: '',
    },
    lastAttemptCaseReference: {
      type: String,
      maxlength: 80,
      default: '',
    },
    lastAttemptReason: {
      type: String,
      maxlength: 40,
      default: '',
    },
    lastAttemptOutcome: {
      type: String,
      maxlength: 60,
      default: '',
    },
  },
  {
    collection: 'cashfree-unmatched-payments',
    timestamps: true,
    versionKey: false,
  },
)

unmatchedCashfreePaymentSchema.index(
  { providerPaymentId: 1 },
  { unique: true },
)
unmatchedCashfreePaymentSchema.index({ processingStatus: 1, receivedAt: -1 })

export const UnmatchedCashfreePayment =
  mongoose.models.UnmatchedCashfreePayment ??
  mongoose.model('UnmatchedCashfreePayment', unmatchedCashfreePaymentSchema)
