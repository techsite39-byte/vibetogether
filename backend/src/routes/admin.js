import { Router } from 'express'
import mongoose from 'mongoose'
import { createRequireAdmin, requireAdminCsrf } from '../auth/adminAuth.js'
import {
  ActivityLog,
  AdminCredential,
  Booking,
  Category,
  Enquiry,
  GalleryItem,
  Organizer,
  PlatformSetting,
  Subscriber,
  Testimonial,
  User,
} from '../models/adminRecords.js'
import { BookingEnquiry } from '../models/bookingEnquiry.js'
import { Event } from '../models/event.js'
import { hashAdminPassword } from '../auth/adminAuth.js'

const resourceModels = {
  users: User,
  organizers: Organizer,
  events: Event,
  categories: Category,
  testimonials: Testimonial,
  subscribers: Subscriber,
  enquiries: Enquiry,
  gallery: GalleryItem,
  admins: AdminCredential,
  activity: ActivityLog,
}

const resourceFields = {
  users: ['name', 'email', 'mobile', 'role', 'status'],
  organizers: ['name', 'contactEmail', 'description', 'categoryIds', 'status', 'userId'],
  events: [
    'title',
    'description',
    'image',
    'imageAlt',
    'category',
    'date',
    'time',
    'startsAt',
    'location',
    'organizer',
    'organizerId',
    'price',
    'priceAmount',
    'currency',
    'isFree',
    'seatsAvailable',
    'venueDetails',
    'highlights',
    'activities',
    'schedule',
    'guidelines',
    'gallery',
    'status',
  ],
  categories: ['id', 'title', 'description', 'image', 'imageAlt', 'enabled'],
  testimonials: ['name', 'event', 'eventId', 'rating', 'title', 'quote', 'status', 'featured'],
  subscribers: ['email', 'status'],
  enquiries: ['status'],
  gallery: ['title', 'caption', 'src', 'alt', 'categoryId', 'featured'],
  admins: ['username', 'role', 'active'],
}

const searchFields = {
  users: ['name', 'email', 'mobile'],
  organizers: ['name', 'contactEmail'],
  events: ['id', 'title', 'category', 'location', 'organizer'],
  categories: ['id', 'title', 'description'],
  testimonials: ['name', 'event', 'title', 'quote'],
  subscribers: ['email'],
  enquiries: ['name', 'email', 'subject', 'message'],
  gallery: ['title', 'caption', 'alt', 'categoryId'],
  admins: ['username', 'role'],
  activity: ['action', 'entity', 'entityId', 'description', 'actorRole'],
}

const enums = {
  users: {
    role: ['customer', 'organizer'],
    status: ['active', 'inactive'],
  },
  organizers: {
    status: ['pending', 'approved', 'rejected', 'suspended'],
  },
  events: {
    status: ['draft', 'pending', 'approved', 'published', 'rejected', 'cancelled'],
  },
  testimonials: {
    status: ['pending', 'approved', 'rejected'],
  },
  subscribers: {
    status: ['subscribed', 'unsubscribed'],
  },
  enquiries: {
    status: ['pending', 'read', 'resolved'],
  },
  admins: {
    role: ['admin'],
  },
}

