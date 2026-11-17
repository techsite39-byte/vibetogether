---
phase: "02"
slug: "website-custom-cashfree-payment-ui"
status: planning
created: "2026-11-17"
scope: planning-only
---

# Phase 02 Research — Website Custom Cashfree Payment UI

## Scope and evidence boundary

This is a read-only architecture audit and implementation plan. No application source, backend source, payment configuration, deployment file, database, payment provider, or production system was changed or contacted. The pasted brief is treated as the governing scope: the initial payment-method surface must be VibeTogether-owned, while a selected UPI app, bank, or issuer may perform a required external handoff.

The Phase 1 evidence was reviewed completely:

- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/phases/01-mobile-baseline-evidence-audit/01-SUMMARY.md`
- `.planning/phases/01-mobile-baseline-evidence-audit/01-VALIDATION.md`
- `docs/performance-baseline.md` — this repository stores the requested performance baseline under `docs/`, not at the repository root.

The relevant existing planning documents and codebase maps were also inspected. The existing roadmap already combines performance work with the website-only Cashfree Elements scope and states that implementation remains authorization-gated. `STATE.md` and `ROADMAP.md` were therefore not edited by this supplemental payment-specific plan; their pre-existing uncommitted changes remain intact.

## Repository and worktree snapshot

| Item | Observed value |
| --- | --- |
| Git branch | `main` |
| HEAD | `234be78cc806d7e33abc9dbdafd452c210c62f01` |
| Initial worktree | Dirty before this audit; existing documentation and homepage changes were present |
| Initial status | Modified: `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/phases/01-mobile-baseline-evidence-audit/01-PLAN.md`, `.planning/phases/01-mobile-baseline-evidence-audit/01-VALIDATION.md`, `docs/performance-baseline.md`, `src/pages/Home.jsx` |
| Initial untracked items | Phase 1 summary, `.planning/state.json`, the existing Phase 2 performance-planning files (`02-01-PLAN.md` through `02-06-PLAN.md`, context, patterns, research, UI spec, validation, coverage), and `src/components/home/EventPosterModal.jsx/.css` |
| Secret handling | `.env` and secret values were not read or printed |

The final status must show only the three new documents in this directory added by this task, alongside the exact pre-existing status above. No existing file may be reset, cleaned, stashed, staged, committed, or reverted.

## Phase 1 evidence relevant to checkout planning

Phase 1 completed an audit-only mobile homepage baseline. Its important constraints are:

- Source/build provenance was commit `234be78cc806d7e33abc9dbdafd452c210c62f01`; the production build passed with Vite 8.3.6, Node 24.19.0, Chrome 157.0.8103.52, and Lighthouse 13.6.0.
- The three local sequential mobile preview runs had a median Performance score of 50, Lighthouse LCP of 5.0 s, TBT of 4,562 ms, CLS of 0.0074, and total transfer of 1,017,602 bytes. LCP and TBT varied materially between runs.
- The homepage hero was eager, high priority, and discoverable. The trace-observed candidate timing and Lighthouse's simulated LCP metric were intentionally kept separate. Element-render delay was the largest trace LCP subpart, but no responsible code function or dependency was confirmed.
- The audit's browser logs contained only `GET` requests. No booking, payment, admin, or production write was performed.
- Performance opportunities are leads, not proof of a payment-page bottleneck. The payment plan must not change homepage behavior, global performance settings, fonts, or unrelated routes.

## Existing architecture map

### Booking and frontend route flow

1. `src/App.jsx` lazy-loads `BookingPayment.jsx` at `/booking/payment/:requestId`. The payment page is already a route boundary separate from the homepage and admin routes.
2. `src/components/booking/BookingJourney.jsx` submits the booking enquiry and navigates to the payment route after the server returns a request ID. The booking data is therefore persisted before checkout begins.
3. `src/pages/BookingPayment.jsx` fetches the persisted booking, derives the payable amount from the server response, displays the booking summary, and selects the Cashfree or Razorpay branch from the serialized provider configuration.
4. `src/services/bookingEnquiryPayment.js` is the browser API boundary. It validates the returned booking shape and wraps Cashfree order creation, verification, status, and failure endpoints, plus independent Razorpay endpoints.
5. `src/pages/BookingConfirmation.jsx` and the paid state in `BookingPayment.jsx` consume a server-assigned booking reference. The paid ticket/QR state is not supposed to be created from a browser-only SDK result.

### Current `BookingPayment.jsx` behavior

Observed facts:

- The Cashfree SDK is loaded from `https://sdk.cashfree.com/js/v3/cashfree.js`; the page currently starts loading it as soon as the payment page mounts.
- The page creates a Cashfree order through the backend and retains `payment_session_id`, `order_id`, environment, amount, and pricing in React state.
- The current selector's source list contains `upi_qr`, `modal`, `card`, and `netbanking`. The `gpay`, `phonepe`, `paytm`, and `wallet` panels exist lower in the JSX but are not included in that source list, so those panels are unreachable through the current selector.
- The `upi_qr` branch mounts an inline `upiQr` Element, polls Cashfree status every 3.5 seconds, and provides a status-check button.
- All non-QR methods currently call `cashfree.checkout({ paymentSessionId, redirectTarget: '_modal', returnUrl })`. The current labels therefore do not constrain Cashfree to the method the customer selected.
- There are additional “direct payment window” and “all methods” handlers that route back to the same hosted modal. Those branches conflict with the requested website-owned initial method surface.
- `isPaying`, a ref-based `paying` lock, `paymentUncertain`, visibility-based status refresh, URL return-order verification, and server-side verification/status calls already provide useful state-machine scaffolding.
- The independent Razorpay branch remains present and uses its own SDK, order, verification, failure, and status handlers. It must not be removed or repurposed by this plan.

