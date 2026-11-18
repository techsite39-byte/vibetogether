import mongoose from 'mongoose'

const bookingResultSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 80,
    },
    bookingReference: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    customerName: { type: String, required: true, maxlength: 80 },
    customerMobile: { type: String, required: true, maxlength: 30 },
    customerEmail: { type: String, maxlength: 254, default: '' },
    eventId: { type: String, maxlength: 80, default: '' },
    eventName: { type: String, maxlength: 160, default: '' },
    ticketType: { type: String, maxlength: 80, default: '' },
    ticketTypeName: { type: String, maxlength: 120, default: '' },
    ticketQuantity: { type: Number, min: 1, max: 10, required: true },
    amount: { type: Number, min: 0, required: true },
    currency: { type: String, required: true, maxlength: 3, default: 'INR' },
    paymentProvider: {
      type: String,
      enum: ['cashfree', 'razorpay'],
      required: true,
    },
    providerPaymentId: { type: String, maxlength: 100, default: '' },
    providerOrderId: { type: String, maxlength: 100, default: '' },
    paymentStatus: {
      type: String,
      enum: ['SUCCESS', 'FAILED'],
      required: true,
    },
    bookingStatus: { type: String, required: true, maxlength: 30 },
    failureReason: { type: String, maxlength: 500, default: '' },
    failureCode: { type: String, maxlength: 100, default: '' },
    createdAt: { type: Date, required: true, immutable: true },
    updatedAt: { type: Date, required: true },
  },
  {
    collection: 'bookings-db',
    versionKey: false,
  },
)

bookingResultSchema.index({ requestId: 1 }, { unique: true })

export const BookingResult =
  mongoose.models.BookingResult ??
  mongoose.model('BookingResult', bookingResultSchema)
