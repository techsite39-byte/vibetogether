---
status: resolved
trigger: Investigate and fix the VibeTogether Admin Primary WhatsApp Retry failure.
created: 2026-11-19
updated: 2026-11-19
---

# Debug Session: Admin WhatsApp Primary Retry

## Symptoms

- Expected: Admin retry dispatches only the requested notification for the exact uniquely identified booking enquiry, preserving notification history and payment state.
- Actual: Admin route lookup by requestId succeeds, but `payment_assistance` processing logs `SKIPPED` with reason `Booking not found` and the API returns that error.
- Error: `Booking not found`.
- Timeline: Unknown.
- Reproduction: Use the Admin Primary WhatsApp Retry flow with a booking enquiry identified by requestId.

## Current Focus

- hypothesis: Confirmed. The old route path discarded the resolved enquiry and the retry service looked up requestId in `bookings-db` only.
- test: Exercise requestId retry for a legacy `user-db` document, alternate identifiers, ambiguity, duplicate requests, and provider rejection.
- expecting: The exact unique enquiry and source model are used; retry does not mutate payment or other notification targets.
- next_action: complete

## Evidence

- timestamp: 2026-11-19
  observation: `resendNotification()` is the function that throws `Booking not found.` when its resolved `booking` is absent and `getUniqueBookingForRetry(requestId, bookingModel)` returns no match.
- timestamp: 2026-11-19
  observation: That fallback queries only `requestId` in the default `BookingEnquiry` model (`bookings-db`); a legacy `user-db` record found by the admin route is therefore invisible unless the route passes the resolved document and model.
- timestamp: 2026-11-19
  observation: The worktree already contains the fix: `resolveBookingEnquiryByReference()` uniquely resolves requestId/reference/_id across both collections, and the admin route passes `booking` plus `bookingModel` to `resendNotification()`.
- timestamp: 2026-11-19
  observation: Mocked provider tests confirm acceptance is required before status becomes sent, concurrent retries send once, provider rejection leaves payment status unchanged, and attendee/admin statuses and histories remain independent.
- timestamp: 2026-11-19
  observation: Worktree review found that the route's legacy `findByReference` fallback could still lose model provenance when a router was constructed without `resolveByReference`. The retry route now fails closed with 503 unless it has the uniqueness-aware resolver and a usable source model.

## Eliminated

## Resolution

- root_cause: The admin route had found the enquiry, but the prior call path did not pass it to notification retry. `resendNotification()` then performed a requestId-only lookup against `BookingEnquiry` (`bookings-db`), which failed for an enquiry stored in legacy `user-db` and threw `Booking not found.`.
- fix: The existing worktree changes resolve the identifier uniquely across bookings-db and user-db, return the matched model, and pass the exact resolved enquiry/model through the admin retry route. Ambiguous matches return 409. The retry route now fails closed with 503 if the resolver or model capability is missing. Added regression tests for identifier compatibility, fallback refusal, provider rejection without payment mutation, duplicate sends, and independent notification state.
- verification: Focused WhatsApp/admin tests 50/50 passed; full backend tests 225/225 passed; `npm.cmd run lint` passed; `git diff --check` passed. Provider interactions were mocked; no production DB/payment/provider calls were made.
- files_changed: This turn hardened backend/src/routes/admin.js, updated backend/test/admin-whatsapp-retry.test.js, and added coverage in backend/test/admin-whatsapp-resolved-retry.test.js. Existing uncommitted implementation edits in backend/src/server.js, backend/src/services/bookingEnquiries.js, backend/src/services/whatsappService.js, and adjacent files were preserved and validated.
