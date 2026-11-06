import mongoose from 'mongoose'

const eventScheduleSchema = new mongoose.Schema(
  {
    time: { type: String, trim: true, maxlength: 30 },
    activity: { type: String, trim: true, maxlength: 160 },
  },
  { _id: false },
)

const eventGalleryItemSchema = new mongoose.Schema(
  {
    src: { type: String, trim: true, maxlength: 2048 },
    alt: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false },
)

const eventSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      maxlength: 80,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    image: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: '',
    },
    imageAlt: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    category: { type: String, trim: true, maxlength: 80, default: '' },
    date: { type: String, trim: true, maxlength: 30, default: '' },
    time: { type: String, trim: true, maxlength: 30, default: '' },
    startsAt: { type: String, trim: true, maxlength: 50, default: '' },
    location: { type: String, trim: true, maxlength: 200, default: '' },
    organizer: { type: String, trim: true, maxlength: 120, default: '' },
    organizerId: { type: String, trim: true, maxlength: 80, default: '' },
    price: { type: String, trim: true, maxlength: 30, default: '' },
    priceAmount: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, maxlength: 3, default: 'INR' },
    isFree: { type: Boolean, default: false },
    seatsAvailable: { type: Number, min: 0, default: 0 },
    createdAt: { type: Date, default: Date.now },
    venueDetails: { type: String, trim: true, maxlength: 2000, default: '' },
    highlights: { type: [String], default: [] },
    activities: { type: [String], default: [] },
    schedule: { type: [eventScheduleSchema], default: [] },
    guidelines: { type: [String], default: [] },
    gallery: { type: [eventGalleryItemSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'published', 'rejected', 'cancelled'],
      default: 'published',
      index: true,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'events-db',
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: false },
  },
)

export const Event =
  mongoose.models.Event ?? mongoose.model('Event', eventSchema)