const bookingStatusValues = ['pending', 'confirmed', 'cancelled']
const pageSizeMaximum = 100
const queryValueMaximum = 120

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeMediaReference(value) {
  if (!value) {
    return true
  }
  const path = value.split(/[?#]/, 1)[0]
  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !path.split('/').includes('..')
  ) {
    return true
  }
  if (!value.includes(':')) {
    return !path.split('/').includes('..') && !value.startsWith('.')
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function cleanStringList(field, value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw Object.assign(new Error(`${field} must be a list.`), { status: 400 })
  }
  return value.map((item) => {
    if (typeof item !== 'string' || item.length > 500) {
      throw Object.assign(new Error(`${field} contains an invalid entry.`), { status: 400 })
    }
    return item.normalize('NFKC').trim()
  })
}

function jsonRecord(record) {
  if (!record) {
    return null
  }

  const { _id, passwordHash: _passwordHash, ...fields } =
    typeof record.toObject === 'function' ? record.toObject() : record
  return { ...fields, id: String(fields.id ?? _id) }
}

function parsePage(request) {
  const page = Number.parseInt(request.query.page, 10)
  const pageSize = Number.parseInt(request.query.pageSize, 10)
  return {
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize > 0
        ? Math.min(pageSize, pageSizeMaximum)
        : 100,
  }
}

function createSearchQuery(resource, request) {
  const search = typeof request.query.search === 'string'
    ? request.query.search.trim().slice(0, queryValueMaximum)
    : ''
  const query = {}
  if (search) {
    const expression = new RegExp(escapedRegex(search), 'i')
    query.$or = searchFields[resource].map((field) => ({ [field]: expression }))
  }

  const status = typeof request.query.status === 'string'
    ? request.query.status.trim()
    : ''
  if (status && enums[resource]?.status.includes(status)) {
    query.status = status
  }
  return query
}

function cleanInput(resource, input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Provide a valid record.'), { status: 400 })
  }

  const fields = resourceFields[resource]
  const cleaned = {}
  for (const field of fields) {
    if (!Object.hasOwn(input, field)) {
      continue
    }

    const value = input[field]
    if (typeof value === 'string') {
      const normalized = value.normalize('NFKC').trim()
      if (
        normalized.length > fieldMaximumLength[field] ||
        [...normalized].some((character) => {
          const point = character.codePointAt(0)
          return point <= 31 || point === 127
        })
      ) {
        throw Object.assign(new Error(`${field} is not valid.`), { status: 400 })
      }
      cleaned[field] = field.toLowerCase().includes('email')
        ? normalized.toLowerCase()
        : normalized
    } else if (['highlights', 'activities', 'guidelines', 'categoryIds'].includes(field)) {
      cleaned[field] = cleanStringList(field, value)
    } else if (field === 'schedule' || field === 'gallery') {
      if (!Array.isArray(value) || value.length > 100) {
        throw Object.assign(new Error(`${field} must be a list.`), { status: 400 })
      }
      cleaned[field] = value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw Object.assign(new Error(`${field} contains an invalid entry.`), { status: 400 })
        }
        const allowed = field === 'schedule' ? ['time', 'activity'] : ['src', 'alt']
        const entry = {}
        for (const key of allowed) {
          if (typeof item[key] !== 'string' || item[key].length > (key === 'src' ? 2048 : 300)) {
            throw Object.assign(new Error(`${field} contains an invalid entry.`), { status: 400 })
          }
          entry[key] = item[key].normalize('NFKC').trim()
        }
        if (field === 'gallery' && !safeMediaReference(entry.src)) {
          throw Object.assign(new Error('Gallery images must use HTTPS or a safe local path.'), { status: 400 })
        }
        return entry
      })
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      cleaned[field] = value
    } else if (value === null && ['userId'].includes(field)) {
      cleaned[field] = null
    } else {
      throw Object.assign(new Error(`${field} has an invalid value.`), { status: 400 })
    }
  }

  if (!partial) {
    const requiredFields = requiredFieldsByResource[resource] ?? []
    for (const field of requiredFields) {
      if (cleaned[field] === undefined || cleaned[field] === '') {
        throw Object.assign(new Error(`${field} is required.`), { status: 400 })
      }
    }
  }

  for (const [field, values] of Object.entries(enums[resource] ?? {})) {
    if (cleaned[field] !== undefined && !values.includes(cleaned[field])) {
      throw Object.assign(new Error(`${field} is not supported.`), { status: 400 })
    }
  }

  if (
    cleaned.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)
  ) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
  }
  if (
    cleaned.contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.contactEmail)
  ) {
    throw Object.assign(new Error('Enter a valid contact email address.'), { status: 400 })
  }
  for (const field of ['image', 'src']) {
    if (cleaned[field] !== undefined && !safeMediaReference(cleaned[field])) {
      throw Object.assign(new Error(`${field} must use HTTPS or a safe local path.`), { status: 400 })
    }
  }
  if (cleaned.priceAmount !== undefined && cleaned.priceAmount < 0) {
    throw Object.assign(new Error('priceAmount cannot be negative.'), { status: 400 })
  }
  if (cleaned.seatsAvailable !== undefined && cleaned.seatsAvailable < 0) {
    throw Object.assign(new Error('seatsAvailable cannot be negative.'), { status: 400 })
  }
  if (cleaned.rating !== undefined && (!Number.isInteger(cleaned.rating) || cleaned.rating < 1 || cleaned.rating > 5)) {
    throw Object.assign(new Error('rating must be between 1 and 5.'), { status: 400 })
  }

  return cleaned
}

