---
phase: "02"
slug: "evidence-backed-performance-changes"
status: complete
completed: 2026-11-18
---

# Phase 02 Research — Cashfree Elements and Performance Scope

## Summary

The website already creates Cashfree orders and verifies payments on the server, but the non-QR website checkout currently opens Cashfree hosted checkout in a modal. Cashfree documents an Elements SDK that can render the selected payment component inside the VibeTogether page. Planning should preserve the existing server-side order, verification, webhook, booking, and Razorpay behavior while changing only the website interaction necessary for the requested custom UI. No source, payment, deployment, or production configuration was changed during this research.

## Repository Evidence

- `src/pages/BookingPayment.jsx` has a payment selector and an inline `upiQr` element. The selector includes UPI QR, a combined UPI/cards/net-banking/wallets option, Cards, and Net Banking; additional conditional panels are present for individual UPI methods. Non-QR handling calls `cf.checkout()` with `redirectTarget: '_modal'`, so selecting a branded label does not currently bind the provider to that selected method.
- `src/services/bookingEnquiryPayment.js` already wraps Cashfree order creation, payment verification, status checks, and failure recording, as well as separate Razorpay calls.
- `backend/src/services/cashfreePayments.js` creates Cashfree orders server-side from server-derived pricing, saves order/session data to existing booking fields and `paymentOrders`, and verifies against Cashfree.
- `backend/src/routes/bookingEnquiries.js` exposes separate Cashfree order/verify/status/failure routes and distinct Razorpay routes.
- `backend/src/routes/cashfreeWebhook.js` checks the webhook signature against the raw body before JSON parsing and dispatches to the existing payment service.
- `backend/src/models/bookingEnquiry.js` already contains Cashfree/Razorpay booking fields and `paymentOrders`; no new schema is indicated for this request.
- `backend/test/cashfreePayments.test.js` and `backend/test/cashfreeWebhook.test.js` cover service/webhook security and status behavior. Route-level Cashfree coverage should be checked when implementation is authorized; do not duplicate tests without identifying a gap.

## Cashfree Elements: Documented Behavior

- Load `https://sdk.cashfree.com/js/v3/cashfree.js`, initialize with `Cashfree({ mode: "sandbox" | "production" })`, create a component with `cashfree.create(componentName, options)`, then call `mount(selector)`.
- Submit the selected component with `cashfree.pay({ paymentMethod, paymentSessionId, returnUrl, redirect: "if_required" })`. The site owns the method selector; `paymentMethod` is a component, not a method-name string. Read the SDK result for UI state, but verify payment on the server.
- Component lifecycle documents `unmount()` and remounting. This supports a selected-method UI, but dynamically switching every method/component combination must be tested before relying on it.
- Card flow uses `cardNumber`, `cardExpiry`, `cardCvv`, and `cardHolder`; pass the card-number component to `pay()` and ensure all required fields are complete. Keep raw card data out of VibeTogether inputs, logs, and backend.
- UPI app IDs listed by Cashfree: PhonePe `phonepe`, Google Pay `gpay`, Paytm `paytm`. `upiApp` is mobile-oriented and can fail on desktop; Cashfree warns against custom Android WebViews. `upiQr` is the documented QR component.
- `redirect: "if_required"` is documented for relevant Elements flows, but can be ignored when a bank, app, or issuer requires redirection. The requirement is no initial hosted-checkout surface, not a promise of zero authentication handoffs.
- The Element CDN path `/js/v3/` is documented, but does not pin an immutable SDK patch version. `cashfree.version()` reports the loaded runtime version.
- The current Create Order API reference identifies `2026-01-01`, while Web Integration examples show `2025-01-01` and older examples show earlier dates. Confirm the merchant's supported `x-api-version` before changing the existing backend setting.
- The sandbox documents cards, net banking, UPI test VPAs, and a generic test wallet. It does not promise app-specific PhonePe/Google Pay/Paytm intent coverage. Verify merchant enablement and actual Android-browser handoffs with sandbox credentials before implementation acceptance.

## Existing Performance Evidence

Phase 1 reports the hero as the local LCP candidate in all three runs; it was eager, high priority, and discoverable. Element-render delay was the largest LCP subpart, but no code-level cause was confirmed. Long-task attribution was inconclusive. The local Lighthouse LCP median was 5.0 s and TBT median was 4,562 ms, with substantial run variation. Lighthouse opportunity estimates are not proof of causes. Preserve the same local build, viewport/network/CPU profile, cold-cache sequential-run protocol, and median/range reporting for comparison.

## Planning Gates / Unknowns

1. Confirm Cashfree Elements and each method are enabled for the merchant account; verify method switching, QR, and app handoff in an Android browser with sandbox data.
2. Verify whether Net Banking and supported wallets can be offered as branded Elements for the current merchant. The user selected retaining supported methods; if an option is not supported, stop for review rather than silently removing it or falling back to hosted checkout.
3. Confirm the `x-api-version` accepted by the merchant before any backend configuration change. No version change is proposed by this plan.
4. Do not alter backend business rules, webhook verification/idempotency, booking logic, or schema. If implementation reveals a server-side gap, stop and request separate authorization.
5. Implementation is not authorized by this planning request; no checkout, payment, deployment, or production configuration may be changed until the user explicitly authorizes it.

## Validation Architecture

- **Frontend:** `npm.cmd run build`, `npm.cmd run lint`, and the repository's existing Node test runner (`npm.cmd test`); add only focused tests for new method selection, selected Element invocation, and cancellation/pending/success UI states.
- **Backend regression:** `npm.cmd --prefix backend test`; preserve existing Cashfree service and webhook security tests. Add route-level tests only if an inspected coverage gap is found.
- **Sandbox/manual:** Use synthetic bookings and Cashfree sandbox only. Verify each supported method, selected-method binding, app unavailable/cancelled handoff, retry, QR, server verification, pending state, and signed webhook. Never submit production/live transactions.
- **Visual/platform:** Inspect existing layout at widths 360, 375, 390, 412, and 430 CSS px and desktop; include Android mobile browser. Do not modify or claim native Android behavior.
- **Performance:** Run three valid sequential cold-cache local Lighthouse captures under the Phase 1 profile after implementation and report median/range alongside Phase 1. Do not claim target achievement without a new comparable run. Any live production comparison requires separate authorization and deployment.

---
*Research completed: 2026-11-18*
