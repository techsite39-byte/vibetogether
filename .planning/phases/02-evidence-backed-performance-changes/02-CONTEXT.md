# Phase 2: Evidence-Backed Performance Changes - Context

**Gathered:** 2026-11-18
**Status:** Ready for UI design and planning

<domain>
## Phase Boundary

Combine evidence-backed mobile performance work with the explicitly requested website-only Cashfree custom payment UI. Preserve the current VibeTogether visual identity, backend payment business rules, booking/MongoDB behavior, webhook security, Razorpay, routes, and native Android code. The website in Android browsers is in scope. This is a planning task only: do not modify application/payment code, deployment settings, or production configuration until the user separately authorizes implementation.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** Phase 2 combines performance and Cashfree UI work.
  - Keep all Phase 2 performance requirements from Phase 1.
  - Add the website-only Cashfree Elements UI and compatibility requirements; do not replace the performance scope.

- **D-02:** Payment method choices.
  - Show separate branded choices for PhonePe, Google Pay, Paytm, Other UPI, and Cards.
  - "Other UPI" means Cashfree-supported UPI apps and QR; do not add VPA collect.
  - Retain Net Banking and Cashfree-supported wallet methods as additional branded options where Elements and the merchant account support them. If unsupported, stop for review rather than silently dropping the option or opening hosted checkout.

- **D-03:** Checkout interaction and handoff.
  - The customer selects a method in the VibeTogether page, and the selected Cashfree Element is the one submitted.
  - Do not use the Cashfree hosted checkout page or modal as the initial/default payment surface.
  - After selection and user action, allow a required UPI-app, bank, or issuer authentication handoff. Do not guarantee that authentication always stays embedded.
  - Use Cashfree's documented `upiApp` IDs (`phonepe`, `gpay`, `paytm`) only after confirming merchant enablement and sandbox behavior.

- **D-04:** Server authority and data integrity.
  - Reuse the current backend order creation, server-calculated pricing, verification/status endpoints, signature-verified webhook path, and existing booking/payment-order persistence.
  - Never treat the browser SDK result alone as proof of payment.
  - Do not change payment business rules, webhook signature/idempotency logic, booking rules, or the MongoDB schema. Preserve Razorpay as an independent existing path.

- **D-05:** Platform boundary.
  - Do not modify a native Android application. Website behavior in mobile browsers, including Android browsers, may change.
  - Lazy-load the Cashfree browser SDK only when the website payment flow needs it; do not add it to public-page startup.

- **D-06:** Performance evidence.
  - Treat the Phase 1 local baseline as the comparable reference: three sequential cold-cache local runs, same Lighthouse/mobile emulation settings and build provenance. Report median and range.
  - The Phase 1 hero was eager/high priority/discoverable; element-render delay was the largest LCP subpart, but no single code-level cause was confirmed. Lighthouse opportunity estimates are leads, not diagnoses.
  - Keep Lighthouse LCP and trace candidate timing distinct. Do not claim a target without a new comparable run.

- **D-07:** Execution authorization.
  - Planning artifacts do not authorize implementation. Pause before any application, payment, deployment, or production-configuration changes until the user separately gives explicit authorization.

### the agent's Discretion
- Reuse existing payment UI styling and component patterns; do not redesign the page.
- If an Elements method or merchant capability is not verified, record it as a pre-implementation gate, not as supported behavior.
- Use sandbox or mocks and synthetic bookings only for future tests; never initiate a production transaction.

</decisions>

<canonical_refs>
## Canonical References

### Scope and acceptance
- `.planning/PROJECT.md` — stable project constraints and product behavior.
- `.planning/REQUIREMENTS.md` — Phase 2 performance and Cashfree requirements.
- `.planning/ROADMAP.md` — phase sequence and success criteria.
- `.planning/phases/01-mobile-baseline-evidence-audit/01-SUMMARY.md` — Phase 1 evidence.
- `.planning/phases/01-mobile-baseline-evidence-audit/01-VALIDATION.md` — Phase 1 audit validation.
- `docs/performance-baseline.md` — historical run provenance and comparable local protocol.

### Website payment and performance architecture
- `src/pages/BookingPayment.jsx` — website payment UI, SDK loading, current order creation and payment handlers.
- `src/services/bookingEnquiryPayment.js` — browser API wrappers for Cashfree and Razorpay.
- `backend/src/services/cashfreePayments.js` — server-side Cashfree order, verification, status, and webhook processing.
- `backend/src/routes/bookingEnquiries.js` — Cashfree and Razorpay booking payment endpoints.
- `backend/src/routes/cashfreeWebhook.js` — signature-verified Cashfree webhook route.
- `backend/src/models/bookingEnquiry.js` — existing payment order persistence; do not change its schema.
- `backend/test/cashfreePayments.test.js`, `backend/test/cashfreeWebhook.test.js`, `backend/test/booking-enquiries.test.js` — existing backend payment coverage.

### Official Cashfree references
- Element overview: https://www.cashfree.com/docs/payments/online/element/overview.md
- Element API and component lifecycle: https://www.cashfree.com/docs/payments/online/element/introduction.md
- Card Elements: https://www.cashfree.com/docs/payments/online/element/cards.md
- UPI Elements: https://www.cashfree.com/docs/payments/online/element/upi.md
- UPI app IDs: https://www.cashfree.com/docs/payments/online/element/appendix.md#upi-app-list
- Payment options: https://www.cashfree.com/docs/payments/online/element/payment-options.md
- Order creation API: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order.md
- Server-side order verification: https://www.cashfree.com/docs/api-reference/payments/latest/orders/get-order.md
- Webhook signature verification: https://www.cashfree.com/docs/payments/online/webhooks/signature-verification.md
- Sandbox: https://www.cashfree.com/docs/payments/online/resources/sandbox-environment.md

</canonical_refs>

<code_context>
## Existing Code Insights

- `BookingPayment.jsx` already creates a server-backed Cashfree order/session and mounts an inline `upiQr` component. Non-QR selections currently call `cf.checkout({ redirectTarget: '_modal' })`; the displayed labels do not currently constrain the provider payment component.
- The browser service already calls the Cashfree order, verify, status, and failure endpoints. The backend service persists provider orders in existing booking fields and queries Cashfree for verification; the routes and webhook are separate from Razorpay.
- The Cashfree webhook route receives raw bytes, checks the signature before JSON parsing, then invokes payment processing. Preserve this security boundary.
- Cashfree's browser SDK is loaded from its documented CDN path at runtime; it is not a frontend package dependency.
- No native Android project was found in the repository. Do not infer native-app behavior from the React website's Android user-agent handling.

</code_context>

<specifics>
## Specific Ideas

- Build a branded payment-method selector using the existing VibeTogether payment-screen style and responsive conventions.
- The first checkout surface should remain on the VibeTogether page; a selected method may subsequently invoke Cashfree-required external authentication.
- A selected method must mount its corresponding Element; avoid a generic "all methods" hosted modal.
- Preserve existing payment status, retry, cancellation, ticket, notification, and booking outcomes by continuing to use the established server API.

</specifics>

<deferred>
## Deferred Ideas

- Replacing or removing Razorpay.
- Native Android changes.
- Database schema changes or alterations to payment business rules/webhooks.
- Production deployment or live payment testing.

</deferred>

---
*Phase: 02-evidence-backed-performance-changes*
*Context gathered: 2026-11-18*
