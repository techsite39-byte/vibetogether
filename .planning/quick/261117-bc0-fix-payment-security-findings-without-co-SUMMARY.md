---
quick_id: 261117-bc0-fix-payment-security-findings-without-co
status: complete
---

# Surgical Payment Verification Fixes — Summary

Cashfree confirmations now require a booking-bound order and matching successful payment ID, amount, and INR currency; Razorpay failed webhooks remain pending and retryable.

## Changed Files

- `backend/src/services/cashfreePayments.js` — Enforced recorded-order binding, exact payment selection, amount/currency checks, and strict webhook currency validation. Preserved the pre-existing removal of `payment_methods`.
- `backend/test/cashfreePayments.test.js` — Added regression coverage for unrelated orders, wrong/missing payment details, order-status-only success, and invalid webhook currencies.
- `backend/src/services/razorpayPayments.js` — Removed lean-object mutation on `payment.failed`; return pending without making the booking terminal.
- `backend/test/razorpayPayments.test.js` — Verified failed webhook is retryable and later capture finalizes successfully.

## Verification

- RED: New regressions failed before the service fixes for the expected Cashfree security gaps and Razorpay `enquiry.save is not a function`.
- `node --test backend/test/cashfreePayments.test.js` — 14 passed.
- `node --test backend/test/razorpayPayments.test.js` — 12 passed.
- `node --test backend/test/cashfreePayments.test.js backend/test/razorpayPayments.test.js` — 26 passed, 0 failed.
- `git diff --check` — passed.

No provider requests, environment-secret reads, staging, commits, pushes, or deployments were performed. `STATE.md` and other planning state were not modified. Pre-existing unrelated edits and poster images were left untouched; `src/pages/BookingPayment.jsx` was not edited.
