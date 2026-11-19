import { Router } from 'express'
import mongoose from 'mongoose'
import { createRequireAdmin, requireAdminCsrf } from '../auth/adminAuth.js'
import {
  ActivityLog,
  AdminCredential,
  AdminSession,
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
import { BookingEnquiry, LegacyBookingEnquiry } from '../models/bookingEnquiry.js'
import { UnmatchedCashfreePayment } from '../models/unmatchedCashfreePayment.js'

import { Event } from '../models/event.js'
import { MediaAsset } from '../models/mediaAsset.js'
import {
  getWhatsAppNotificationOutcome,
  logWhatsAppNotification,
  logWhatsAppNotificationResult,
} from '../services/whatsappNotifications.js'
import {
  isBuiltInEventId,
  markBuiltInEventDeleted,
} from '../services/events.js'
import { hashAdminPassword } from '../auth/adminAuth.js'
import {
  normalizeBookingPaymentStatus,
} from '../../../src/utils/paymentStatus.js'

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
  admins: ['name', 'email', 'username', 'role', 'status', 'active'],
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
  admins: ['name', 'email', 'username', 'role'],
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
    const isObjectId = mongoose.isValidObjectId(id)
    return model.findOne(isObjectId ? { $or: [{ id }, { _id: id }] } : { id }).exec()
  }
  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error('Record ID is invalid.'), { status: 400 })
  }
  return model.findById(id).exec()
}

export async function deleteEventRecord({
  record,
  eventModel,
  bookingCount = 0,
  enquiryCount = 0,
  markDeleted = markBuiltInEventDeleted,
}) {
  if (bookingCount + enquiryCount > 0) {
    return {
      status: 409,
      message: 'Events with booking records cannot be deleted. Cancel the event instead.',
    }
  }
  const deleteResult = await eventModel.deleteOne({ _id: record._id })
  if (deleteResult?.deletedCount > 0 && isBuiltInEventId(record.id)) {
    await markDeleted(record.id)
  }
  return { status: deleteResult?.deletedCount > 0 ? 204 : 404 }
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
    'socialFacebook',
    'socialYoutube',
    'socialLinkedin',
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
    socialFacebook: 2048,
    socialYoutube: 2048,
    socialLinkedin: 2048,
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
  for (const field of ['socialInstagram', 'socialFacebook', 'socialYoutube', 'socialLinkedin']) {
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
    requestId: enquiry.requestId,
    reference: enquiry.reference ?? '',
    customer: enquiry.name,
    customerEmail: enquiry.email ?? '',
    mobile: enquiry.mobile,
    eventId: enquiry.eventId,
    event: enquiry.event,
    categoryId: enquiry.categoryId ?? '',
    category: enquiry.category ?? '',
    ticketCount: enquiry.ticketQuantity ?? 1,
    ticketType: enquiry.ticketType ?? 'general-admission',
    ticketTypeName: enquiry.ticketTypeName ?? 'General Admission',
    ticketQuantity: enquiry.ticketQuantity ?? 1,
    maleCount: enquiry.maleCount ?? (enquiry.gender === 'Male' ? (enquiry.ticketQuantity ?? 1) : 0),
    femaleCount: enquiry.femaleCount ?? (enquiry.gender === 'Female' ? (enquiry.ticketQuantity ?? 1) : 0),
    maleMemberNames: enquiry.maleMemberNames ?? [],
    femaleMemberNames: enquiry.femaleMemberNames ?? [],
    maleMemberMobiles: enquiry.maleMemberMobiles ?? [],
    femaleMemberMobiles: enquiry.femaleMemberMobiles ?? [],
    maleMemberConsents: enquiry.maleMemberConsents ?? [],
    femaleMemberConsents: enquiry.femaleMemberConsents ?? [],
    attendees: enquiry.attendees ?? [],
    attendeeNotifications: enquiry.attendeeNotifications ?? [],
    adminNotification: enquiry.adminNotification ?? null,
    gender: enquiry.gender,
    pricePerTicket: enquiry.pricePerTicket ?? enquiry.regularPrice ?? 299,
    subtotal: enquiry.subtotal ?? enquiry.regularPrice ?? 299,
    discount: enquiry.discount ?? 0,
    finalAmount: enquiry.finalAmount ?? enquiry.paymentAmount ?? 299,
    createdAt: enquiry.createdAt,
    amount: enquiry.paymentAmount ?? 299,
    paymentAmountPaise: enquiry.paymentAmountPaise ?? (enquiry.paymentAmount ?? 299) * 100,
    customerId: enquiry.customerId ?? '',
    upiPayments: enquiry.upiPayments ?? [],
    regularPrice: enquiry.regularPrice ?? 299,
    offerPrice: enquiry.offerPrice ?? 249,
    diwaliOfferApplied: Boolean(enquiry.diwaliOfferApplied),
    offerActivationAt: enquiry.offerActivationAt ?? null,
    offerExpiresAt: enquiry.offerExpiresAt ?? null,
    currency: 'INR',
    paymentStatus: normalizeBookingPaymentStatus(enquiry.paymentStatus || 'unpaid'),
    paymentProvider: enquiry.paymentProvider ?? '',
    paymentReference: enquiry.paymentReference ?? '',
    paymentOrderId: enquiry.paymentOrderId ?? '',
    razorpayPaymentId: enquiry.razorpayPaymentId ?? '',
    cfOrderId: enquiry.cfOrderId ?? '',
    cfPaymentId: enquiry.cfPaymentId ?? '',
    cfPaymentStatus: enquiry.cfPaymentStatus ?? '',
    cfPaymentMethod: enquiry.cfPaymentMethod ?? '',
    paidAt: enquiry.paidAt ?? null,
    paymentVerifiedAt: enquiry.paymentVerifiedAt ?? null,
    paymentFailureReason: enquiry.paymentFailureReason ?? '',
    status: enquiry.status,
    source: 'booking-enquiry',
    whatsappConsent: Boolean(enquiry.whatsappConsent),
    whatsappActionStatus: 'not_available',
    whatsappConsentAt: enquiry.whatsappConsentAt ?? null,
    whatsappOptedOutAt: enquiry.whatsappOptedOutAt ?? null,
    whatsappNotification: enquiry.whatsappNotification ?? {
      status: 'not_available',
      history: [],
    },
  }
}