The principal frontend defect is therefore an integration mismatch, not a missing page: the presentation suggests method-specific Elements, but the actual non-QR initiation is still hosted checkout.

### Backend Cashfree contract

| Concern | Existing implementation | Planning consequence |
| --- | --- | --- |
| Configuration | `backend/src/config/env.js` reads `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`, and `CASHFREE_API_VERSION`; only configuration booleans and safe payment metadata are serialized to the browser | Keep all credentials server-side; do not read or copy `.env` values |
| Order creation | `backend/src/services/cashfreePayments.js` creates `POST /pg/orders` server-side using server-calculated pricing and stores `paymentOrderId`, session ID, amount, and a `paymentOrders` entry | Reuse the existing order/session contract; the UI must never calculate or submit the payable amount |
| Browser order endpoint | `POST /api/booking-enquiries/:requestId/cashfree-order` | The selected method is a browser presentation choice, not a new booking identity or schema field |
| Verification | `cashfreePayments.verifyPayment` binds the requested order to the booking, fetches order payments and order status, requires a successful payment with matching amount and INR currency, and allocates a reference only after validation | Treat `cashfree.pay` output as provisional; call the existing server verification/status path |
| Status | `POST /api/booking-enquiries/:requestId/cashfree-status` reconciles the provider state and returns `pending`, `duplicate`, and booking data with `Cache-Control: no-store` | Pending/uncertain must block another charge until a server status decision |
| Failure | `POST /api/booking-enquiries/:requestId/cashfree-failure` records a terminal failure/cancellation outcome without allocating a reference | A browser cancellation must not be declared terminal until provider status is checked; any backend semantic gap requires separate authorization |
| Webhook | `backend/src/app.js` mounts both Cashfree webhook aliases before JSON parsing, using `express.raw`; `cashfreeWebhook.js` verifies the raw body before JSON parsing and delegates to the payment service | Preserve the raw-body boundary, HMAC verification, replay timestamp check, and idempotent processing |
| Persistence | `bookingEnquiry.js` stores `paymentStatus`, `paymentOrders`, Cashfree order/payment/session/status/method fields, payment reference/timestamps, failure reason, and booking reference | No MongoDB schema change is required or authorized |

### Existing API wrapper details

`src/services/bookingEnquiryPayment.js` exposes:

- `getBookingEnquiry(requestId)`
- `createCashfreeOrder(requestId, returnUrl)`
- `verifyCashfreePayment(requestId, paymentData)`
- `checkCashfreePaymentStatus(requestId)`
- `recordCashfreePaymentFailure(requestId, failure)`
- separate Razorpay order, verify, status, and failure wrappers

The implementation plan should consume those wrappers. A new frontend method selector does not justify a new backend endpoint or a frontend-to-Cashfree secret.

## Existing Razorpay behavior

Razorpay is an independent configured provider path selected by `PAYMENT_PROVIDER`. Its order creation and signature verification are in `backend/src/services/razorpayPayments.js`; its webhook has a separate raw-body/signature route; and `BookingPayment.jsx` keeps the Razorpay checkout and reconciliation handlers behind the provider branch. The safe migration posture is:

1. Preserve all Razorpay source and tests.
2. Add and test the Cashfree Elements path independently.
3. Compare Cashfree sandbox outcomes with the existing Razorpay behavior for success, failure, pending, cancellation, webhook processing, persistence, and retry.
4. Decommission Razorpay only in a later, separately authorized change after production evidence and rollback planning.

No Razorpay file is an implementation target for this task.

## Cashfree capability review from official documentation

The following official Cashfree pages were fetched during this audit on 2026-11-17. The plan distinguishes documented SDK capability from merchant-account enablement and sandbox behavior.

### Confirmed documented capabilities

- [Custom checkout overview](https://www.cashfree.com/docs/payments/online/element/overview.md) describes custom web checkout with branded control, PCI DSS scope reduction, cards, UPI (collect/intent/QR), net banking, wallets, and BNPL. It requires server-side order creation and direct loading of the Cashfree SDK from the Cashfree CDN.
- [Web Element SDK](https://www.cashfree.com/docs/payments/online/element/introduction.md) documents `Cashfree({ mode })`, `cashfree.create(componentName, options)`, `component.mount(selector)`, component lifecycle cleanup, and `cashfree.pay({ paymentMethod, paymentSessionId, returnUrl, redirect })`. It explicitly distinguishes `checkout()` as the hosted page path from individual custom components.
- [UPI components](https://www.cashfree.com/docs/payments/online/element/upi.md) document `upiApp` and `upiQr`. `upiApp` is mobile-only and reports a load error on desktop. Cashfree explicitly warns that `upiApp` will not mount in a custom Android WebView/in-app browser. The documented UPI app identifiers are `phonepe`, `gpay`, and `paytm`.
- [Card components](https://www.cashfree.com/docs/payments/online/element/cards.md) document separate `cardNumber`, `cardExpiry`, `cardCvv`, and `cardHolder` Elements. Card values must remain within Cashfree-hosted fields; VibeTogether must not copy raw card data into React state, logs, or the backend.
- [Wallet, net banking, and BNPL components](https://www.cashfree.com/docs/payments/online/element/other-components.md) document a `wallet` component with a provider and customer phone, and a `netbanking` component with a Cashfree bank code/name. These are individual component choices, not a generic hosted selector.
- [Cashfree component appendix](https://www.cashfree.com/docs/payments/online/element/appendix.md) lists the UPI app IDs, wallet provider identifiers, and net-banking codes. The implementation must use this mapping rather than inventing names from the VibeTogether label.
- [Payment options](https://www.cashfree.com/docs/payments/online/element/payment-options.md) states that `paymentMethod` is the component object, not a method-name string, and that `redirect: 'if_required'` may be ignored when the selected method requires a bank/app/issuer redirect. It recommends server-side order-status checks.
- [Create Order](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order.md) requires server authentication and returns `payment_session_id`; the order API supports payment-method filtering and UPI-app priority, but this plan does not add client-controlled method filtering or reintroduce removed backend fields without a separate backend decision.
- [Get Order](https://www.cashfree.com/docs/api-reference/payments/latest/orders/get-order.md) identifies `order_status: PAID` as the successful order state, while the repository's security fix also requires a matching successful payment record, amount, currency, and booking-bound order. Both safeguards remain.
- [Webhook signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification.md) requires the exact raw body and the `x-webhook-timestamp`/`x-webhook-signature` headers for HMAC verification. The repository already preserves this boundary.

### Capability matrix

| Customer choice | Website-owned initial surface | Provider handoff | Documented limitation / gate |
| --- | --- | --- | --- |
| PhonePe | Branded selector + selected `upiApp` Element | PhonePe app may open after explicit submit | Mobile phones only; no custom Android WebView; merchant enablement and sandbox behavior must be verified |
| Google Pay | Branded selector + selected `upiApp` Element | Google Pay app may open after explicit submit | Same mobile/browser and merchant enablement gates |
| Paytm | Branded selector + selected `upiApp` Element | Paytm app may open after explicit submit | Same mobile/browser and merchant enablement gates |
| Other UPI | Branded selector + inline `upiQr` Element | Customer scans with a UPI app, potentially on another device | Use QR, not VPA collect; exact QR initiation/status sequence must follow the current SDK example |
| Cards | Branded selector + Cashfree card Elements | Issuer 3DS/authentication may redirect | Exact card `pay()` object wiring must be verified from the current provider example before coding |
| Net Banking | Branded selector + selected Cashfree `netbanking` Element | Bank authentication may redirect | Only verified merchant-enabled bank codes may be shown |
| Wallets | Separate branded choices for each verified Cashfree wallet Element | Wallet/issuer authentication may redirect | Merchant enablement and required phone-field behavior must be verified; sandbox has only a generic test wallet, not individual providers |
| Hosted checkout/modal | Not used as the initial surface | N/A | Explicitly out of scope; no generic method fallback |

### Sandbox limitations

The [Cashfree sandbox guide](https://www.cashfree.com/docs/payments/online/resources/sandbox-environment.md) documents cards, test net banking, test UPI VPAs, and one generic test wallet. It states that individual wallet providers are not present in sandbox and that PayPal/bank transfer are not supported there. It does not establish that app-specific PhonePe, Google Pay, or Paytm intent handoffs are testable in every browser. Sandbox app-handoff and merchant-account enablement are therefore blocking manual gates, not assumptions.

### API-version observation

The existing backend default is `2023-08-01` from `CASHFREE_API_VERSION`. The current Cashfree Create Order API page uses a `x-api-version` header and its current examples include `2025-01-01`, while other SDK examples still show older versions. The merchant's accepted version must be confirmed before implementation. This task does not change the environment value or backend header.

## Android/WebView isolation

No native Android project, Gradle file, Kotlin/Java Android source, or WebView wrapper was found in the repository file inventory. The website contains browser user-agent checks in `BookingPayment.jsx` and `UpiPayment.jsx`, but those are not native Android code. The brief's statement that an Android application uses WebView cannot be validated from this checkout repository.

The implementation boundary is therefore:

- Native Android code, if it exists in another repository, remains untouched.
- Website behavior in Chrome/Firefox/Safari mobile browsers, including Android browsers, is in scope.
- A custom Android WebView must not be promised `upiApp` support because Cashfree's own documentation says the component will not mount there.
- The safe WebView fallback is the in-page QR path only if it is confirmed to work in that wrapper; otherwise the limitation must be reported and the native app requires separate authorization.
- Android regression validation can only verify this repository's website behavior unless the separate Android source/app is provided.

## Risks and unresolved findings

1. **Current selector/implementation mismatch:** method labels are not authoritative; the current non-QR path is hosted modal checkout. This is the primary planned frontend change.
2. **Unreachable method panels:** `gpay`, `phonepe`, `paytm`, and `wallet` JSX branches are not in the current selector list. Their presence does not prove a working integration.
3. **Merchant enablement unknown:** Cashfree documentation does not prove that this merchant account has each app, bank, wallet, or card capability enabled. Do not silently hide a requested method or route it to hosted checkout; stop for owner review if capability is unavailable.
4. **Exact component submission contract:** the official pages confirm that `paymentMethod` is a component object, but exact multi-field card submission and wallet/QR initiation must be copied from the current Cashfree example/SDK behavior and sandbox-tested. Do not invent payloads or SDK methods.
5. **App handoff and WebView:** `upiApp` is mobile-only and does not mount in custom Android WebViews. Desktop and WebView states need honest fallback copy.
6. **Order-creation retry/idempotency:** the backend is strong on booking-bound verification and duplicate paid-state handling, but order creation across a lost network response/retry must be explicitly tested. If a backend idempotency gap is found, stop for separate backend authorization rather than changing the schema or business rules under this UI plan.
7. **Cancellation semantics:** a dismissed app/bank/issuer handoff is not proof of failure. The UI must recheck provider status before enabling another charge and must not mark a booking failed solely from a browser callback.
8. **API version compatibility:** the repository's configured version and current provider examples differ; confirm the merchant-supported version before any change.
9. **No native Android evidence:** native regression claims are blocked unless the Android project/app is supplied separately.

## Research conclusion

The safest architecture is a website-owned method selector that lazily mounts only the selected Cashfree Element and submits it only after explicit user activation, while reusing the existing server-created order/session and server-authoritative verification/status/webhook/persistence contracts. The initial hosted Cashfree checkout must be removed from the authorized implementation path, not used as a fallback. The plan is technically feasible for the website, subject to the merchant/sandbox and exact SDK-contract gates above; it is not yet production-ready or authorized for implementation.

