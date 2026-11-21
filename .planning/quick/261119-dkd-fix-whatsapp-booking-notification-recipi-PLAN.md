---
quick_id: 261119-dkd
status: complete
depends_on: []
files_modified:
  - backend/src/services/bookingReferences.js
  - backend/src/services/bookingEnquiries.js
  - backend/src/routes/bookingEnquiries.js
  - backend/src/models/bookingEnquiry.js
  - backend/src/services/whatsappService.js
  - backend/src/services/whatsappNotifications.js
  - backend/src/routes/cashfreeWebhook.js
  - backend/src/routes/admin.js
  - backend/test/booking-references.test.js
  - backend/test/booking-enquiries.test.js
  - backend/test/booking-enquiries-service.test.js
  - backend/test/cashfreeTerminalFailureWhatsApp.test.js
  - backend/test/cashfreeWebhook.test.js
  - backend/test/admin-whatsapp-retry.test.js
  - backend/test/admin-whatsapp-resolved-retry.test.js
  - backend/test/whatsappNotifications.test.js
  - backend/test/whatsappPaymentNotifications.test.js
  - tests/adminWhatsAppRetry.test.js
  - tests/paymentFailedScreen.test.js
autonomous: true
---

# Fix WhatsApp Booking Notification Recipient, Reference, Idempotency and Retry Outcomes

<objective>
Trace and repair the complete WhatsApp lifecycle from canonical booking persistence through booking creation, Cashfree success/failure verification, provider dispatch, notification persistence, and admin retry.

Purpose: This is a separate implementation task for the dirty `fix/admin-whatsapp-primary-retry` worktree. It is not Phase 2 evidence-backed performance work and must not modify or authorize any Phase 2 plan, application, or scope.
Output: One durable canonical identity path, consent/recipient-safe notification dispatch, stable duplicate suppression, correct lifecycle outcomes, legacy-compatible retry resolution, and focused no-provider-call regressions.
</objective>

<constraints>
- Preserve every pre-existing worktree edit. Review live diffs and integrate the existing edits in `backend/src/routes/bookingEnquiries.js`, `backend/src/routes/cashfreeWebhook.js`, `backend/src/services/whatsappService.js`, `src/pages/BookingPayment.css`, `src/pages/BookingPayment.jsx`, `backend/test/cashfreeTerminalFailureWhatsApp.test.js`, and `tests/paymentFailedScreen.test.js`; do not revert or replace them.
- Do not use production MongoDB. Use synthetic/mock models and mocked provider calls only.
- No migration, collection rename, field/shape change, new or changed index, and no schema/index reconciliation. The user explicitly approved widening only the existing `whatsappNotification.messageType` enum to persist the four requested lifecycle types. The canonical model remains Mongoose `BookingEnquiry` with `collection: 'bookings-db'`; legacy lookup remains read/resolve compatibility only and must never create or duplicate a canonical booking.
- No real Cashfree payment, WhatsApp message, Render/Vercel change, commit, push, merge, stage, branch checkout/switch, or deployment.
- Do not edit any Phase 2 file or `.planning/phases/02-*` plan or change Phase 2 status. At completion, update only the Quick Tasks Completed entry in `.planning/STATE.md` and write this quick task's SUMMARY.md.
- WhatsApp rejection, uncertainty, skipped dispatch, or persistence failure must not alter payment status or persist a success/failure payment state.
- Current code and regression tests treat `booking_confirmation` as post-payment: it is gated on verified paid status and a canonical reference, and its active configured template is `vibetogether_payment_success`. Do not send it while payment is pending. Use `payment_success` for new verified Cashfree-success notifications, `payment_failed` only for verified terminal failures, and `payment_assistance` only when existing eligibility rules permit it.
- Canonical reference timing follows the existing payment lifecycle: allocate once at verified payment finalization, reuse it afterward, and never allocate during an unpaid booking save or admin retry. This preserves current payment initiation/finalization behavior.
</constraints>

<tasks>

