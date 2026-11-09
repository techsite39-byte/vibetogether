import mongoose from 'mongoose'

const { Schema } = mongoose

function createModel(name, collection, definition, indexes = []) {
  const schema = new Schema(definition, {
    collection,
    timestamps: true,
    versionKey: false,
  })

  indexes.forEach(([fields, options]) => schema.index(fields, options))
  return mongoose.models[name] ?? mongoose.model(name, schema)
}

export const AdminCredential = createModel(
  'AdminCredential',
  'admin-cred',
  {
    name: { type: String, trim: true, default: 'Vibe Admin', maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    username: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    passwordHash: { type: String, select: false },
    googleId: { type: String, default: null, trim: true },
    role: { type: String, enum: ['super_admin', 'admin'], default: 'admin', required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    active: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  [
    [{ username: 1 }, { unique: true }],
    [{ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }],
    [{ googleId: 1 }, { unique: true, sparse: true }],
  ],
)

export const Admin = AdminCredential

export const PasswordReset = createModel(
  'PasswordReset',
  'password-resets',
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminCredential', required: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  [
    [{ email: 1, createdAt: -1 }],
    [{ adminId: 1, createdAt: -1 }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
)

export const AdminSession = createModel(
  'AdminSession',
  'admin-sessions',
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminCredential', required: true },
    sessionId: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
  },
  [
    [{ sessionId: 1 }, { unique: true }],
    [{ adminId: 1 }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
)

export const GoogleOAuthTransaction = createModel(
  'GoogleOAuthTransaction',
  'google-oauth-transactions',
  {
    stateHash: { type: String, required: true, trim: true, maxlength: 64 },
    browserBindingHash: { type: String, required: true, trim: true, maxlength: 64 },
    frontendOrigin: { type: String, required: true, trim: true, maxlength: 300 },
    expiresAt: { type: Date, required: true },
  },
  [
    [{ stateHash: 1 }, { unique: true }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
)

export const User = createModel(
  'User',
  'users-db',
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    mobile: { type: String, trim: true, maxlength: 24, default: '' },
    role: { type: String, enum: ['customer', 'organizer'], default: 'customer' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  [
    [{ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }],
    [{ mobile: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: 'string', $gt: '' } } }],
  ],
)

export const Organizer = createModel(
  'Organizer',
  'organizer-db',
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    categoryIds: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  [[{ contactEmail: 1 }, { unique: true, partialFilterExpression: { contactEmail: { $type: 'string', $gt: '' } } }]],
)

export const BookingReferenceCounter = createModel(
  'BookingReferenceCounter',
  'booking-reference-counter',
  {
    _id: { type: String, default: 'booking-reference-counter' },
    value: { type: Number, required: true, default: 10812026500, min: 10812026500 },
  },
  [[{ _id: 1 }]],
)

export const Booking = createModel(
  'Booking',
  'bookings-db',
  {
    requestId: { type: String, trim: true, maxlength: 80, default: '' },
    reference: { type: String, required: true, trim: true, maxlength: 80 },
    eventId: { type: String, required: true, trim: true, maxlength: 80 },
    event: { type: Schema.Types.Mixed, required: true },
    attendee: {
      fullName: { type: String, required: true, trim: true, maxlength: 80 },
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
      mobile: { type: String, required: true, trim: true, maxlength: 24 },
    },
    ticketCount: { type: Number, required: true, min: 1, max: 20 },
    specialRequests: { type: String, trim: true, maxlength: 1000, default: '' },
    subtotal: { type: Number, required: true, min: 0 },
    fees: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true, maxlength: 3 },
    paymentStatus: { type: String, enum: ['not_required', 'pending', 'verified', 'failed'], default: 'not_required' },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'confirmed' },
    cancelledAt: { type: Date, default: null },
  },
  [[{ reference: 1 }, { unique: true }], [{ requestId: 1 }, { unique: true, sparse: true }], [{ eventId: 1, status: 1 }], [{ createdAt: -1 }]],
)

export const Category = createModel(
  'Category',
  'category-db',
  {
    id: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    image: { type: String, trim: true, maxlength: 2048, default: '' },
    imageAlt: { type: String, trim: true, maxlength: 300, default: '' },
    enabled: { type: Boolean, default: true },
  },
  [[{ id: 1 }, { unique: true }], [{ title: 1 }, { unique: true }]],
)

export const Testimonial = createModel(
  'Testimonial',
  'testimonial-db',
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    event: { type: String, trim: true, maxlength: 160, default: '' },
    eventId: { type: String, trim: true, maxlength: 80, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 160, default: '' },
    quote: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    featured: { type: Boolean, default: false },
  },
  [[{ status: 1, createdAt: -1 }]],
)

export const Subscriber = createModel(
  'Subscriber',
  'newsletter-db',
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    subscribedAt: { type: Date, default: Date.now },
  },
  [[{ email: 1 }, { unique: true }], [{ status: 1, createdAt: -1 }]],
)

export const Enquiry = createModel(
  'Enquiry',
  'enquiry-db',
  {
    type: { type: String, enum: ['contact', 'host-event'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    mobile: { type: String, trim: true, maxlength: 24, default: '' },
    subject: { type: String, trim: true, maxlength: 160, default: '' },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    phone: { type: String, trim: true, maxlength: 24, default: '' },
    hostDetails: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['pending', 'read', 'resolved'], default: 'pending' },
  },
  [[{ status: 1, createdAt: -1 }], [{ email: 1 }]],
)

export const GalleryItem = createModel(
  'GalleryItem',
  'gallery-db',
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    caption: { type: String, trim: true, maxlength: 500, default: '' },
    src: { type: String, required: true, trim: true, maxlength: 2048 },
    alt: { type: String, required: true, trim: true, maxlength: 300 },
    categoryId: { type: String, trim: true, maxlength: 80, default: '' },
    featured: { type: Boolean, default: false },
  },
  [[{ categoryId: 1, createdAt: -1 }]],
)

export const PlatformSetting = createModel(
  'PlatformSetting',
  'settings-db',
  {
    key: { type: String, required: true, unique: true, default: 'platform' },
    value: { type: Schema.Types.Mixed, required: true },
  },
)

export const ActivityLog = createModel(
  'ActivityLog',
  'activity-db',
  {
    actorId: { type: String, required: true, maxlength: 80 },
    actorRole: { type: String, required: true, maxlength: 40 },
    action: { type: String, required: true, maxlength: 120 },
    entity: { type: String, required: true, maxlength: 80 },
    entityId: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 300 },
  },
  [[{ createdAt: -1 }]],
)