const PAYMENT_EVIDENCE_KEY_PATTERN =
  '(payment|paid|cashfree|razorpay|upi|gateway|provider|transaction|refund|settlement|verification|verified|attempt|order|utr|receipt|payout|financial|audit)'

const bookingPaymentKeys = ['paymentStatus']
const enquiryPaymentKeys = [
  'paymentStatus',
  'paymentAmount',
  'paymentAmountPaise',
  'paymentOrderAmountPaise',
  'paymentOrders',
  'upiPayments',
  'paymentProvider',
  'cfOrderId',
  'cfPaymentId',
  'cfPaymentSessionId',
  'cfPaymentStatus',
  'cfPaymentMethod',
  'paymentReference',
  'paymentOrderId',
  'razorpayPaymentId',
  'paymentOrderCreatedAt',
  'paymentOrderAttemptNumber',
  'paidAt',
  'paymentVerifiedAt',
  'paymentFailureReason',
  'paymentAttemptId',
  'paymentAttemptPricing',
  'paymentAttemptedAt',
]

function hasPaymentEvidence(record, source) {
  const expectedStatus = source === 'booking' ? 'not_required' : 'unpaid'
  if (!record || record.paymentStatus !== expectedStatus) {
    return true
  }

  const allowedKeys = new Set(source === 'booking' ? bookingPaymentKeys : enquiryPaymentKeys)
  return Object.entries(record).some(([key, value]) => {
    if (!new RegExp(PAYMENT_EVIDENCE_KEY_PATTERN, 'i').test(key)) {
      return false
    }
    if (!allowedKeys.has(key)) {
      return true
    }
    if (key === 'paymentStatus' || key === 'paymentAmount' || key === 'paymentAmountPaise') {
      return false
    }
    if (key === 'paymentOrders' || key === 'upiPayments') {
      return value != null && (!Array.isArray(value) || value.length > 0)
    }
    if (key === 'paymentOrderAmountPaise' || key === 'paymentOrderAttemptNumber') {
      return value != null && value !== 0
    }
    return value != null && value !== ''
  })
}

function emptyPaymentEvidenceFilter(source) {
  const fields = source === 'booking'
    ? []
    : [
      ['paymentOrders', [null, []]],
      ['upiPayments', [null, []]],
      ['paymentProvider', [null, '']],
      ['cfOrderId', [null, '']],
      ['cfPaymentId', [null, '']],
      ['cfPaymentSessionId', [null, '']],
      ['cfPaymentStatus', [null, '']],
      ['cfPaymentMethod', [null, '']],
      ['paymentReference', [null, '']],
      ['paymentOrderId', [null, '']],
      ['razorpayPaymentId', [null, '']],
      ['paymentOrderCreatedAt', [null]],
      ['paymentOrderAmountPaise', [null, 0]],
      ['paymentOrderAttemptNumber', [null, 0]],
      ['paidAt', [null]],
      ['paymentVerifiedAt', [null]],
      ['paymentFailureReason', [null, '']],
      ['paymentAttemptId', [null, '']],
      ['paymentAttemptPricing', [null, '']],
      ['paymentAttemptedAt', [null]],
    ]

  return {
    paymentStatus: source === 'booking' ? 'not_required' : 'unpaid',
    $and: fields.map(([field, allowedValues]) => ({
      [field]: { $in: allowedValues },
    })),
    $expr: {
      $eq: [
        {
          $size: {
            $filter: {
              input: { $objectToArray: '$$ROOT' },
              as: 'field',
              cond: {
                $and: [
                  {
                    $regexMatch: {
                      input: '$$field.k',
                      regex: PAYMENT_EVIDENCE_KEY_PATTERN,
                      options: 'i',
                    },
                  },
                  {
                    $not: [{
                      $in: [
                        '$$field.k',
                        source === 'booking' ? bookingPaymentKeys : enquiryPaymentKeys,
                      ],
                    }],
                  },
                ],
              },
            },
          },
        },
        0,
      ],
    },
  }
}

function bookingEnquiryIdentifierType(identifier) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)) {
    return 'requestId'
  }
  if (/^[0-9a-f]{24}$/i.test(identifier)) {
    return 'enquiryId-or-reference'
  }
  return 'bookingReference'
}

function bookingEnquiryMatchedBy(enquiry, identifier) {
  if (enquiry.requestId === identifier) return 'requestId'
  if (enquiry.reference === identifier) return 'reference'
  if (String(enquiry._id ?? '') === identifier) return 'enquiryId'
  return 'repository-match'
}