<task type="tracer" tdd="true">
  <name>Tracer: Establish canonical booking creation and outcome contract</name>
  <files>
    backend/src/services/bookingReferences.js,
    backend/src/services/bookingEnquiries.js,
    backend/src/routes/bookingEnquiries.js,
    backend/src/models/bookingEnquiry.js,
    backend/test/booking-references.test.js,
    backend/test/booking-enquiries.test.js
  </files>
  <behavior>
    - New unpaid bookings do not receive a business reference; the existing verified-payment finalization allocates and persists it once, and duplicate callbacks/retries reuse it.
    - Booking creation prepares the consented normalized primary recipient and a stable requestId/type key; the booking reference remains empty until payment finalization.
    - Booking creation responds with `outcome: 'booking_created_payment_pending'` and `paymentState: 'payment_pending'`.
    - A pending or processing payment has no success or terminal-failure notification and no false provider-accepted outcome; an ineligible `booking_confirmation` remains a skipped notification rather than being relabeled as payment assistance.
  </behavior>
  <action>Preserve the existing reference allocation point in verified payment finalization: unpaid booking creation must not allocate a reference because payment initiation/finalization relies on the reference being absent. Initialize consented normalized recipient, empty bookingReference, and stable requestId/type idempotency key on the canonical record. Reuse the exact persisted booking on duplicate save. Keep legacy fallback lookup as a separate compatibility path; never copy, merge, or insert a legacy record into the canonical collection during lookup/retry. Keep existing fields and indexes unchanged. Widen only the approved `whatsappNotification.messageType` enum values, with no migration or other schema changes. Keep booking creation and Cashfree API outcome fields accurate; never infer `notification_accepted` from HTTP 200 alone. Preserve existing dirty payment UI and route edits unless they conflict with the notification contract. Keep `booking_confirmation` distinct and skipped while payment is pending; use `payment_success` only after verified Cashfree success, `payment_failed` only after verified terminal Cashfree failure, and `payment_assistance` only when existing eligibility rules permit it.</action>
  <verify>
    <automated>node --test backend/test/booking-references.test.js backend/test/booking-enquiries.test.js</automated>
  </verify>
  <done>New unpaid bookings prepare recipient/idempotency state without allocating a reference; verified payment finalization remains the sole reference allocation point; duplicate creation is idempotent; API outcomes distinguish pending, skipped, provider rejection, and provider acceptance.</done>
</task>

<task type="auto" tdd="true">
  <name>Fix primary recipient, reference reuse and stable idempotency in notification service</name>
  <files>
    backend/src/services/whatsappService.js,
    backend/src/services/whatsappNotifications.js,
    backend/src/routes/cashfreeWebhook.js,
    backend/src/routes/admin.js,
    backend/test/cashfreeTerminalFailureWhatsApp.test.js,
    backend/test/cashfreeWebhook.test.js,
    backend/test/admin-whatsapp-retry.test.js,
    backend/test/admin-whatsapp-resolved-retry.test.js
  </files>
  <behavior>
    - Primary customer dispatch uses only persisted primary `mobile`, only with persisted WhatsApp consent and a valid normalized recipient; attendee phones are never fallback recipients.
    - Missing, invalid, absent, or opted-out primary recipient produces `notification_skipped` and persists skipped/unavailable state with the canonical reference and stable notification key.
    - Stable idempotency is based on canonical booking identity plus the exact notification type for each primary lifecycle notification.
    - Admin retry reuses the stored notification type and persisted canonical reference: it never invents a missing reference, changes a success retry into failure, or changes a failure retry into success.
    - Duplicate retry/webhook calls and in-progress or already sent same-key calls make provider call count zero after the first attempt.
    - A provider HTTP 200 without accepted `messages[].id` is not accepted; provider rejected/uncertain/invalid-recipient outcomes are persisted separately from skipped.
  </behavior>
  <action>Prepare normalized primary recipient data only from the saved primary mobile, with explicit consent and no attendee fallback. Persist stable keys as canonical requestId plus notification type and `primary`; keep bookingReference equal to the canonical reference (empty until verified payment finalization). Pending payment and invalid/missing/opted-out recipients are skipped, never sent. Compare stored key and state before dispatch, preserving sent/delivered/read duplicate guards and force only for authorized admin retry. Route verified Cashfree success/failure to their distinct types, keep payment-assistance eligibility unchanged, and make admin retry reuse the persisted notification type without inventing a reference. Provider acceptance requires a message ID; skips, rejection, and uncertain provider outcomes remain distinct in service, logs, and API responses. Notification writes may not mutate payment state.</action>
  <verify>
    <automated>node --test backend/test/cashfreeTerminalFailureWhatsApp.test.js backend/test/cashfreeWebhook.test.js backend/test/admin-whatsapp-retry.test.js backend/test/admin-whatsapp-resolved-retry.test.js backend/test/whatsappNotifications.test.js backend/test/whatsappPaymentNotifications.test.js</automated>
  </verify>
  <done>Only the primary, consented, normalized saved mobile can receive primary notifications; reference allocation stays in verified payment finalization; stable keys are reused across retries/webhooks; duplicate calls produce no provider dispatch; skipped is distinct from provider rejection; notification failures leave payment status unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Add focused 13-case regression coverage and run all local validation</name>
  <files>
    backend/test/cashfreeTerminalFailureWhatsApp.test.js,
    backend/test/admin-whatsapp-retry.test.js,
    backend/test/admin-whatsapp-resolved-retry.test.js,
    tests/adminWhatsAppRetry.test.js,
    tests/paymentFailedScreen.test.js
  </files>
  <behavior>
    - All 13 notification requirements are represented by named or clearly grouped assertions: canonical creation/persistence; primary/consent/normalized recipient; no attendee fallback; safe missing reference; stable key; duplicate suppression; success/failure lifecycle separation; pending guard; outcome correctness; canonical/legacy collection compatibility; individual attendee consent; provider rejection/payment immutability.
    - Existing frontend terminal-failure display remains a simple terminal-failure result and no cancelled/dropped state is incorrectly labeled terminal failure.
  </behavior>
  <action>Integrate with the pre-existing untracked test files instead of replacing them. Add any missing assertions to `backend/test/cashfreeTerminalFailureWhatsApp.test.js`, `backend/test/admin-whatsapp-retry.test.js`, `backend/test/admin-whatsapp-resolved-retry.test.js`, `tests/adminWhatsAppRetry.test.js`, and `tests/paymentFailedScreen.test.js`. Cover canonical persistence, exact API outcome fields, HTTP 200/provider-message acceptance, same-key duplicate retries/webhooks, missing canonical reference retry failure, retry type consistency, legacy model lookup without duplicate creation, canonical `bookings-db` updates, and all payment/notification state combinations. Keep tests fully in-process with mock Mongoose-shaped models and mock fetch; never execute real provider or database integration.</action>
  <verify>
    <automated>node --test backend/test/booking-references.test.js backend/test/booking-enquiries.test.js backend/test/cashfreeTerminalFailureWhatsApp.test.js backend/test/cashfreeWebhook.test.js backend/test/admin-whatsapp-retry.test.js backend/test/admin-whatsapp-resolved-retry.test.js backend/test/whatsappNotifications.test.js backend/test/whatsappPaymentNotifications.test.js tests/adminWhatsAppRetry.test.js tests/paymentFailedScreen.test.js</automated>
    <automated>npm --prefix backend test</automated>
    <automated>npm test</automated>
    <automated>npm run lint</automated>
    <automated>npm run build</automated>
    <automated>git diff --check</automated>
  </verify>
  <done>The focused suite proves all 13 requirements with mocked providers and records; full backend tests, root tests, lint, build, and git diff whitespace validation pass or any environment/pre-existing failure is reported explicitly. No production access occurs and no commit or git mutation beyond source edits is performed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|-----------|-------------|