const fieldMaximumLength = {
  name: 80,
  username: 120,
  email: 254,
  mobile: 24,
  role: 40,
  status: 24,
  contactEmail: 254,
  description: 2000,
  id: 80,
  title: 160,
  image: 2048,
  imageAlt: 300,
  category: 80,
  date: 30,
  time: 30,
  startsAt: 50,
  location: 200,
  organizer: 120,
  organizerId: 80,
  price: 30,
  currency: 3,
  venueDetails: 2000,
  event: 160,
  eventId: 80,
  quote: 2000,
  subject: 160,
  message: 4000,
  caption: 500,
  src: 2048,
  alt: 300,
  categoryId: 80,
}

const requiredFieldsByResource = {
  users: ['name'],
  organizers: ['name'],
  events: ['title', 'category', 'date', 'location'],
  categories: ['id', 'title'],
  testimonials: ['name', 'quote', 'rating'],
  subscribers: ['email'],
  gallery: ['title', 'src', 'alt'],
  admins: ['username'],
}

function getModelByResource(resource) {
  const model = resourceModels[resource]
  if (!model || resource === 'activity') {
    throw Object.assign(new Error('This resource is not available.'), { status: 404 })
  }
  return model
}

function findByResourceId(resource, id) {
  const model = getModelByResource(resource)
  if (resource === 'events') {
    return model.findOne({ id }).exec()
  }
  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error('Record ID is invalid.'), { status: 400 })
  }
  return model.findById(id).exec()
}

async function writeAudit(request, action, entity, entityId, description) {
  await ActivityLog.create({
    actorId: request.admin.id,
    actorRole: request.admin.role,
    action,
    entity,
    entityId: String(entityId),
    description,
  })
}

function requireSuperAdmin(request, response) {
  if (request.admin.role === 'super_admin') {
    return true
  }
  response.status(403).json({ message: 'Super Admin access is required for this action.' })
  return false
}

function cleanPlatformSettings(value) {
  const allowedFields = new Set([
    'platformName',
    'tagline',
    'contactEmail',
    'contactPhone',
    'whatsappNumber',
    'socialInstagram',
    'socialYoutube',
    'bookingPolicy',
    'notifications',
  ])
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((field) => !allowedFields.has(field))
  ) {
    throw Object.assign(new Error('Provide valid platform settings.'), { status: 400 })
  }

  const maxima = {
    platformName: 80,
    tagline: 120,
    contactEmail: 254,
    contactPhone: 24,
    whatsappNumber: 15,
    socialInstagram: 2048,
    socialYoutube: 2048,
    bookingPolicy: 1000,
  }
  const result = {}
  for (const [field, maximum] of Object.entries(maxima)) {
    const text = value[field]
    if (typeof text !== 'string' || text.length > maximum) {
      throw Object.assign(new Error(`${field} is not valid.`), { status: 400 })
    }
    result[field] = text.normalize('NFKC').trim()
  }

  if (result.platformName.length < 2 || result.tagline.length < 2) {
    throw Object.assign(new Error('Platform name and tagline are required.'), { status: 400 })
  }
  if (result.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contactEmail)) {
    throw Object.assign(new Error('Enter a valid contact email address.'), { status: 400 })
  }
  if (result.whatsappNumber && !/^\d{8,15}$/.test(result.whatsappNumber)) {
    throw Object.assign(new Error('WhatsApp number must include 8 to 15 digits.'), { status: 400 })
  }
  for (const field of ['socialInstagram', 'socialYoutube']) {
    if (result[field]) {
      let url
      try {
        url = new URL(result[field])
      } catch {
        throw Object.assign(new Error(`${field} must be a valid HTTPS URL.`), { status: 400 })
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw Object.assign(new Error(`${field} must be a valid HTTPS URL.`), { status: 400 })
      }
    }
  }
  const notifications = value.notifications
  const notificationKeys = ['newBooking', 'eventSubmission', 'organizerApplication']
  if (
    !notifications ||
    typeof notifications !== 'object' ||
    Array.isArray(notifications) ||
    notificationKeys.some((key) => typeof notifications[key] !== 'boolean') ||
    Object.keys(notifications).some((key) => !notificationKeys.includes(key))
  ) {
    throw Object.assign(new Error('Notification settings are not valid.'), { status: 400 })
  }
  result.notifications = Object.fromEntries(
    notificationKeys.map((key) => [key, notifications[key]]),
  )
  return result
}

