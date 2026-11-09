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
        enum: ['booking_confirmation'],
        default: 'booking_confirmation',
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
    gender: {
      type: String,
      required: true,
      enum: ['Male', 'Female'],
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
      enum: ['unpaid', 'demo_paid'],
      default: 'unpaid',
    },
    paymentAmount: {
      type: Number,
      min: 0,
      default: 299,
    },
    paymentProvider: {
      type: String,
      enum: ['razorpay_demo'],
      default: null,
    },
    paymentReference: {
      type: String,
      maxlength: 80,
      default: '',
    },
    paidAt: {
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
bookingEnquirySchema.index({ 'whatsappNotification.providerMessageId': 1 }, { sparse: true })

export const BookingEnquiry =
  mongoose.models.BookingEnquiry ??
  mongoose.model('BookingEnquiry', bookingEnquirySchema)
