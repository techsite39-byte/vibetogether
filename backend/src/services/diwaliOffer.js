import { DiwaliOffer } from '../models/diwaliOffer.js'

export const DIWALI_OFFER_KEY = 'diwali-special'
export const DIWALI_OFFER_DURATION_MS = 72 * 60 * 60 * 1000
export const DIWALI_REGULAR_PRICE = 299
export const DIWALI_OFFER_PRICE = 249
export const DEFAULT_TICKET_TYPE = 'general-admission'
export const BOOKING_TICKET_TYPES = Object.freeze([
  Object.freeze({ id: DEFAULT_TICKET_TYPE, name: 'General Admission' }),
])

export function calculateTicketPricing(pricing, ticketQuantity = 1, ticketType = DEFAULT_TICKET_TYPE) {
  const selectedType = BOOKING_TICKET_TYPES.find(({ id }) => id === ticketType)
  if (
    !selectedType ||
    !Number.isInteger(ticketQuantity) ||
    ticketQuantity < 1 ||
    ticketQuantity > 10
  ) {
    throw offerError('Choose a valid ticket type and a quantity from 1 to 10.')
  }

  const regularPrice = pricing.regularPrice ?? DIWALI_REGULAR_PRICE
  const offerPrice = pricing.offerPrice ?? DIWALI_OFFER_PRICE
  const discount = pricing.diwaliOfferApplied
    ? (regularPrice - offerPrice) * ticketQuantity
    : 0
  const subtotal = regularPrice * ticketQuantity
  const finalAmount = subtotal - discount

  return {
    ...pricing,
    ticketType: selectedType.id,
    ticketTypeName: selectedType.name,
    ticketQuantity,
    pricePerTicket: regularPrice,
    subtotal,
    discount,
    finalAmount,
    paymentAmount: finalAmount,
    paymentAmountPaise: finalAmount * 100,
  }
}

function offerError(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function currentStatus(offer, now) {
  if (!offer.enabled) return 'disabled'
  if (now < new Date(offer.activationAt)) return 'scheduled'
  if (now < new Date(offer.expiresAt)) return 'active'
  return 'expired'
}

export async function ensureDiwaliOffer({
  model = DiwaliOffer,
  now = () => new Date(),
} = {}) {
  if (typeof model.init === 'function') await model.init()
  const existing = await model.findOne({ key: DIWALI_OFFER_KEY }).lean()
  if (existing) return existing

  const activationAt = now()
  const expiresAt = new Date(activationAt.getTime() + DIWALI_OFFER_DURATION_MS)
  try {
    const created = await model.create({
      key: DIWALI_OFFER_KEY,
      enabled: true,
      regularPrice: DIWALI_REGULAR_PRICE,
      offerPrice: DIWALI_OFFER_PRICE,
      activationAt,
      expiresAt,
    })
    return typeof created.toObject === 'function' ? created.toObject() : created
  } catch (error) {
    if (error.code !== 11000) throw error
    const raced = await model.findOne({ key: DIWALI_OFFER_KEY }).lean()
    if (!raced) throw error
    return raced
  }
}

export function serializeDiwaliOffer(offer, now = new Date()) {
  const status = currentStatus(offer, now)
  return {
    enabled: Boolean(offer.enabled),
    regularPrice: offer.regularPrice,
    offerPrice: offer.offerPrice,
    savings: offer.regularPrice - offer.offerPrice,
    ticketTypes: BOOKING_TICKET_TYPES,
    activationAt: new Date(offer.activationAt).toISOString(),
    expiresAt: new Date(offer.expiresAt).toISOString(),
    status,
    active: status === 'active',
    timezone: 'Asia/Kolkata',
    serverTime: now.toISOString(),
  }
}

export function createDiwaliOfferService({
  model = DiwaliOffer,
  now = () => new Date(),
} = {}) {
  async function getOffer() {
    const offer = await ensureDiwaliOffer({ model, now })
    return serializeDiwaliOffer(offer, now())
  }

  async function getPricing() {
    const offer = await ensureDiwaliOffer({ model, now })
    const status = currentStatus(offer, now())
    const active = status === 'active'
    return {
      paymentAmount: active ? offer.offerPrice : offer.regularPrice,
      paymentAmountPaise: (active ? offer.offerPrice : offer.regularPrice) * 100,
      regularPrice: offer.regularPrice,
      offerPrice: offer.offerPrice,
      diwaliOfferApplied: active,
      offerActivationAt: offer.activationAt,
      offerExpiresAt: offer.expiresAt,
    }
  }

  async function updateOffer(input) {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.enabled !== 'boolean' ||
      !Number.isSafeInteger(input.regularPrice) ||
      !Number.isSafeInteger(input.offerPrice) ||
      input.regularPrice < 1 ||
      input.offerPrice < 1 ||
      input.offerPrice >= input.regularPrice
    ) {
      throw offerError('Provide valid Diwali offer settings and prices.')
    }
    const activationAt = new Date(input.activationAt)
    const expiresAt = new Date(input.expiresAt)
    if (
      !Number.isFinite(activationAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() - activationAt.getTime() !== DIWALI_OFFER_DURATION_MS
    ) {
      throw offerError('The offer expiry must be exactly 72 hours after activation.')
    }

    await ensureDiwaliOffer({ model, now })
    const saved = await model.findOneAndUpdate(
      { key: DIWALI_OFFER_KEY },
      {
        $set: {
          enabled: input.enabled,
          regularPrice: input.regularPrice,
          offerPrice: input.offerPrice,
          activationAt,
          expiresAt,
        },
      },
      { new: true, runValidators: true },
    ).lean()
    if (!saved) throw new Error('Diwali offer settings could not be saved.')
    return serializeDiwaliOffer(saved, now())
  }

  return { getOffer, getPricing, updateOffer }
}
