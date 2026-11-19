export {
  createWhatsAppService,
  createWhatsAppService as createWhatsAppNotificationService,
  isValidWhatsAppWebhookSignature,
  buildWhatsAppMessage,
  buildAdminAlertMessage,
  templateBodyParameters,
  formatBookingDate,
  logWhatsAppNotification,
  logWhatsAppNotificationResult,
  createWhatsAppCorrelationId,
  normalizeWhatsAppRecipient,
  normalizeWhatsAppRecipient as normalizeRecipient,
} from './whatsappService.js'
