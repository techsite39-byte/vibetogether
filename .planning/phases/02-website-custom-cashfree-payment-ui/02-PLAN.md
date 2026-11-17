---
phase: "02"
slug: "website-custom-cashfree-payment-ui"
status: planned
created: "2026-11-17"
authorization: "not granted"
---

# Phase 02 Plan — Website Custom Cashfree Payment UI

## Objective

Replace the current generic Cashfree hosted-checkout initiation on the VibeTogether payment page with a branded, method-specific website surface. Preserve the existing booking journey, server-priced Cashfree order/session, server-side verification, signed webhook authority, MongoDB persistence, pending/retry behavior, ticket/notification flow, independent Razorpay path, and native Android boundary.

This document is an implementation design only. It does not authorize edits, payment requests, deployment, database migrations, production configuration changes, or live transactions.

## Non-goals and hard boundaries

- No Cashfree hosted page, hosted modal, generic “all methods” surface, or hosted fallback as the initial or default method experience.
- No VPA collect field for “Other UPI”; that choice is the Cashfree-supported QR route.
- No frontend secret, order creation, amount calculation, payment confirmation, or booking reference allocation.
- No backend payment business-rule, webhook, schema, API-contract, deployment, or environment change is planned.
- No Razorpay deletion, migration cutover, or fallback redesign.
- No native Android source change. Website behavior in Android browsers is in scope; a separate WebView application is not present in this repository.
- No homepage, unrelated performance, route, font, or visual-system redesign.

## Authorization gates before implementation

Implementation must stop until all of the following are true:

1. The user explicitly authorizes website source/test changes after reviewing this plan. Planning approval alone is not implementation approval.
2. Cashfree merchant enablement is confirmed for PhonePe, Google Pay, Paytm, QR, cards, verified net-banking banks, and each wallet to be shown.
3. The current official Cashfree Element examples/SDK behavior are verified for card multi-field submission, QR initiation, wallet phone requirements, and cancellation/result handling. No guessed method or payload is allowed.
4. The merchant confirms the accepted `CASHFREE_API_VERSION`; no version change is included in this plan.
5. A synthetic booking and Cashfree sandbox environment are available. No production order or live transaction is permitted.

## Proposed architecture

```text
BookingJourney
    -> POST /api/booking-enquiries
    -> /booking/payment/:requestId
       -> GET booking summary/status
       -> POST existing cashfree-order
       -> payment_session_id + server amount
       -> VibeTogether selector
          -> mount only selected Cashfree Element
          -> explicit CTA calls documented cashfree.pay(...)
          -> provisional SDK result / required handoff
       -> existing cashfree-verify or cashfree-status
       -> backend queries Cashfree + validates booking/order/payment/amount/INR
       -> webhook independently confirms/reconciles signed provider event
       -> MongoDB paid state + reference + notifications
       -> existing verified ticket/confirmation UI
```

The browser owns presentation and provisional state. The backend remains the only authority for `paid`, booking confirmation, ticket reference, and notification triggering.

## Payment-method design

The method registry must be data-driven and must distinguish `id`, label, Cashfree component name, provider/bank configuration, availability, and platform constraints. It must not use the existing `modal` method as a registry entry.

| VibeTogether choice | Cashfree Element design | Initial state | Required behavior |
| --- | --- | --- | --- |
| PhonePe | `upiApp` with documented app ID `phonepe` | Available only after merchant + sandbox verification | Mount on supported mobile browser; submit only on explicit CTA; allow PhonePe handoff; no VPA field |
| Google Pay | `upiApp` with documented app ID `gpay` | Available only after merchant + sandbox verification | Same as PhonePe; desktop and custom WebView must show an honest unsupported/fallback message |
| Paytm | `upiApp` with documented app ID `paytm` | Available only after merchant + sandbox verification | Same as PhonePe; do not promise the Paytm app is installed or that the handoff stays embedded |
| Other UPI | `upiQr` mounted inline | Default selection after capability review | Keep QR in the VibeTogether panel; scan with any UPI app; use the exact current Cashfree QR initiation/status sequence; no VPA collect |
| Cards | `cardNumber`, `cardExpiry`, `cardCvv`, `cardHolder` | Available only after exact provider example + sandbox verification | Cashfree-hosted fields only; no raw card state; submit only the selected card component contract; allow issuer authentication if required |
| Net Banking | `netbanking` with verified Cashfree bank code | Additional option per enabled bank | Show only verified bank codes; submit selected bank Element; allow bank authentication handoff |
| Supported wallet | `wallet` with verified provider and normalized customer phone | Additional option per enabled provider | Show one branded choice per enabled provider; keep phone input/requirements within the documented Element contract; allow wallet/issuer handoff |

If a requested method is not enabled or the current SDK cannot support it, surface a blocking review result. Do not silently remove it, relabel it as another method, or send the user to hosted checkout.