function bookingFromEnquiry(enquiry) {
  return {
    id: enquiry.requestId,
    reference: enquiry.requestId,
    customer: enquiry.name,
    customerEmail: '',
    eventId: enquiry.eventId,
    event: enquiry.event,
    ticketCount: 1,
    createdAt: enquiry.createdAt,
    amount: 0,
    currency: 'INR',
    paymentStatus: 'not_required',
    status: enquiry.status,
    source: 'booking-enquiry',
  }
}

async function listBookings(request) {
  const { page, pageSize } = parsePage(request)
  const [bookings, enquiries] = await Promise.all([
    Booking.find({}).sort({ createdAt: -1 }).lean(),
    BookingEnquiry.find({}).sort({ createdAt: -1 }).lean(),
  ])
  let items = [
    ...bookings.map(jsonRecord),
    ...enquiries.map(bookingFromEnquiry),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const status = typeof request.query.status === 'string'
    ? request.query.status.trim()
    : ''
  if (bookingStatusValues.includes(status)) {
    items = items.filter((item) => item.status === status)
  }
  const paymentStatus = typeof request.query.paymentStatus === 'string'
    ? request.query.paymentStatus.trim()
    : ''
  if (['not_required', 'pending', 'verified', 'failed'].includes(paymentStatus)) {
    items = items.filter((item) => item.paymentStatus === paymentStatus)
  }
  const search = typeof request.query.search === 'string'
    ? request.query.search.trim().slice(0, queryValueMaximum).toLowerCase()
    : ''
  if (search) {
    items = items.filter((item) =>
      [
        item.reference,
        item.customer,
        item.customerEmail,
        item.event,
        item.event?.title,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    )
  }
  const total = items.length
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
  }
}

async function getWorkspace() {
  const [
    users,
    organizers,
    events,
    bookings,
    bookingEnquiries,
    categories,
    testimonials,
    subscribers,
    enquiries,
    gallery,
    admins,
    activity,
    settingsRecord,
  ] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Organizer.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Event.find({}).sort({ date: 1 }).limit(500).lean(),
    Booking.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    BookingEnquiry.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Category.find({}).sort({ title: 1 }).limit(500).lean(),
    Testimonial.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Subscriber.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Enquiry.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    GalleryItem.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    AdminCredential.find({}).select('username role active createdAt lastLoginAt').sort({ createdAt: -1 }).limit(500).lean(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    PlatformSetting.findOne({ key: 'platform' }).lean(),
  ])

  return {
    users: users.map(jsonRecord),
    organizers: organizers.map(jsonRecord),
    events: events.map(jsonRecord),
    bookings: [
      ...bookings.map((item) => ({ ...jsonRecord(item), source: 'booking' })),
      ...bookingEnquiries.map(bookingFromEnquiry),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    categories: categories.map(jsonRecord),
    testimonials: testimonials.map(jsonRecord),
    subscribers: subscribers.map(jsonRecord),
    enquiries: enquiries.map(jsonRecord),
    gallery: gallery.map(jsonRecord),
    admins: admins.map(jsonRecord),
    activity: activity.map(jsonRecord),
    settings: settingsRecord?.value ?? null,
  }
}

async function getOverview() {
  const [
    users,
    organizers,
    events,
    bookings,
    bookingEnquiries,
    categories,
    testimonials,
    subscribers,
    enquiries,
    recentBookings,
    recentUsers,
    activity,
    monthlyUsers,
    monthlyBookings,
  ] = await Promise.all([
    User.countDocuments(),
    Organizer.countDocuments(),
    Event.countDocuments(),
    Booking.countDocuments(),
    BookingEnquiry.countDocuments(),
    Category.countDocuments(),
    Testimonial.countDocuments(),
    Subscriber.countDocuments({ status: 'subscribed' }),
    Enquiry.countDocuments({ status: 'pending' }),
    Booking.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    User.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    User.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]),
    Booking.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]),
  ])
  const [bookingStatuses, eventStatuses] = await Promise.all([
    Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Event.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ])

  return {
    counts: {
      users,
      organizers,
      events,
      bookings: bookings + bookingEnquiries,
      bookingEnquiries,
      categories,
      testimonials,
      subscribers,
      pendingEnquiries: enquiries,
    },
    bookingStatuses: Object.fromEntries(bookingStatuses.map(({ _id, count }) => [_id, count])),
    eventStatuses: Object.fromEntries(eventStatuses.map(({ _id, count }) => [_id, count])),
    userGrowth: monthlyUsers.map(({ _id, count }) => ({ label: _id, value: count })),
    bookingTrends: monthlyBookings.map(({ _id, count }) => ({ label: _id, value: count })),
    recentBookings: recentBookings.map(jsonRecord),
    recentUsers: recentUsers.map(jsonRecord),
    recentActivity: activity.map(jsonRecord),
  }
}

