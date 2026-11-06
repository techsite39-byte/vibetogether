import { contactConfig } from '../data/contact.js'

export function getWhatsAppUrl(message) {
  if (!contactConfig.whatsappNumber) {
    return ''
  }

  return `https://wa.me/${contactConfig.whatsappNumber}?text=${encodeURIComponent(
    message,
  )}`
}