## Payment-page state and interaction contract

Retain the existing VibeTogether payment route, brand header, progress stepper, booking dossier, pricing ledger, trust treatment, and verified success/ticket surface. Change only the payment-method interaction inside the existing payment card.

### Selection

- Show separate branded controls for PhonePe, Google Pay, Paytm, Other UPI (QR), and Cards.
- Add Net Banking and individual supported wallets only from the verified merchant capability list.
- Default to Other UPI (QR) only after QR is verified; selection alone must mount/prepare the selected Element but never call `pay`, open a window, or begin an app/bank handoff.
- Keep selected state keyboard-accessible (`aria-selected` or equivalent), focus-visible, touch-friendly, and responsive at 360, 375, 390, 412, 430 CSS px and desktop.

### Loading and errors

- Booking loading: retain the current booking loading card.
- Order/SDK/Element loading: show an inline spinner and keep the page/booking summary in place; disable the method CTA until the selected component is ready.
- SDK/Element error: show a method-specific inline error with retry and method-change paths. Never open a hosted fallback.
- Incomplete Card/Element data: use provider validation; do not submit and do not copy raw card values into VibeTogether state.

### Submission and outcomes

- Disable repeated activation with the existing state/ref lock while `cashfree.pay` is pending.
- Call the exact current documented `cashfree.pay` contract with the selected component object, existing payment session, return URL, and `redirect: 'if_required'` where supported. The exact Card/QR/Wallet argument shape is a pre-implementation verification gate.
- Treat `result.error`, `result.redirect`, `result.paymentDetails`, and return URL navigation as provisional signals only.
- After the handoff/result, call existing `cashfree-verify` with the known booking-bound order ID and provider payment ID only when the provider actually returns one. Otherwise use the existing status route.
- If status is pending/uncertain, show `Payment confirmation is pending. Check status before retrying.`, provide `Recheck Status`, preserve the booking, and block another charge.
- If the user cancels a handoff, retain the selected method and booking. Recheck server status; do not mark failure solely from cancellation.
- If the provider returns a definitive failed/cancelled state and the server confirms it, show retry/method-change UI without assigning a booking reference.
- Show the existing paid ticket/reference only after the serialized booking reports authoritative `paid` plus a reference.

## Frontend implementation sequence after authorization

1. Add a small deterministic method registry/helper, such as `src/utils/cashfreePaymentMethods.js`, containing only documented component names/IDs and verified capability inputs. Add focused Node tests before changing the page.
2. Replace the current display-only selector list in `src/pages/BookingPayment.jsx` with the verified method registry. Remove the `modal` registry/panel and all direct hosted-checkout fallback actions.
3. Keep Cashfree SDK loading on the payment route only, and defer it until the booking/order or first selected-method setup requires it. Do not add an SDK tag to public-page startup or `package.json`.
4. Generalize the existing QR-only Element lifecycle into selected-component lifecycle: stale-effect guard, `ready`/`loaderror`, `unmount`, selected mount target cleanup, and selected method changes. Mount one selected component at a time.
5. Implement PhonePe first as a sandbox tracer and stop for explicit review if required by the execution workflow. Only after the tracer is approved, expand Google Pay, Paytm, QR, Cards, Net Banking, and verified wallets.
6. For cards, mount the four documented secure fields and preserve the raw-data boundary. For bank/wallet methods, derive the provider/bank configuration from verified enablement rather than the current hard-coded placeholder lists.
7. Update the existing payment handler so it submits the selected Element, never `cashfree.checkout`, and routes all outcomes through server verification/status. Preserve the existing booking/amount/order IDs.
8. Preserve Razorpay handlers and branch conditions byte-for-byte unless a focused frontend test demonstrates an unrelated compile issue caused by the in-scope selector change.
9. Add focused tests for method mapping, selected-only mounting/submission, state transitions, duplicate-submit prevention, no-hosted-fallback behavior, responsive/presentation invariants, and raw-card-data absence.

## Backend responsibilities and protected contracts

No backend source edit is expected. The authorized implementation must consume these existing endpoints:

| Endpoint | Responsibility | Required invariant |
| --- | --- | --- |
| `GET /api/booking-enquiries/:requestId` | Load persisted booking and current payment state | Preserve booking ID, server amount, and payment state |
| `POST /api/booking-enquiries/:requestId/cashfree-order` | Create server-authenticated Cashfree order/session | Server calculates amount; credentials never reach browser |
| `POST /api/booking-enquiries/:requestId/cashfree-verify` | Query Cashfree and verify a booking-bound order/payment | Require successful payment, matching amount, INR, and exact recorded order/payment binding |
| `POST /api/booking-enquiries/:requestId/cashfree-status` | Reconcile pending/paid/failed state | `no-store`; pending remains non-paid and retry-blocking |
| `POST /api/booking-enquiries/:requestId/cashfree-failure` | Record a verified terminal failure/cancellation | Never allocate a reference; do not infer failure from a dismissed browser surface alone |
| Cashfree webhook aliases | Independently receive signed provider events | Raw body HMAC verification precedes JSON parse; processing remains idempotent |

