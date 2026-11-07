import mongoose from 'mongoose'

const bookingEnquirySchema = new mongoose.Schema(
  {
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
  },
  {
    collection: 'user-db',
    versionKey: false,
  },
)

bookingEnquirySchema.index({ requestId: 1 }, { unique: true, sparse: true })

export const BookingEnquiry =
  mongoose.models.BookingEnquiry ??
  mongoose.model('BookingEnquiry', bookingEnquirySchema)
