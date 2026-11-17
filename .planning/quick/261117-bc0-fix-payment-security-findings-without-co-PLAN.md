---
quick_id: 261117-bc0-fix-payment-security-findings-without-co
status: planned
depends_on: []
files_modified:
  - backend/src/services/cashfreePayments.js
  - backend/src/services/razorpayPayments.js
  - backend/test/cashfreePayments.test.js
  - backend/test/razorpayPayments.test.js
autonomous: true
---

# Surgical Payment Verification Fixes

<objective>
Correct the scoped Cashfree verification and Razorpay failed-webhook behaviors without redesigning schemas or APIs.

Purpose: The user explicitly authorizes this narrow exception to Phase 1's audit-only/deferred-payment scope. Do not change unrelated planning state.
Output: Focused, mocked regression coverage and fixes limited to the four paths listed in `files_modified`.
</objective>

<execution_context>
Use the existing Node test runner and payment-service patterns. No external package or provider setup is needed.
</execution_context>

<constraints>
- Preserve the pre-existing dirty working tree, including current changes to `backend/src/services/cashfreePayments.js`, other modified files, and poster images. Inspect existing diffs before editing and layer only these scoped fixes on top; do not revert or overwrite unrelated work.
- Use mocked provider responses and synthetic test data only. Do not access `.env`, initiate real payments, or contact payment providers (per D-11 test boundary).
- Do not redesign schemas or APIs, change frontend files, or edit `.planning/STATE.md` or other planning state.
- Do not stage, commit, push, or deploy.
</constraints>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bind Cashfree verification to the booking and authoritative payment</name>
  <files>backend/src/services/cashfreePayments.js, backend/test/cashfreePayments.test.js</files>
  <behavior>
    - A requested order must belong to the booking (stored payment order or its recorded paymentOrders entry); unrelated order IDs cannot verify or receive an idempotent success response.
    - Only a SUCCESS payment returned for that bound order can confirm payment. When cf_payment_id is supplied, only that exact payment ID qualifies; never fall back to another successful payment.
    - The successful payment amount must match the booking's expected amount for that order and its currency must be INR. An order_status of PAID without a qualifying successful payment never confirms the booking.
    - A signed success webhook with missing or non-INR payment/order currency is rejected as a confirmation mismatch; valid INR webhook behavior remains intact.
  </behavior>
  <action>First inspect the current diff for both Cashfree target files and preserve all pre-existing edits. Add focused regression cases, then bind verification to the booking's recorded order before any success/duplicate response; use only the authoritative SUCCESS record from that order, enforce an exact supplied cf_payment_id, and compare its amount and INR currency against the expected booking/order amount. Remove order_status PAID as an independent success path. Tighten the directly coupled signed webhook currency check to require the matching INR fields, updating its mocked success fixture as needed. Keep signatures, response contracts, idempotent valid retries, and unrelated booking behavior unchanged. Use mocked fetch responses only; do not stage, commit, push, or deploy.</action>
  <verify>
    <automated>node --test backend/test/cashfreePayments.test.js</automated>
  </verify>
  <done>Cashfree verification cannot confirm a mismatched booking/order, payment ID, amount, or currency, nor infer success from order status alone; valid bound success and webhook cases still pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Keep Razorpay failed attempts retryable without saving a lean object</name>
  <files>backend/src/services/razorpayPayments.js, backend/test/razorpayPayments.test.js</files>
  <behavior>
    - A payment.failed webhook does not throw by invoking save on the lean booking result.
    - The webhook returns the existing retryable/pending outcome, leaves the booking unpaid and without a reference, and allows a later captured attempt to finalize normally.
  </behavior>
  <action>Preserve the current behavior asserted by the retryable-failure test: treat payment.failed as an attempt-level pending result, without mutating or calling save on the lean booking object or making the booking terminal. If attempt metadata must be persisted, use a targeted model update rather than document methods and keep the booking eligible for retry. Expand the mocked service test to prove the webhook does not throw and a subsequent captured attempt can still finalize. Do not stage, commit, push, or deploy.</action>
  <verify>
    <automated>node --test backend/test/razorpayPayments.test.js</automated>
  </verify>
  <done>The failed-webhook path is lean-safe and returns pending with the booking still retryable; later captured payment behavior remains covered and passing.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Payment caller/provider response → booking confirmation | Order identifiers, payment IDs, status, amount, and currency must be bound to the booking before paid state or references are assigned. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261117-BC0-01 | Tampering | Cashfree payment verification | high | mitigate | Bind the requested order and exact payment to the booking, then require successful provider status, matching amount, and INR currency before confirmation. |
</threat_model>

<verification>
Run both focused suites from the repository root: `node --test backend/test/cashfreePayments.test.js backend/test/razorpayPayments.test.js`. They use mocks and must not require environment secrets or real payment calls.
</verification>

<success_criteria>
All four authorized files contain only the scoped payment fixes and focused tests; the combined focused test command passes, while unrelated dirty changes and planning state remain untouched.
</success_criteria>

<output>
Create no implementation summary until execution is separately authorized.
</output>
