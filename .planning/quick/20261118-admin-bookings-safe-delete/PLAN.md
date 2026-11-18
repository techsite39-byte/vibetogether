---
quick_id: 20261118-admin-bookings-safe-delete
status: planned
depends_on: []
files_modified:
  - backend/src/routes/admin.js
  - backend/test/admin-bookings-safe-delete.test.js
  - src/admin/context/AdminDataProvider.jsx
  - src/admin/pages/ManageBookings.jsx
autonomous: true
---

# Guarded Admin Booking Delete

<objective>
Add an admin Delete action that can permanently remove only a uniquely identified booking record proven to have no payment activity or financial audit history.

Purpose: Provide a narrow, backend-authoritative cleanup path without deleting payment evidence or changing payment behavior, schemas, or unrelated admin workflows.
Output: A super-admin-only guarded delete endpoint, a confirmed Delete action with visible errors and refresh, and isolated mocked tests for eligible, protected, and ambiguous records.
</objective>

<context>
- `.planning/STATE.md` identifies Phase 2 as executing only after separate authorization. This is a separately authorized quick task, not authorization to execute or modify any Phase 2 plan.
- `DELETE /admin/bookings/:reference` in `backend/src/routes/admin.js` is currently super-admin-only, but unconditionally deletes from `Booking` first and then `BookingEnquiry`. Resolve matching records in both collections before choosing a source; if both match, fail closed with a clear conflict rather than relying on lookup order or a client-supplied source.
- `BookingEnquiry` contains `paymentOrders`, `upiPayments`, payment status/history, and Cashfree/Razorpay identifiers and references. Use a strict allowlist for records with provably empty payment history. Keep every paid, pending-payment, failed, refunded, verified, demo-paid, UPI-submitted/rejected/verified, gateway/order/payment-reference, or otherwise financially audit-relevant record. Missing or unknown payment state is protected.
- Preserve the existing worktree changes in `backend/src/routes/admin.js`, `src/admin/pages/ManageBookings.jsx`, and `src/admin/services/adminApi.js`. Inspect current diffs before touching overlapping files; layer only this task's changes and preserve existing WhatsApp identifier behavior. Do not edit or replace `src/admin/services/adminApi.js` for this task.
- Keep any existing successful-delete audit behavior and booking seat-restoration semantics intact. Do not change payment behavior, payment/WhatsApp code, schemas, configuration, or unrelated endpoints.
- Use only mocked model operations and synthetic fixtures. Do not connect to a live database, issue a live delete, make a real admin API request, send WhatsApp messages, or upload the admin UI. No safe staging environment, request logs, or authorized test booking is available.
- Do not edit `.planning/STATE.md`, `ROADMAP.md`, or Phase 2 plans. Do not stage, commit, push, or deploy.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Wire one provably unpaid record through guarded API and confirmed UI</name>
  <files>backend/src/routes/admin.js, backend/test/admin-bookings-safe-delete.test.js, src/admin/context/AdminDataProvider.jsx, src/admin/pages/ManageBookings.jsx</files>
  <behavior>
    - A unique record with the source-specific explicit no-payment state and no payment artifacts can be deleted by a super admin; the response is 204 and the matching record alone is removed.
    - A record with payment activity, an unknown/missing payment state, or an identifier matching both collections is not deleted and receives a clear 409 response; an unknown identifier receives 404.
    - Non-super-admin requests remain denied by the existing authorization gate.
    - The bookings UI offers Delete only for a visibly unambiguous no-payment candidate to a super admin, confirms the irreversible action, reports server errors without hiding the record, and refreshes the workspace after success.
  </behavior>
  <action>First inspect the current diffs for all four target files and preserve unrelated edits, especially the existing WhatsApp retry identifier changes. Add `backend/test/admin-bookings-safe-delete.test.js` first with synthetic Booking and BookingEnquiry fixtures and mocked model methods; create only the narrow dependency seam needed to exercise the handler without MongoDB. In `backend/src/routes/admin.js`, retain the existing super-admin gate, resolve the identifier against both models before deletion, reject cross-source ambiguity, and fail closed unless the record has the exact source-specific no-payment state and no payment references, gateway IDs/status, payment-order or UPI entries, attempts, timestamps, or other payment-history evidence. Make the final deletion conditional on the same safe-state criteria so a record that gains payment metadata after lookup is not deleted; return 404 for no match and a distinct, explanatory 409 for ambiguity or protected financial history. Keep existing successful-delete audit and seat handling unchanged, and do not move or alter payment logic. Add a `deleteBooking` operation to `AdminDataProvider` using its existing request/mutate-and-reload pattern. In `ManageBookings`, use the existing `actor.role === 'super_admin'` contract and visible payment fields only as a conservative presentation filter, show a clear `window.confirm` before calling the API, retain the row and display the backend message on failure, and close/refresh after success. The UI filter is not authorization: the backend remains authoritative for every request. Do not add a package or change the existing admin API service file.</action>
  <verify>
    <automated>node --test backend/test/admin-bookings-safe-delete.test.js</automated>
    <automated>npm run lint</automated>
  </verify>
  <done>A super admin can confirm deletion of one uniquely matched record that is demonstrably unpaid and has no payment evidence; protected or ambiguous records remain untouched with a clear error; successful deletion refreshes the bookings list. Focused mocked tests and lint pass without database or external-service access.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Close the protected-financial-record matrix with mocked regressions</name>
  <files>backend/src/routes/admin.js, backend/test/admin-bookings-safe-delete.test.js</files>
  <behavior>
    - Payment statuses including paid, pending, failed, refunded, verified, and demo-paid are protected, including any unrecognized or absent state.
    - Any non-empty paymentOrders or upiPayments history is protected regardless of the embedded attempt status, including submitted, rejected, verified, failed, or refunded UPI entries.
    - Cashfree/Razorpay order, session, payment, provider, status, reference, attempt, timestamp, failure, or verification evidence prevents deletion even if a top-level status appears unpaid.
    - Protected responses do not release seats, write a successful-delete audit entry, or invoke either model's delete operation.
  </behavior>
  <action>Add isolated mock cases for each listed status and evidence family, exercising both Booking and BookingEnquiry source paths. Assert the exact HTTP status/message and that neither collection is deleted on protected or ambiguous input. If a case exposes an allowlist gap, tighten only the admin delete eligibility predicate and its conditional-delete filter in `backend/src/routes/admin.js`; keep payment services, WhatsApp code, schema, and all payment flows untouched. Retain the successful eligible-record case and verify that audit and seat side effects occur only after a successful conditional deletion. Never use a real database, production data, gateway, or notification.</action>
  <verify>
    <automated>node --test backend/test/admin-bookings-safe-delete.test.js</automated>
  </verify>
  <done>The mocked matrix proves every specified payment status, embedded payment history, gateway identifier/reference, unknown state, and ambiguous source is retained; only a uniquely matched record with an explicit no-payment state and no payment evidence can be deleted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin browser → authenticated delete endpoint | The caller, identifier, and any UI source hint are untrusted; only the existing server-side super-admin authorization and server-side record lookup may authorize deletion. |