export function createAdminRouter({
  sessionSecret,
  adminModel = AdminCredential,
}) {
  const router = Router()
  const requireAdmin = createRequireAdmin({ sessionSecret, model: adminModel })

  router.use(requireAdmin)
  router.use((request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      next()
      return
    }
    requireAdminCsrf(request, response, next)
  })

  router.get('/workspace', async (_request, response, next) => {
    try {
      response.json(await getWorkspace())
    } catch (error) {
      next(error)
    }
  })

  router.get('/overview', async (_request, response, next) => {
    try {
      response.json(await getOverview())
    } catch (error) {
      next(error)
    }
  })

  router.get('/bookings', async (request, response, next) => {
    try {
      response.json(await listBookings(request))
    } catch (error) {
      next(error)
    }
  })

  router.get('/:resource', async (request, response, next) => {
    try {
      const { resource } = request.params
      if (resource === 'bookings') {
        response.json(await listBookings(request))
        return
      }

      const model = getModelByResource(resource)
      const { page, pageSize } = parsePage(request)
      const query = createSearchQuery(resource, request)
      const [items, total] = await Promise.all([
        model.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        model.countDocuments(query),
      ])
      response.json({ items: items.map(jsonRecord), page, pageSize, total })
    } catch (error) {
      next(error)
    }
  })

  router.post('/admins', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) {
      return
    }
    try {
      const input = cleanInput('admins', request.body)
      if (
        typeof request.body.password !== 'string' ||
        request.body.password.length < 12 ||
        request.body.password.length > 256
      ) {
        response.status(400).json({ message: 'Admin passwords must be between 12 and 256 characters.' })
        return
      }
      input.passwordHash = await hashAdminPassword(request.body.password)
      const admin = await AdminCredential.create(input)
      await writeAudit(request, 'Admin created', 'admin', admin.id, `Admin account ${admin.username} created.`)
      response.status(201).json({ item: jsonRecord(admin) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:resource', async (request, response, next) => {
    try {
      const { resource } = request.params
      const model = getModelByResource(resource)
      const input = cleanInput(resource, request.body)
      if (resource === 'events') {
        input.id = input.id || input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      }
      if (resource === 'admins') {
        if (!requireSuperAdmin(request, response)) {
          return
        }
        response.status(405).json({ message: 'Use the admin account creation endpoint.' })
        return
      }
      const record = await model.create(input)
      await writeAudit(request, `${resource.slice(0, -1)} created`, resource, record.id ?? record._id, `${resource.slice(0, -1)} record created.`)
      response.status(201).json({ item: jsonRecord(record) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/bookings/:reference', async (request, response, next) => {
    try {
      const { reference } = request.params
      const status = request.body?.status
      if (!bookingStatusValues.includes(status)) {
        response.status(400).json({ message: 'Choose a supported booking status.' })
        return
      }

      let booking = await Booking.findOne({ reference }).exec()
      if (booking) {
        if (booking.status === 'cancelled' && status !== 'cancelled') {
          response.status(409).json({ message: 'A cancelled booking cannot be reactivated.' })
          return
        }
        if (status === 'cancelled' && booking.status !== 'cancelled') {
          if (booking.paymentStatus !== 'not_required') {
            response.status(409).json({ message: 'Paid bookings must be cancelled by the payment service.' })
            return
          }
          const cancelledAt = new Date()
          const cancelled = await Booking.findOneAndUpdate(
            { reference, status: { $ne: 'cancelled' }, paymentStatus: 'not_required' },
            { $set: { status: 'cancelled', cancelledAt } },
            { new: true },
          ).exec()
          if (cancelled) {
            await Event.updateOne(
              { id: cancelled.eventId },
              { $inc: { seatsAvailable: cancelled.ticketCount } },
            )
            booking = cancelled
          } else {
            booking = await Booking.findOne({ reference }).exec()
            if (!booking || booking.status !== 'cancelled') {
              response.status(409).json({ message: 'The booking status changed. Refresh and retry.' })
              return
            }
          }
        } else {
          booking.status = status
          await booking.save()
        }
        await writeAudit(request, 'Booking status changed', 'booking', reference, `Booking status changed to ${status}.`)
        response.json({ item: { ...jsonRecord(booking), source: 'booking' } })
        return
      }

      const enquiry = await BookingEnquiry.findOne({ requestId: reference }).exec()
      if (!enquiry) {
        response.status(404).json({ message: 'Booking record was not found.' })
        return
      }
      enquiry.status = status
      await enquiry.save()
      await writeAudit(request, 'Booking enquiry status changed', 'booking-enquiry', reference, `Booking enquiry status changed to ${status}.`)
      response.json({ item: bookingFromEnquiry(enquiry.toObject()) })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/bookings/:reference', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) {
      return
    }
    try {
      const { reference } = request.params
      const booking = await Booking.findOneAndDelete({ reference }).lean()
      if (booking) {
        if (booking.status !== 'cancelled') {
          await Event.updateOne({ id: booking.eventId }, { $inc: { seatsAvailable: booking.ticketCount } })
        }
        await writeAudit(request, 'Booking deleted', 'booking', reference, 'Booking record deleted by an authorized admin.')
        response.status(204).end()
        return
      }
      const enquiry = await BookingEnquiry.findOneAndDelete({ requestId: reference }).lean()
      if (!enquiry) {
        response.status(404).json({ message: 'Booking record was not found.' })
        return
      }
      await writeAudit(request, 'Booking enquiry deleted', 'booking-enquiry', reference, 'Booking enquiry deleted by an authorized admin.')
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.patch('/admins/:id', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) {
      return
    }
    try {
      if (request.body?.password !== undefined) {
        response.status(400).json({ message: 'Admin passwords must be changed through the password reset flow.' })
        return
      }
      const input = cleanInput('admins', request.body, true)
      if (input.role === 'super_admin') {
        response.status(400).json({ message: 'Admin role cannot be elevated through this endpoint.' })
        return
      }
      const admin = await findByResourceId('admins', request.params.id)
      if (!admin) {
        response.status(404).json({ message: 'Admin account was not found.' })
        return
      }
      if (String(admin._id) === request.admin.id && input.active === false) {
        response.status(400).json({ message: 'You cannot deactivate your own account.' })
        return
      }
      Object.assign(admin, input)
      await admin.save()
      await writeAudit(request, 'Admin updated', 'admin', admin.id, `Admin account ${admin.username} updated.`)
      response.json({ item: jsonRecord(admin) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/:resource/:id', async (request, response, next) => {
    try {
      const { resource, id } = request.params
      if (resource === 'bookings' || resource === 'admins') {
        response.status(405).json({ message: 'Use the resource-specific update endpoint.' })
        return
      }
      const input = cleanInput(resource, request.body, true)
      const record = await findByResourceId(resource, id)
      if (!record) {
        response.status(404).json({ message: 'Record was not found.' })
        return
      }
      if (resource === 'categories' && input.id !== undefined && input.id !== record.id) {
        response.status(400).json({ message: 'Category IDs cannot be changed.' })
        return
      }
      const previousCategoryTitle = resource === 'categories' ? record.title : ''
      Object.assign(record, input)
      await record.save()
      if (
        resource === 'categories' &&
        previousCategoryTitle !== record.title
      ) {
        await Event.updateMany(
          { category: previousCategoryTitle },
          { $set: { category: record.title } },
        )
      }
      await writeAudit(request, `${resource.slice(0, -1)} updated`, resource, record.id ?? record._id, `${resource.slice(0, -1)} record updated.`)
      response.json({ item: jsonRecord(record) })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:resource/:id', async (request, response, next) => {
    try {
      const { resource, id } = request.params
      if (resource === 'bookings') {
        response.status(405).json({ message: 'Use the booking reference endpoint.' })
        return
      }
      if (resource === 'admins' && !requireSuperAdmin(request, response)) {
        return
      }
      const model = getModelByResource(resource)
      const record = await findByResourceId(resource, id)
      if (!record) {
        response.status(404).json({ message: 'Record was not found.' })
        return
      }
      if (resource === 'events') {
        const [bookingCount, enquiryCount] = await Promise.all([
          Booking.countDocuments({ eventId: record.id }),
          BookingEnquiry.countDocuments({ eventId: record.id }),
        ])
        if (bookingCount + enquiryCount > 0) {
          response.status(409).json({ message: 'Events with booking records cannot be deleted. Cancel the event instead.' })
          return
        }
      }
      if (resource === 'categories') {
        const linkedEvents = await Event.countDocuments({
          $or: [{ category: record.title }, { category: record.id }],
        })
        if (linkedEvents > 0) {
          response.status(409).json({ message: 'Categories linked to events cannot be deleted.' })
          return
        }
      }
      if (resource === 'organizers') {
        const linkedEvents = await Event.countDocuments({ organizerId: id })
        if (linkedEvents > 0) {
          response.status(409).json({ message: 'Organizers with event listings cannot be deleted.' })
          return
        }
      }
      if (resource === 'admins' && String(record._id) === request.admin.id) {
        response.status(400).json({ message: 'You cannot delete your own account.' })
        return
      }
      await model.deleteOne({ _id: record._id })
      await writeAudit(request, `${resource.slice(0, -1)} deleted`, resource, record.id ?? record._id, `${resource.slice(0, -1)} record deleted.`)
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/settings/platform', async (_request, response, next) => {
    if (!requireSuperAdmin(_request, response)) {
      return
    }
    try {
      const record = await PlatformSetting.findOne({ key: 'platform' }).lean()
      response.json({ settings: record?.value ?? null })
    } catch (error) {
      next(error)
    }
  })

  router.put('/settings/platform', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) {
      return
    }
    try {
      const value = cleanPlatformSettings(request.body)
      const record = await PlatformSetting.findOneAndUpdate(
        { key: 'platform' },
        { $set: { value } },
        { new: true, upsert: true, runValidators: true },
      ).lean()
      await writeAudit(request, 'Platform settings updated', 'settings', 'platform', 'Platform settings updated.')
      response.json({ settings: record.value })
    } catch (error) {
      next(error)
    }
  })

  return router
}
