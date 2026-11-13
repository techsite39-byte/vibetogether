import mongoose from 'mongoose'

const bookingEnquirySchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    requestId: {
      type: String,
      required: true,
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 80,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      maxlength: 16,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: '',
    },
    whatsappConsent: {
      type: Boolean,
      required: true,
      default: false,
    },
    whatsappConsentAt: {
      type: Date,
      default: null,
    },
    whatsappOptedOutAt: {
      type: Date,
      default: null,
    },
    whatsappNotification: {
      messageType: {
        type: String,
        enum: ['booking_confirmation', 'payment_assistance'],
        default: 'booking_confirmation',
      },
      recipient: {
        type: String,
        maxlength: 16,
        default: '',
      },
      idempotencyKey: {
        type: String,
        maxlength: 120,
        default: '',
      },
      bookingReference: {
        type: String,
        maxlength: 80,
        default: '',
      },
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped'],
        default: 'skipped',
      },
      providerMessageId: {
        type: String,
        maxlength: 200,
        default: '',
      },
      attemptCount: {
        type: Number,
        min: 0,
        default: 0,
      },
      lastAttemptAt: {
        type: Date,
        default: null,
      },
      sentAt: {
        type: Date,
        default: null,
      },
      nextRetryAt: {
        type: Date,
        default: null,
      },
      deliveredAt: {
        type: Date,
        default: null,
      },
      failureReason: {
        type: String,
        maxlength: 300,
        default: '',
      },
      retryable: {
        type: Boolean,
        default: false,
      },
      inProgress: {
        type: Boolean,
        default: false,
      },
      history: {
        type: [{
          status: {
            type: String,
            enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped'],
            required: true,
          },
          at: { type: Date, required: true },
          source: { type: String, enum: ['system', 'admin', 'webhook'], required: true },
          note: { type: String, maxlength: 300, default: '' },
          eventKey: { type: String, maxlength: 200, default: '' },
        }],
        default: [],
      },
    },
    eventId: {
      type: String,
      maxlength: 80,
      default: '',
    },
    event: {
      type: String,
      maxlength: 160,
      default: '',
    },
    categoryId: {
      type: String,
      maxlength: 80,
      default: '',
    },
    category: {
      type: String,
      maxlength: 160,
      default: '',
    },
    ticketType: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'general-admission',
    },
    ticketTypeName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: 'General Admission',
    },
    ticketQuantity: {
      type: Number,
      min: 1,
      max: 10,
      default: 1,
    },
    maleCount: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    femaleCount: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    maleMemberNames: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: [],
    },
    femaleMemberNames: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: [],
    },
    pricePerTicket: {
      type: Number,
      min: 0,
      default: 299,
    },
    subtotal: {
      type: Number,
      min: 0,
      default: 299,
    },
    discount: {
      type: Number,
      min: 0,
      default: 0,
    },
    finalAmount: {
      type: Number,
      min: 0,
      default: 299,
    },
    gender: {
      type: String,
      required: true,
      enum: ['Male', 'Female', 'Mixed'],
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['Website booking journey'],
      default: 'Website booking journey',
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['unpaid', 'processing', 'failed', 'demo_paid', 'paid', 'refunded'],
      default: 'unpaid',
    },
    paymentAmount: {
      type: Number,
      min: 0,
      default: 299,
    },
    paymentAmountPaise: {
      type: Number,
      min: 0,
      default: 29900,
    },
    paymentOrderAmountPaise: {
      type: Number,
      min: 0,
      default: 0,
    },
    paymentOrders: {
      type: [{
        orderId: { type: String, required: true, maxlength: 80 },
        amount: { type: Number, required: true, min: 1 },
        amountPaise: { type: Number, required: true, min: 100 },
        ticketType: { type: String, trim: true, maxlength: 80, default: 'general-admission' },
        ticketTypeName: { type: String, trim: true, maxlength: 120, default: 'General Admission' },
        ticketQuantity: { type: Number, min: 1, max: 10, default: 1 },
        pricePerTicket: { type: Number, min: 0, default: 299 },
        subtotal: { type: Number, min: 0, default: 299 },
        discount: { type: Number, min: 0, default: 0 },
        finalAmount: { type: Number, min: 0, default: 299 },
        regularPrice: { type: Number, required: true, min: 1 },
        offerPrice: { type: Number, required: true, min: 1 },
        diwaliOfferApplied: { type: Boolean, required: true },
        offerActivationAt: { type: Date, default: null },
        offerExpiresAt: { type: Date, default: null },
        status: { type: String, enum: ['created', 'failed', 'paid'], default: 'created' },
        createdAt: { type: Date, required: true },
        paymentId: { type: String, default: '', maxlength: 80 },
      }],
      default: [],
    },
    customerId: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    upiPayments: {
      type: [{
        bookingId: { type: String, required: true, maxlength: 80 },
        customerId: { type: String, trim: true, maxlength: 80, default: '' },
        eventId: { type: String, trim: true, maxlength: 80, default: '' },
        amount: { type: Number, required: true, min: 0.01 },
        upiId: { type: String, required: true, trim: true, maxlength: 120 },
        utr: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
        paymentMethod: { type: String, enum: ['UPI'], required: true, default: 'UPI' },
        status: {
          type: String,
          enum: [
            'Pending Payment',
            'Submitted for Verification',
            'Verified',
            'Rejected',
            'Refunded',
          ],
          required: true,
          default: 'Submitted for Verification',
        },
        submittedAt: { type: Date, required: true },
        adminVerifiedAt: { type: Date, default: null },
        adminId: { type: String, trim: true, maxlength: 80, default: '' },
        rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
      }],
      default: [],
    },
    regularPrice: {
      type: Number,
      min: 0,
      default: 299,
    },
    offerPrice: {
      type: Number,
      min: 0,
      default: 249,
    },
    diwaliOfferApplied: {
      type: Boolean,
      default: false,
    },
    offerActivationAt: {
      type: Date,
      default: null,
    },
    offerExpiresAt: {
      type: Date,
      default: null,
    },
    paymentProvider: {
      type: String,
      enum: ['razorpay_demo', 'razorpay', 'upi'],
      default: null,
    },
    paymentReference: {
      type: String,
      maxlength: 80,
      default: '',
    },
    paymentOrderId: {
      type: String,
      maxlength: 80,
      default: '',
    },
    razorpayPaymentId: {
      type: String,
      maxlength: 80,
      default: '',
    },
    paymentOrderCreatedAt: {
      type: Date,
      default: null,
    },
    paymentOrderAttemptNumber: {
      type: Number,
      min: 0,
      default: 0,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentVerifiedAt: {
      type: Date,
      default: null,
    },
    paymentFailureReason: {
      type: String,
      enum: ['', 'failed', 'cancelled'],
      default: '',
    },
    paymentAttemptId: {
      type: String,
      maxlength: 36,
    },
    paymentAttemptPricing: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    paymentAttemptedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'user-db',
    versionKey: false,
  },
)

bookingEnquirySchema.index({ requestId: 1 }, { unique: true, sparse: true })
bookingEnquirySchema.index({ reference: 1 }, { unique: true, sparse: true })
bookingEnquirySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
bookingEnquirySchema.index({ 'whatsappNotification.providerMessageId': 1 }, { sparse: true })
bookingEnquirySchema.index({ 'upiPayments.utr': 1 }, { unique: true, sparse: true })

export const BookingEnquiry =
  mongoose.models.BookingEnquiry ??
  mongoose.model('BookingEnquiry', bookingEnquirySchema)