export function mergeBookingRecords(bookings = [], enquiries = [], legacyEnquiries = []) {
  const seen = new Set()
  const records = []

  const add = (formatted) => {
    if (!formatted) return
    const identities = [
      ['requestId', formatted.requestId],
      ['reference', formatted.reference],
      ['id', formatted.id],
    ]
      .filter(([, identity]) => identity != null && String(identity).trim() !== '')
      .map(([field, identity]) => `${field}:${String(identity)}`)
    if (!identities.length || identities.some((identity) => seen.has(identity))) return
    identities.forEach((identity) => seen.add(identity))
    records.push(formatted)
  }

  for (const item of enquiries) {
    add(bookingFromEnquiry(item))
  }
  for (const item of legacyEnquiries) {
    add(bookingFromEnquiry(item))
  }
  for (const item of bookings) {
    add({ ...jsonRecord(item), source: 'booking' })
  }

  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function summarizeBookingRecords(bookings = [], enquiries = [], legacyEnquiries = []) {
  const records = mergeBookingRecords(bookings, enquiries, legacyEnquiries)
  const statuses = {}
  const monthlyCounts = new Map()

  for (const record of records) {
    const status = record.status || 'unknown'
    statuses[status] = (statuses[status] ?? 0) + 1

    const createdAt = new Date(record.createdAt)
    if (!Number.isFinite(createdAt.getTime())) continue
    const month = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1)
  }

  return {
    records,
    counts: {
      bookings: records.filter(
        (record) =>
          record.source === 'booking' ||
          (record.source === 'booking-enquiry' && String(record.reference ?? '').trim()),
      ).length,
      bookingEnquiries: records.filter(
        (record) => record.source === 'booking-enquiry' && String(record.reference ?? '').trim(),
      ).length,
    },
    bookingStatuses: statuses,
    bookingTrends: [...monthlyCounts]
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(-12)
      .map(([label, value]) => ({ label, value })),
    recentBookings: records.slice(0, 5).map(jsonRecord),
  }
}

async function listBookings(request, legacyBookingEnquiryModel = LegacyBookingEnquiry) {
  const { page, pageSize } = parsePage(request)
  const [bookings, enquiries, legacyEnquiries] = await Promise.all([
    Booking.find({}).sort({ createdAt: -1 }).lean(),
    BookingEnquiry.find({}).sort({ createdAt: -1 }).lean(),
    legacyBookingEnquiryModel
      ? legacyBookingEnquiryModel.find({}).sort({ createdAt: -1 }).lean()
      : Promise.resolve([]),
  ])
  let items = mergeBookingRecords(bookings, enquiries, legacyEnquiries)
  const status = typeof request.query.status === 'string'
    ? request.query.status.trim()
    : ''
  if (bookingStatusValues.includes(status)) {
    items = items.filter((item) => item.status === status)
  }
  const paymentStatus = typeof request.query.paymentStatus === 'string'
    ? request.query.paymentStatus.trim()
    : ''
  if (['not_required', 'pending', 'verified', 'paid', 'failed', 'unpaid', 'demo_paid', 'processing', 'refunded'].includes(paymentStatus)) {
    items = items.filter((item) => item.paymentStatus === paymentStatus)
  }
  const paymentProviderFilter = typeof request.query.paymentProvider === 'string'
    ? request.query.paymentProvider.trim().toLowerCase()
    : ''
  if (paymentProviderFilter) {
    items = items.filter((item) => (item.paymentProvider || '').toLowerCase() === paymentProviderFilter)
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
        item.mobile,
        item.category,
        item.event,
        item.event?.title,
        item.paymentOrderId,
        item.razorpayPaymentId,
        item.cfOrderId,
        item.cfPaymentId,
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

async function getWorkspace({
  diwaliOfferService,
  legacyBookingEnquiryModel = LegacyBookingEnquiry,
} = {}) {
  const [
    users,
    organizers,
    events,
    bookings,
    bookingEnquiries,
    legacyBookingEnquiries,
    categories,
    testimonials,
    subscribers,
    enquiries,
    gallery,
    admins,
    activity,
    settingsRecord,
    diwaliOffer,
  ] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Organizer.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Event.find({}).sort({ date: 1 }).limit(500).lean(),
    Booking.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    BookingEnquiry.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    legacyBookingEnquiryModel
      ? legacyBookingEnquiryModel.find({}).sort({ createdAt: -1 }).limit(500).lean()
      : Promise.resolve([]),
    Category.find({}).sort({ title: 1 }).limit(500).lean(),
    Testimonial.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Subscriber.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Enquiry.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    GalleryItem.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    AdminCredential.find({}).select('username role active createdAt lastLoginAt').sort({ createdAt: -1 }).limit(500).lean(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    PlatformSetting.findOne({ key: 'platform' }).lean(),
    diwaliOfferService?.getOffer?.() ?? Promise.resolve(null),
  ])

  return {
    users: users.map(jsonRecord),
    organizers: organizers.map(jsonRecord),
    events: events.map(jsonRecord),
    bookings: mergeBookingRecords(bookings, bookingEnquiries, legacyBookingEnquiries),
    categories: categories.map(jsonRecord),
    testimonials: testimonials.map(jsonRecord),
    subscribers: subscribers.map(jsonRecord),
    enquiries: enquiries.map(jsonRecord),
    gallery: gallery.map(jsonRecord),
    admins: admins.map(jsonRecord),
    activity: activity.map(jsonRecord),
    settings: settingsRecord?.value ?? null,
    diwaliOffer,
  }
}

async function getOverview(legacyBookingEnquiryModel = LegacyBookingEnquiry) {
  const [
    users,
    organizers,
    events,
    categories,
    testimonials,
    subscribers,
    enquiries,
    bookingRecords,
    bookingEnquiryRecords,
    legacyBookingEnquiryRecords,
    recentUsers,
    activity,
    monthlyUsers,
  ] = await Promise.all([
    User.countDocuments(),
    Organizer.countDocuments(),
    Event.countDocuments(),
    Category.countDocuments(),
    Testimonial.countDocuments(),
    Subscriber.countDocuments({ status: 'subscribed' }),
    Enquiry.countDocuments({ status: 'pending' }),
    Booking.find({}).sort({ createdAt: -1 }).lean(),
    BookingEnquiry.find({}).sort({ createdAt: -1 }).lean(),
    legacyBookingEnquiryModel
      ? legacyBookingEnquiryModel.find({}).sort({ createdAt: -1 }).lean()
      : Promise.resolve([]),
    User.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    User.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]),
  ])
  const eventStatuses = await Event.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])
  const bookingSummary = summarizeBookingRecords(
    bookingRecords,
    bookingEnquiryRecords,
    legacyBookingEnquiryRecords,
  )

  return {
    counts: {
      users,
      organizers,
      events,
      ...bookingSummary.counts,
      categories,
      testimonials,
      subscribers,
      pendingEnquiries: enquiries,
    },
    bookingStatuses: bookingSummary.bookingStatuses,
    eventStatuses: Object.fromEntries(eventStatuses.map(({ _id, count }) => [_id, count])),
    userGrowth: monthlyUsers.map(({ _id, count }) => ({ label: _id, value: count })),
    bookingTrends: bookingSummary.bookingTrends,
    recentBookings: bookingSummary.recentBookings,
    recentUsers: recentUsers.map(jsonRecord),
    recentActivity: activity.map(jsonRecord),
  }
}

