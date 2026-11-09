import { Router } from 'express'
import { PlatformSetting } from '../models/adminRecords.js'

const socialFields = [
  ['Instagram', 'socialInstagram'],
  ['Facebook', 'socialFacebook'],
  ['YouTube', 'socialYoutube'],
  ['LinkedIn', 'socialLinkedin'],
]

function safeSocialUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

export function createPublicSettingsRouter({
  platformSettingModel = PlatformSetting,
  diwaliOfferService,
} = {}) {
  const router = Router()

  router.get('/social', async (_request, response, next) => {
    try {
      const record = await platformSettingModel.findOne({ key: 'platform' }).lean()
      const settings = record?.value ?? {}
      const socialLinks = socialFields.flatMap(([label, field]) => {
        const url = safeSocialUrl(settings[field])
        return url ? [{ label, url }] : []
      })

      response.set('Cache-Control', 'no-store').json({ socialLinks })
    } catch (error) {
      next(error)
    }
  })

  router.get('/diwali-offer', async (_request, response, next) => {
    try {
      if (!diwaliOfferService?.getOffer) {
        response.status(503).json({ message: 'Offer pricing is temporarily unavailable.' })
        return
      }
      response.set('Cache-Control', 'no-store').json({
        offer: await diwaliOfferService.getOffer(),
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}