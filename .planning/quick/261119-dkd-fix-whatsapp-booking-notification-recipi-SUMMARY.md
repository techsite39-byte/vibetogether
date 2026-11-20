---
quick_id: 261119-dkd
status: complete
---

# Quick Task 261119-dkd Summary

**WhatsApp recipient, idempotency, lifecycle, retry, and API outcome handling are corrected while preserving the existing payment/reference lifecycle.**

## Root Causes

- Pending-payment and other ineligible branches returned before preparing notification fields, leaving the normalized primary recipient and idempotency key empty. A retry therefore had no stable identity to persist or report.
- Primary retry fallback could select `payment_assistance` instead of reusing the booking's stored `messageType`; this conflicted with `booking_confirmation` and the separate payment lifecycle types.
- Provider failure, uncertainty, and a skipped notification were not consistently distinguished in admin responses and logging; `failed` alone could be misreported as a provider rejection.
- The missing booking reference on an unpaid booking was consistent with the existing lifecycle, not a defect: Cashfree/demo payment finalization requires the reference to be absent before verified success. Reference allocation must not be moved to initial save or admin retry.
- The canonical model uses `bookings-db`; the legacy resolver can still resolve/update an existing legacy record. New booking writes remain canonical and retry resolution does not copy/create duplicate bookings.

## Changed Files

- `backend/src/services/bookingReferences.js` — Added mock-model-safe reference allocation fallback while preserving the existing atomic counter path.
- `backend/src/services/bookingEnquiries.js` — Initializes consented primary recipient, empty pending reference, and stable requestId/type key; duplicate saves do not invent a reference.
- `backend/src/models/bookingEnquiry.js` — Widened only `whatsappNotification.messageType` to `booking_confirmation`, `payment_success`, `payment_failed`, and `payment_assistance`.
- `backend/src/routes/bookingEnquiries.js` — Added canonical pending booking outcome fields and routed verified success/failure paths to lifecycle-specific types.
- `backend/src/routes/cashfreeWebhook.js` — Routed verified success/failure to `payment_success`/`payment_failed`, with explicit webhook notification outcomes.
- `backend/src/services/whatsappService.js` — Persists normalized primary recipient/reference/key on skips; uses stable requestId/type keys; preserves consent, terminal payment, duplicate, and stored-type guards; classifies accepted, rejected, uncertain, and skipped results separately.
- `backend/src/routes/admin.js`, `backend/src/routes/bookingEnquiries.js`, and `backend/src/routes/cashfreeWebhook.js` — Preserve stored retry type and report lifecycle/payment outcomes accurately without treating HTTP 200 as proof of provider acceptance.
- `backend/src/services/whatsappNotifications.js` — Exposes the shared notification outcome helper.
- `backend/src/services/bookingReferences.js` — Keeps the production atomic counter path and uses a deterministic fallback for mock models lacking counter APIs.
- Regression tests updated/added in `backend/test/booking-enquiries-service.test.js`, `backend/test/booking-enquiries.test.js`, `backend/test/admin-whatsapp-retry.test.js`, `backend/test/admin-whatsapp-resolved-retry.test.js`, `backend/test/cashfreeWebhook.test.js`, `backend/test/cashfreeTerminalFailureWhatsApp.test.js`, `backend/test/whatsappNotifications.test.js`, and `backend/test/whatsappPaymentNotifications.test.js`.
- Pre-existing `src/pages/BookingPayment.jsx` and CSS terminal-failure UI edits were preserved.
- Pre-existing untracked `backend/test/cashfreeTerminalFailureWhatsApp.test.js` and `tests/paymentFailedScreen.test.js` were preserved and integrated.

## Verification

- Focused booking/notification suite: 59 passed, 0 failed; additional terminal failure/webhook/notification suite: 36 passed, 0 failed.
- Full backend suite: 240 passed, 0 failed.
- Root suite: 293 passed, 0 failed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; Vite reports the existing >500 kB chunk-size warning.
- `git diff --check`: passed after final edits.
- No migration, index, schema index reconciliation, collection rename, field/shape migration, MongoDB access, provider call, or real payment was performed.
- No staging, commit, push, merge, branch switch, Render/Vercel/deployment change, or package install was performed.
- User confirmed the reference lifecycle should remain after verified payment; no payment initiation/finalization behavior was changed.