The implementation must not add a `paymentMethod` trust field to MongoDB, accept a client amount, trust a client “success” flag, bypass webhook verification, or change booking schema. The selected provider method may be used for UI telemetry/state only if it is not treated as payment proof and does not require schema expansion.

## Verification and data-integrity strategy

- Compare the provider's order ID against the booking's recorded current order or `paymentOrders` entry.
- Require the provider's successful payment ID, amount, and `INR` currency to match the booking/order before paid state.
- Preserve the existing idempotent reference allocation, `paymentStatus`, `paymentVerifiedAt`, `paidAt`, `cfPaymentId`, `cfPaymentStatus`, `cfPaymentMethod`, `paymentOrders`, and `paymentFailureReason` behavior.
- Treat signed webhooks as an independent reconciliation path; browser completion must not be required for a valid provider webhook, and browser completion must not override webhook/server evidence.
- Preserve WhatsApp notification calls after verified success/failure without letting notification failure mutate payment state.
- Use synthetic bookings, mocked provider responses, and Cashfree sandbox only. Never use production credentials or create a live order during validation.
- If duplicate order creation or concurrent verification exposes a backend gap, stop and record it as a separate backend authorization item; do not patch the schema or business rules during this UI implementation.

## Razorpay coexistence and later migration

The implementation phase must:

1. Leave `backend/src/services/razorpayPayments.js`, `backend/src/routes/razorpayWebhook.js`, the Razorpay frontend branch, and Razorpay tests intact.
2. Exercise Cashfree in an independently selected provider environment; do not switch production `PAYMENT_PROVIDER` as part of UI work.
3. Compare Cashfree success, failure, pending, cancellation, duplicate, webhook, persistence, booking-reference, ticket, and notification outcomes with the existing Razorpay contract.
4. Document rollback to the existing Razorpay path before any production cutover.
5. Decommission Razorpay only in a later explicit phase after production evidence, monitoring, rollback, and owner approval.

## Performance and UX safeguards

- Do not load Cashfree or Razorpay SDKs on homepage/public route startup; the payment page is already lazy-loaded.
- Avoid page reloads; retain the current booking object and payment session across method changes and app/bank return.
- Reserve Element/QR/card panel space to prevent layout shift, keep the existing responsive breakpoint/layout, and retain reduced-motion behavior.
- Do not modify `docs/performance-baseline.md` or claim a payment-page performance improvement from Phase 1 homepage measurements.
- If a comparable performance run is later needed, use the Phase 1 local protocol: same build provenance, 412 × 915 viewport, approximate Moto G Power/Slow 4G settings, cold-cache sequential runs, median/range reporting, and separate trace-candidate versus Lighthouse LCP values.

## Expected authorized implementation files

Expected website/test files only:

- `src/pages/BookingPayment.jsx`
- `src/pages/BookingPayment.css`
- `src/utils/cashfreePaymentMethods.js` (new deterministic mapping helper, if the implementation uses the planned separation)
- focused frontend tests such as `test/cashfreePaymentMethods.test.js`, `test/cashfreePaymentState.test.js`, and `test/cashfreePaymentPresentation.test.js`

Read-only contract dependencies:

- `src/services/bookingEnquiryPayment.js`
- `src/App.jsx`
- `src/components/booking/BookingJourney.jsx`
- `backend/src/services/cashfreePayments.js`
- `backend/src/routes/bookingEnquiries.js`
- `backend/src/routes/cashfreeWebhook.js`
- `backend/src/models/bookingEnquiry.js`

Not expected or authorized to change: any backend source, MongoDB schema, `.env`, `package.json`, lockfile, `render.yaml`, `vercel.json`, `src/pages/UpiPayment.jsx`, Razorpay files, Android files, or production settings. If a read-only contract review reveals a required backend change, stop and request separate authorization.

## Future testing and deployment sequence

1. Focused method/state tests with mocked Cashfree objects.
2. Frontend build, lint, and existing frontend test suite.
3. Backend Cashfree/Razorpay/webhook regression suites without provider calls.
4. Synthetic booking + Cashfree sandbox manual checks at 360/375/390/412/430 px and desktop, including Android browser app handoffs.
5. Signed webhook fixtures, MongoDB persistence assertions, duplicate/retry/concurrency checks, ticket/QR and notification checks.
6. A non-production review environment, if separately authorized, with no live transaction.
7. Production deployment and any live payment testing only after separate explicit deployment/production authorization and merchant readiness sign-off.

## Plan conclusion

The plan is implementation-ready in structure but blocked by merchant capability, SDK-contract, sandbox, API-version, and explicit-authorization gates. Stop here. Do not start implementation from this document alone.