export function createAdminRouter({
  sessionSecret,
  adminModel = AdminCredential,
  sessionModel = AdminSession,
  legacyBookingEnquiryModel = LegacyBookingEnquiry,
  bookingEnquiryRepository,
  cashfreeRecovery,
  unmatchedPaymentModel = UnmatchedCashfreePayment,
  diwaliOfferService,
  whatsappNotifications,
}) {
  const router = Router()
  const requireAdmin = createRequireAdmin({
    sessionSecret,
    model: adminModel,
    sessionModel,
  })

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
      response.json(await getWorkspace({ diwaliOfferService, legacyBookingEnquiryModel }))
    } catch (error) {
      next(error)
    }
  })

  router.get('/overview', async (_request, response, next) => {
    try {
      response.json(await getOverview(legacyBookingEnquiryModel))
    } catch (error) {
      next(error)
    }
  })

  const serializeUnmatchedCashfreePayment = (record) => ({
    id: String(record._id),
    providerOrderId: record.providerOrderId,
    providerPaymentId: record.providerPaymentId,
    amount: record.amount,
    currency: record.currency,
    providerStatus: record.providerStatus,
    providerEventType: record.providerEventType,
    eventTime: record.eventTime ?? null,
    processingStatus: record.processingStatus,
    receivedAt: record.receivedAt,
    lastSeenAt: record.lastSeenAt,
    reconciledAt: record.reconciledAt ?? null,
    reconciledBy: record.reconciledBy ?? '',
    caseReference: record.caseReference ?? '',
    reconciliationReason: record.reconciliationReason ?? '',
    reconciliationOutcome: record.reconciliationOutcome ?? '',
    matchedRequestId: record.matchedRequestId ?? '',
    lastAttemptedAt: record.lastAttemptedAt ?? null,
    lastAttemptedBy: record.lastAttemptedBy ?? '',
    lastAttemptCaseReference: record.lastAttemptCaseReference ?? '',
    lastAttemptReason: record.lastAttemptReason ?? '',
    lastAttemptOutcome: record.lastAttemptOutcome ?? '',
  })

  router.get('/cashfree/unmatched-payments', async (request, response, next) => {
    try {
      if (!requireSuperAdmin(request, response)) return
      const { page, pageSize } = parsePage(request)
      const status = typeof request.query.status === 'string'
        ? request.query.status.trim()
        : ''
      const allowedStatuses = new Set([
        'unmatched',
        'review_required',
        'reconciliation_failed',
        'reconciled',
      ])
      if (status && !allowedStatuses.has(status)) {
        response.status(400).json({ message: 'Invalid unmatched payment status.' })
        return
      }

      const filter = status ? { processingStatus: status } : {}
      const [items, total] = await Promise.all([
        unmatchedPaymentModel.find(filter)
          .sort({ receivedAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        unmatchedPaymentModel.countDocuments(filter),
      ])
      response.json({
        items: items.map(serializeUnmatchedCashfreePayment),
        page,
        pageSize,
        total,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/cashfree/unmatched-payments/:eventId', async (request, response, next) => {
    try {
      if (!requireSuperAdmin(request, response)) return
      if (!mongoose.Types.ObjectId.isValid(request.params.eventId)) {
        response.status(404).json({ message: 'Unmatched Cashfree payment was not found.' })
        return
      }
      const record = await unmatchedPaymentModel.findById(request.params.eventId).lean()
      if (!record) {
        response.status(404).json({ message: 'Unmatched Cashfree payment was not found.' })
        return
      }
      response.json({ item: serializeUnmatchedCashfreePayment(record) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/cashfree/unmatched-payments/:eventId/reconcile', async (request, response, next) => {
    try {
      if (!requireSuperAdmin(request, response)) return
      if (!mongoose.Types.ObjectId.isValid(request.params.eventId)) {
        response.status(404).json({ message: 'Unmatched Cashfree payment was not found.' })
        return
      }
      if (typeof cashfreeRecovery?.reconcile !== 'function') {
        response.status(503).json({ message: 'Cashfree reconciliation is unavailable.' })
        return
      }

      const requestId = typeof request.body?.requestId === 'string'
        ? request.body.requestId.trim()
        : ''
      const caseReference = typeof request.body?.caseReference === 'string'
        ? request.body.caseReference.trim().toUpperCase()
        : ''
      const reasonCode = typeof request.body?.reasonCode === 'string'
        ? request.body.reasonCode.trim()
        : ''
      if (
        !requestId ||
        requestId.length > 80 ||
        !/^(?:CASE|CS|INC)-\d{3,8}$/.test(caseReference) ||
        !['unmatched_webhook', 'late_payment', 'identity_confirmed'].includes(reasonCode)
      ) {
        response.status(400).json({
          message: 'A valid booking request ID, case reference, and reconciliation reason are required.',
        })
        return
      }

      const result = await cashfreeRecovery.reconcile({
        eventId: request.params.eventId,
        requestId,
        actor: request.admin,
        caseReference,
        reasonCode,
      })
      response.status(result.reconciled ? 200 : 409).json(result)
    } catch (error) {
      const errorCode = Number(error?.code)
      const errorStatus = Number(error?.status)
      const status = Number.isInteger(errorStatus) && errorStatus >= 400 && errorStatus <= 599
        ? errorStatus
        : 500
      const message = status < 500 && typeof error?.message === 'string'
        ? error.message
        : 'Cashfree reconciliation could not be completed.'
      const safeError = Object.assign(new Error(message), {
        status,
        code: Number.isSafeInteger(errorCode) ? errorCode : null,
      })
      console.error('[Admin Cashfree recovery] Request failed.', {
        status,
        code: safeError.code,
      })
      next(safeError)
    }
  })

  router.get('/integrations/diagnostics', async (_request, response, next) => {
    try {
      response.set('Cache-Control', 'no-store').json({
        whatsapp: await whatsappNotifications?.getDiagnostics?.() ?? {
          notificationConfigured: false,
          apiAccess: 'not_checked',
          apiError: 'WhatsApp notification service is unavailable.',
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/bookings', async (request, response, next) => {
    try {
      response.json(await listBookings(request, legacyBookingEnquiryModel))
    } catch (error) {
      next(error)
    }
  })

  router.post('/upi-payments/:requestId/decision', async (request, response, next) => {
    const { requestId } = request.params
    const { decision, rejectionReason = '' } = request.body ?? {}
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
      !['approve', 'reject'].includes(decision) ||
      typeof rejectionReason !== 'string' ||
      rejectionReason.length > 500
    ) {
      response.status(400).json({ message: 'Provide a valid UPI payment decision and rejection reason.' })
      return
    }

    try {
      const result = await bookingEnquiryRepository?.verifyUpiPayment?.(requestId, {
        decision,
        rejectionReason,
        adminId: request.admin.id,
      })
      if (!result) {
        response.status(404).json({ message: 'The UPI payment could not be found or reviewed.' })
        return
      }
      if (!result.duplicate) {
        await writeAudit(
          request,
          `UPI payment ${decision === 'approve' ? 'verified' : 'rejected'}`,
          'upi-payment',
          requestId,
          decision === 'approve'
            ? `UPI payment verified for booking ${result.enquiry.reference}.`
            : `UPI payment rejected for booking request ${requestId}.`,
        )
      }
      response.json({
        message: decision === 'approve'
          ? 'UPI payment verified and booking confirmed.'
          : 'UPI payment rejected.',
        duplicate: Boolean(result.duplicate),
        item: bookingFromEnquiry(result.enquiry),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/bookings/:reference/whatsapp', async (request, response, next) => {
    try {
      const enquiry = await bookingEnquiryRepository?.findByReference?.(request.params.reference)
      if (!enquiry) {
        response.status(404).json({ message: 'Booking enquiry was not found.' })
        return
      }
      response.json({
        reference: enquiry.reference,
        status: enquiry.whatsappNotification?.status ?? 'not_available',
        attemptCount: enquiry.whatsappNotification?.attemptCount ?? 0,
        lastAttemptAt: enquiry.whatsappNotification?.lastAttemptAt ?? null,
        sentAt: enquiry.whatsappNotification?.sentAt ?? null,
        deliveredAt: enquiry.whatsappNotification?.deliveredAt ?? null,
        providerMessageId: enquiry.whatsappNotification?.providerMessageId ?? '',
        history: enquiry.whatsappNotification?.history ?? [],
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/bookings/:reference/whatsapp/retry', async (request, response, next) => {
    try {
      const identifier = request.params.reference
      const resolveByReference = bookingEnquiryRepository?.resolveByReference
      if (typeof resolveByReference !== 'function') {
        throw Object.assign(new Error('Booking retry lookup is unavailable.'), { status: 503 })
      }

      const resolved = await resolveByReference(identifier)
      const enquiry = resolved?.enquiry ?? null
      if (!enquiry) {
        console.warn('[Admin WhatsApp retry] Booking enquiry lookup failed.', {
          identifierType: bookingEnquiryIdentifierType(identifier),
        })
        response.status(404).json({ message: 'Booking enquiry was not found.' })
        return
      }
      if (
        typeof resolved.model?.findOne !== 'function' ||
        typeof resolved.model.findOneAndUpdate !== 'function'
      ) {
        throw Object.assign(new Error('Booking retry lookup is unavailable.'), { status: 503 })
      }
      console.info('[Admin WhatsApp retry] Booking enquiry lookup succeeded.', {
        identifierType: bookingEnquiryIdentifierType(identifier),
        matchedBy: bookingEnquiryMatchedBy(enquiry, identifier),
        ...(resolved?.sourceCollection ? { sourceCollection: resolved.sourceCollection } : {}),
      })

      const target = request.body?.target || 'primary'
      const attendeeIndex = typeof request.body?.attendeeIndex === 'number' ? request.body.attendeeIndex : undefined

      // If targeted resend via whatsappNotifications.resendNotification is available:
      if (typeof whatsappNotifications?.resendNotification === 'function') {
        const result = await whatsappNotifications.resendNotification(enquiry.requestId, {
          target,
          attendeeIndex,
          force: true,
          source: 'admin_manual_retry',
          booking: enquiry,
          bookingModel: resolved.model,
        })
        const outcome = result?.outcome ?? getWhatsAppNotificationOutcome(result?.result ?? result)
        const notificationType = result?.notificationType ??
          (target === 'admin'
            ? 'admin_alert'
            : target === 'attendee'
              ? 'booking_confirmation'
              : enquiry.whatsappNotification?.messageType ?? 'unknown')
        logWhatsAppNotificationResult(result?.result ?? result, {
          source: 'admin_manual_retry',
          notificationType,
          identity: enquiry.requestId,
        })
        const updated = resolved
          ? await resolved.model.findOne({ _id: enquiry._id, requestId: enquiry.requestId }).lean() ?? enquiry
          : await bookingEnquiryRepository?.findByReference?.(identifier) ?? enquiry
        response.json({
          outcome,
          notificationType,
          message: result?.message || (
            outcome === 'notification_accepted'
              ? 'WhatsApp notification was accepted by the provider.'
              : outcome === 'notification_provider_rejected'
                ? 'WhatsApp provider rejected the notification.'
                : outcome === 'notification_provider_uncertain'
                  ? 'WhatsApp provider response was uncertain; retry was withheld to prevent a duplicate.'
                  : 'WhatsApp notification was skipped; no message was sent.'
          ),
          result,
          notification: updated.whatsappNotification,
          attendeeNotifications: updated.attendeeNotifications,
          adminNotification: updated.adminNotification,
          booking: jsonRecord(updated),
        })
        return
      }

      if (!enquiry.whatsappConsent) {
        logWhatsAppNotification('SKIPPED', {
          source: 'admin_manual_retry',
          notificationType: 'payment_assistance',
          identity: enquiry.requestId,
          reason: enquiry.whatsappOptedOutAt ? 'Customer opted out' : 'Customer consent missing',
        })
        response.status(200).json({
          outcome: 'notification_skipped',
          notificationType: enquiry.whatsappNotification?.messageType ?? 'unknown',
          message: enquiry.whatsappOptedOutAt
            ? 'Customer opted out; notification was skipped.'
            : 'Customer has not provided WhatsApp consent; notification was skipped.',
        })
        return
      }
      const currentStatus = enquiry.whatsappNotification?.status
      if (['delivered', 'read'].includes(currentStatus)) {
        response.status(409).json({
          outcome: 'notification_skipped',
          message: 'WhatsApp notification was already delivered. No duplicate message was sent.',
          alreadyDelivered: true,
          status: currentStatus,
          notification: enquiry.whatsappNotification,
        })
        return
      }
      const type = enquiry.whatsappNotification?.messageType
      if (!['booking_confirmation', 'payment_success', 'payment_assistance', 'payment_failed'].includes(type)) {
        response.status(200).json({
          outcome: 'notification_skipped',
          notificationType: 'unknown',
          message: 'Stored notification type is missing; retry was skipped.',
        })
        return
      }
      const result = await whatsappNotifications?.notify?.(enquiry.requestId, type, {
        force: true,
        retry: true,
        source: 'admin_manual_retry',
      })
      const outcome = getWhatsAppNotificationOutcome(result)
      logWhatsAppNotificationResult(result, {
        source: 'admin_manual_retry',
        notificationType: type,
        identity: enquiry.requestId,
      })
      const updated = await bookingEnquiryRepository?.findByReference?.(identifier) ?? enquiry
      response.json({
        outcome,
        notificationType: type,
        message: result?.sent
          ? 'WhatsApp notification was accepted by the provider.'
          : result?.providerRejected
            ? 'WhatsApp provider rejected the notification.'
            : result?.uncertain
              ? 'WhatsApp provider response was uncertain; retry was withheld to prevent a duplicate.'
              : result?.pending
                ? 'Payment is still pending; the WhatsApp notification was skipped.'
                : result?.duplicate || result?.alreadyDelivered
                  ? 'Notification was already processed; no duplicate WhatsApp message was sent.'
                  : 'WhatsApp notification was skipped; no message was sent.',
        result,
        notification: updated.whatsappNotification,
        attendeeNotifications: updated.attendeeNotifications,
        adminNotification: updated.adminNotification,
        booking: jsonRecord(updated),
      })
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

  router.post('/upload', async (request, response, next) => {
    try {
      const { filename, mimeType, data } = request.body || {}
      if (!data || typeof data !== 'string') {
        response.status(400).json({ message: 'Valid image data is required.' })
        return
      }

      const cleanMimeType = (mimeType || '').toLowerCase().trim()
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
      if (!allowedMimeTypes.includes(cleanMimeType)) {
        response.status(400).json({ message: 'Only JPG, PNG, WEBP, GIF, and SVG images are supported.' })
        return
      }

      const base64PrefixMatch = data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,/)
      const rawBase64 = base64PrefixMatch ? data.slice(base64PrefixMatch[0].length) : data
      const buffer = Buffer.from(rawBase64, 'base64')

      if (buffer.length === 0) {
        response.status(400).json({ message: 'Image data cannot be empty.' })
        return
      }

      const maxSizeBytes = 10 * 1024 * 1024
      if (buffer.length > maxSizeBytes) {
        response.status(400).json({ message: 'Image exceeds the maximum allowed size of 10MB.' })
        return
      }

      const cleanFilename = String(filename || 'image.jpg')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 100)

      const asset = await MediaAsset.create({
        filename: cleanFilename,
        mimeType: cleanMimeType,
        size: buffer.length,
        data: buffer,
        uploadedBy: request.admin?.username || 'admin',
      })

      const relativeUrl = `/api/media/${asset._id}`

      await writeAudit(request, 'Image uploaded', 'media', String(asset._id), `Uploaded image asset ${cleanFilename} (${Math.round(buffer.length / 1024)} KB).`)

      response.status(201).json({
        url: relativeUrl,
        relativeUrl,
        id: String(asset._id),
        filename: asset.filename,
        size: asset.size,
      })
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

  const runBookingLookupQuery = async (model, query) => {
    if (!model || typeof model.find !== 'function') return []
    try {
      const cursor = model.find(query)
      if (typeof cursor?.limit === 'function') {
        cursor.limit(2)
      }
      if (typeof cursor?.lean === 'function') {
        return await cursor.lean()
      }
      if (typeof cursor?.exec === 'function') {
        return await cursor.exec()
      }
      return (await Promise.resolve(cursor)) ?? []
    } catch {
      return []
    }
  }

  router.patch('/bookings/:reference', async (request, response, next) => {
    try {
      const reference = request.params.reference?.trim?.() ?? ''
      if (!reference) {
        response.status(404).json({ message: 'Booking record was not found.' })
        return
      }
      const status = request.body?.status
      if (!bookingStatusValues.includes(status)) {
        response.status(400).json({ message: 'Choose a supported booking status.' })
        return
      }

      const isObjectId = /^[0-9a-fA-F]{24}$/.test(reference)
      const bookingQuery = isObjectId
        ? { $or: [{ reference }, { requestId: reference }, { _id: reference }] }
        : { $or: [{ reference }, { requestId: reference }] }
      const enquiryQuery = isObjectId
        ? { $or: [{ reference }, { requestId: reference }, { _id: reference }] }
        : { $or: [{ reference }, { requestId: reference }] }

      const shouldQueryLegacy =
        legacyBookingEnquiryModel &&
        (legacyBookingEnquiryModel !== LegacyBookingEnquiry || mongoose.connection?.readyState === 1)

      const [bookingMatches, enquiryMatches, legacyMatches] = await Promise.all([
        runBookingLookupQuery(Booking, bookingQuery),
        runBookingLookupQuery(BookingEnquiry, enquiryQuery),
        shouldQueryLegacy ? runBookingLookupQuery(legacyBookingEnquiryModel, enquiryQuery) : Promise.resolve([]),
      ])

      const isSameRecord =
        bookingMatches.length === 1 &&
        enquiryMatches.length === 1 &&
        String(bookingMatches[0]._id) === String(enquiryMatches[0]._id)

      const isSameLegacyRecord =
        bookingMatches.length === 1 &&
        legacyMatches.length === 1 &&
        String(bookingMatches[0]._id) === String(legacyMatches[0]._id)

      const activeEnquiries = enquiryMatches.length ? enquiryMatches : legacyMatches
      const isLegacy = !enquiryMatches.length && legacyMatches.length > 0

      if (
        bookingMatches.length > 1 ||
        activeEnquiries.length > 1 ||
        (!isSameRecord && !isSameLegacyRecord && bookingMatches.length && activeEnquiries.length)
      ) {
        response.status(409).json({
          message: 'This booking identifier matches multiple records; no record was updated.',
        })
        return
      }

      let booking = bookingMatches[0] ?? null
      const enquiry = activeEnquiries[0] ?? null

      if (!booking && !enquiry) {
        response.status(404).json({ message: 'Booking record was not found.' })
        return
      }

      if (enquiry && !booking) {
        if (enquiry.status === 'cancelled' && status !== 'cancelled') {
          response.status(409).json({ message: 'A cancelled booking cannot be reactivated.' })
          return
        }
        if (typeof enquiry.save === 'function') {
          enquiry.status = status
          await enquiry.save()
        } else if (isLegacy && legacyBookingEnquiryModel && typeof legacyBookingEnquiryModel.updateOne === 'function') {
          await legacyBookingEnquiryModel.updateOne({ _id: enquiry._id }, { $set: { status } })
          enquiry.status = status
        } else if (typeof BookingEnquiry.updateOne === 'function') {
          await BookingEnquiry.updateOne({ _id: enquiry._id }, { $set: { status } })
          enquiry.status = status
        }
        await writeAudit(request, 'Booking enquiry status changed', 'booking-enquiry', reference, `Booking enquiry status changed to ${status}.`)
        const enquiryObj = typeof enquiry.toObject === 'function' ? enquiry.toObject() : enquiry
        response.json({ item: bookingFromEnquiry(enquiryObj) })
        return
      }

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
          { ...bookingQuery, status: { $ne: 'cancelled' }, paymentStatus: 'not_required' },
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
          const recheckList = await runQuery(Booking, bookingQuery)
          const recheck = recheckList[0] ?? null
          if (!recheck || recheck.status !== 'cancelled') {
            response.status(409).json({ message: 'The booking status changed. Refresh and retry.' })
            return
          }
          booking = recheck
        }
      } else {
        if (typeof booking.save === 'function') {
          booking.status = status
          await booking.save()
        } else if (typeof Booking.updateOne === 'function') {
          await Booking.updateOne({ _id: booking._id }, { $set: { status } })
          booking.status = status
        }
      }

      if (enquiry) {
        if (typeof enquiry.save === 'function') {
          enquiry.status = status
          await enquiry.save()
        } else if (isLegacy && legacyBookingEnquiryModel && typeof legacyBookingEnquiryModel.updateOne === 'function') {
          await legacyBookingEnquiryModel.updateOne({ _id: enquiry._id }, { $set: { status } })
          enquiry.status = status
        } else if (typeof BookingEnquiry.updateOne === 'function') {
          await BookingEnquiry.updateOne({ _id: enquiry._id }, { $set: { status } })
          enquiry.status = status
        }
      }

      await writeAudit(request, 'Booking status changed', 'booking', reference, `Booking status changed to ${status}.`)
      response.json({ item: { ...jsonRecord(booking), source: 'booking' } })
      return
    } catch (error) {
      next(error)
    }
  })

  router.delete('/bookings/:reference', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) {
      return
    }
    try {
      const reference = request.params.reference?.trim?.() ?? ''
      if (!reference) {
        response.status(404).json({ message: 'Booking record was not found.' })
        return
      }
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(reference)
      const bookingQuery = isObjectId
        ? { $or: [{ reference }, { requestId: reference }, { _id: reference }] }
        : { $or: [{ reference }, { requestId: reference }] }
      const enquiryQuery = isObjectId
        ? { $or: [{ reference }, { requestId: reference }, { _id: reference }] }
        : { $or: [{ reference }, { requestId: reference }] }

      const shouldQueryLegacy =
        legacyBookingEnquiryModel &&
        (legacyBookingEnquiryModel !== LegacyBookingEnquiry || mongoose.connection?.readyState === 1)

      const [bookingMatches, enquiryMatches, legacyMatches] = await Promise.all([
        runBookingLookupQuery(Booking, bookingQuery),
        runBookingLookupQuery(BookingEnquiry, enquiryQuery),
        shouldQueryLegacy
          ? runBookingLookupQuery(legacyBookingEnquiryModel, enquiryQuery)
          : Promise.resolve([]),
      ])

      const isSameRecord =
        bookingMatches.length === 1 &&
        enquiryMatches.length === 1 &&
        String(bookingMatches[0]._id) === String(enquiryMatches[0]._id)

      const isSameLegacyRecord =
        bookingMatches.length === 1 &&
        legacyMatches.length === 1 &&
        String(bookingMatches[0]._id) === String(legacyMatches[0]._id)

      const activeEnquiries = enquiryMatches.length ? enquiryMatches : legacyMatches
      const isLegacy = !enquiryMatches.length && legacyMatches.length > 0

      if (
        bookingMatches.length > 1 ||
        activeEnquiries.length > 1 ||
        (!isSameRecord && !isSameLegacyRecord && bookingMatches.length && activeEnquiries.length)
      ) {
        response.status(409).json({
          message: 'This booking identifier matches multiple records; no record was deleted.',
        })
        return
      }
      const booking = bookingMatches[0] ?? null
      const enquiry = activeEnquiries[0] ?? null
      if (!booking && !enquiry) {
        response.status(404).json({ message: 'Booking record was not found.' })
        return
      }

      const record = booking ?? enquiry
      if (hasPaymentEvidence(record, booking ? 'booking' : 'enquiry')) {
        response.status(409).json({
          message: 'This booking has payment activity or financial history and cannot be deleted.',
        })
        return
      }
      if (!record._id) {
        response.status(409).json({
          message: 'The booking could not be uniquely verified; no record was deleted.',
        })
        return
      }

      const conditionalFilter = {
        _id: record._id,
        ...emptyPaymentEvidenceFilter(booking ? 'booking' : 'enquiry'),
      }
      const deleted = booking
        ? await Booking.findOneAndDelete(conditionalFilter).lean()
        : isLegacy && legacyBookingEnquiryModel
          ? await legacyBookingEnquiryModel.findOneAndDelete(conditionalFilter).lean()
          : await BookingEnquiry.findOneAndDelete(conditionalFilter).lean()
      if (!deleted) {
        response.status(409).json({
          message: 'The booking payment state changed or financial evidence appeared. Refresh and retry.',
        })
        return
      }

      if (booking) {
        if (deleted.status !== 'cancelled') {
          await Event.updateOne({ id: deleted.eventId }, { $inc: { seatsAvailable: deleted.ticketCount } })
        }
        await writeAudit(request, 'Booking deleted', 'booking', reference, 'Booking record deleted by an authorized admin.')
        response.status(204).end()
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
        const deletion = await deleteEventRecord({
          record,
          eventModel: model,
          bookingCount,
          enquiryCount,
        })
        if (deletion.status !== 204) {
          response.status(deletion.status).json(
            deletion.message ? { message: deletion.message } : { message: 'Record was not found.' },
          )
          return
        }
      } else if (resource === 'categories') {
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
      if (resource !== 'events') {
        await model.deleteOne({ _id: record._id })
      }
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

  router.get('/settings/diwali-offer', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) return
    try {
      if (!diwaliOfferService?.getOffer) {
        response.status(503).json({ message: 'Offer settings are temporarily unavailable.' })
        return
      }
      response.json({ offer: await diwaliOfferService.getOffer() })
    } catch (error) {
      next(error)
    }
  })

  router.put('/settings/diwali-offer', async (request, response, next) => {
    if (!requireSuperAdmin(request, response)) return
    try {
      if (!diwaliOfferService?.updateOffer) {
        response.status(503).json({ message: 'Offer settings are temporarily unavailable.' })
        return
      }
      const offer = await diwaliOfferService.updateOffer(request.body)
      await writeAudit(request, 'Diwali offer updated', 'settings', 'diwali-special', 'Diwali offer settings updated.')
      response.json({ offer })
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