| Delete endpoint → Booking / BookingEnquiry collections | Stored payment status and history are financially sensitive audit evidence; deletion must be conditional on a strict no-payment allowlist. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-20261118-01 | Tampering | `DELETE /admin/bookings/:reference` | high | mitigate | Resolve both source collections, fail closed on ambiguity or unknown state, retain all payment evidence, and condition the final delete on the safe-state predicate. |
| T-20261118-02 | Elevation of privilege | Admin booking delete authorization | high | mitigate | Preserve the super-admin-only server gate; UI role checks are presentation-only. |
| T-20261118-SC | Tampering | Package installation | low | accept | No packages are added or installed for this task. |
</threat_model>

<source_audit>

| Source | Item | Coverage |
|--------|------|----------|
| GOAL | Separately authorized, safe admin booking deletion | Tasks 1–2 |
| REQ | No Phase 2 ROADMAP requirement is assigned; do not execute or update Phase 2 | Context and output constraints |
| RESEARCH | No new dependency or external service is needed | Task 1 and verification |
| CONTEXT | Detect Booking versus BookingEnquiry ambiguity, enforce backend guards, report errors, confirm in UI, refresh after success, and test with isolated mocks | Tasks 1–2 |
| CONTEXT | Preserve payment/schema/WhatsApp behavior; no UI upload, live deletion, WhatsApp send, commit, push, or deployment | Context and task actions |

</source_audit>

<verification>
From the repository root, run `node --test backend/test/admin-bookings-safe-delete.test.js` and `npm run lint`. All test model operations use mocks and synthetic records. Do not access production data, send notifications, upload the UI, or modify configuration. These checks do not authorize deployment or live deletion.
</verification>

<success_criteria>
Only a uniquely identified record with explicit no-payment state and no payment-related identifiers, attempts, arrays, status, timestamps, or history can be deleted. Every paid, pending-payment, failed, refunded, verified, demo-paid, UPI-history, gateway/order/payment-reference, unknown-state, and ambiguous-source record is retained by the backend with a clear response. The confirmed super-admin UI refreshes only after success, focused mocked tests and lint pass, and unrelated worktree changes and Phase 2 planning state remain untouched.
</success_criteria>

<output>
Implementation is limited to the four listed application/test files and only after the quick task is executed. Do not create a summary, modify planning state, stage, commit, push, or deploy as part of this plan.
</output>