| Browser/API → booking route | Untrusted requestId, mobile, consent, payment status hints, and retry payload cross into server state |
| Booking route/payment services → MongoDB | Canonical identity/reference, consent, notification state, and payment state are persisted |
| Backend → WhatsApp Cloud API | Phone numbers and notification templates leave the application to a third party |
| Cashfree webhook/verify/status → backend | External event or provider evidence must not be confused with a locally terminal state |
| Admin session → retry route | Authenticated admin can request primary/attendee/admin resend and must not alter payment state |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261119-01 | Tampering | Booking/reference creation | high | mitigate | Preserve existing verified-payment reference allocation; duplicate saves and retries reuse stored state and never invent or migrate a reference |
| T-261119-02 | Elevation of privilege | Primary/admin retry recipient | high | mitigate | Dispatch only normalized saved primary mobile with explicit valid consent; attendee/admin retries require their own eligible consent/configuration |
| T-261119-03 | Repudiation | Notification state/history | medium | mitigate | Persist status, key, recipient, attempt count, provider message ID, and history in `bookings-db` on every eligible outcome |
| T-261119-04 | Spoofing | Cashfree terminal state | high | mitigate | Only verified paid/failed provider evidence may trigger success/failure lifecycle notifications; HTTP 200 is never provider acceptance |
| T-261119-05 | Denial of service | Duplicate retry/webhook | medium | mitigate | Stable canonical notification keys plus in-progress/sent/skipped/delivered/read duplicate guards stop repeated provider calls |
| T-261119-06 | Information disclosure | API/admin logs | medium | mitigate | Log identifiers and recipient state safely; no raw phone or sensitive provider payload in retry diagnostics |
| T-261119-07 | Tampering | Payment status mutation from notification | high | mitigate | Notification service and routes may update only WhatsApp fields; payment status updates remain exclusively in verified payment operations |
| T-261119-08 | Tampering | Legacy/canonical resolution | high | mitigate | Fail ambiguous legacy/current matches; update the exact resolved record; never copy or create duplicates in canonical collection |
| T-261119-SC | Tampering | Provider/package supply chain | high | mitigate | Package legitimacy gate: no package install or package manifest change is required or permitted for this fix |
</threat_model>

<verification>
Execution runs local focused suites first, then `npm --prefix backend test`, `npm test`, `npm run lint`, `npm run build`, and `git diff --check`. A `node --test` process may use in-memory/mock Mongoose-shaped records and mock fetch only. No provider, MongoDB, Render, or Vercel service call is allowed.
</verification>

<success_criteria>
The existing verified-payment lifecycle remains responsible for creating the canonical reference. Primary WhatsApp uses only the consented, valid normalized saved mobile; skips still persist that recipient state and a stable requestId/type key. Success, payment assistance, and terminal failure remain distinct; outcomes and duplicate retry behavior are accurate. New booking and notification state use canonical `main.bookings-db`; legacy resolution is compatibility-only. WhatsApp/provider failures cannot mutate payment status. All focused and full local checks are reported accurately.
</success_criteria>

<output>
Execution summary: `.planning/quick/261119-dkd-fix-whatsapp-booking-notification-recipi-SUMMARY.md`. Do not commit, stage, switch, push, merge, migrate, or access production services.
</output>
