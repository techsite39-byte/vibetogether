---
phase: "02"
slug: "website-custom-cashfree-payment-ui"
status: draft
created: "2026-11-17"
nyquist_compliant: false
planning_only: true
---

# Phase 02 Validation — Website Custom Cashfree Payment UI

This is a future validation contract. Nothing in this checklist has been executed by the planning task, and no payment, deployment, database write, or production request is authorized.

## Validation gates

### Architecture and capability gate

- [ ] Confirm the merchant account has Cashfree Elements enabled for PhonePe, Google Pay, Paytm, UPI QR, cards, required net-banking banks, and each wallet to be offered.
- [ ] Record the exact official SDK component names, option keys, app IDs, wallet providers, bank codes, and selected-component `cashfree.pay` contract used by the implementation.
- [ ] Confirm the current merchant-supported `CASHFREE_API_VERSION` without changing it during this phase.
- [ ] Confirm the Cashfree domain whitelist and sandbox website origin before browser testing.
- [ ] Confirm whether QR is fully initiated by mounting or requires an explicit `cashfree.pay` call in the current SDK; do not infer this from the existing QR branch.
- [ ] Confirm the exact card multi-component submission flow from current Cashfree documentation/example; no raw card values may be read by VibeTogether.
- [ ] Confirm wallet phone requirements and the merchant-enabled provider list; the sandbox's generic wallet is not proof of individual wallet support.
- [ ] If any required capability is unsupported or unverified, stop for owner review. Do not silently remove the method or use hosted checkout.

### Protected-file and scope gate

- [ ] Before implementation, capture `git status --short --untracked-files=all` and preserve all existing changes.
- [ ] Confirm no `.env` values, private keys, access tokens, or production secrets were read or logged.
- [ ] Confirm no native Android project/source is present in this repository; do not claim native Android regression coverage without the separate app.
- [ ] Confirm backend source, Cashfree/Razorpay services, webhook routes, MongoDB schemas, deployment files, `package.json`, lockfiles, and production settings are not implementation targets.
- [ ] Obtain explicit user authorization for website source/test edits. A plan review does not satisfy this gate.

## Automated validation matrix

These commands are for the separately authorized implementation phase. They were not run for this planning task.

| Area | Command/check | Expected evidence |
| --- | --- | --- |
| Method mapping | `node --test test/cashfreePaymentMethods.test.js` | PhonePe → `phonepe`, Google Pay → `gpay`, Paytm → `paytm`; Other UPI → QR; no hosted method; unsupported options excluded |
| Payment state | `node --test test/cashfreePaymentState.test.js` | Loading, ready, selected-only mount, submitting lock, cancellation, pending, failure, retry, and paid transitions are server-authoritative |
| Presentation | `node --test test/cashfreePaymentPresentation.test.js` | Required labels, keyboard selection, no VPA collect, no modal fallback, and raw card values absent from application-owned state |
| Frontend tests | `npm.cmd test` | Existing tests plus focused tests pass; a timeout or stalled suite is reported as incomplete, not passed |
| Frontend build | `npm.cmd run build` | Production build passes without adding payment SDK dependencies or changing deployment config |
| Frontend lint | `npm.cmd run lint` | No new diagnostics in changed website/test files; existing unrelated warnings are separated |
| Backend Cashfree regression | `npm.cmd --prefix backend test -- test/cashfreePayments.test.js test/cashfreeWebhook.test.js` | Booking-bound order/payment/amount/currency checks, pending behavior, idempotency, raw-body signature verification, and duplicate webhook behavior remain green |
| Backend/Razorpay regression | `npm.cmd --prefix backend test -- test/razorpayPayments.test.js` | Razorpay order, signature, failure/pending retry, webhook, and later-capture behavior remains green |
| Diff safety | `git diff --check` and protected-path status check | No whitespace errors; no protected backend, schema, env, deployment, Android, or Razorpay file changed |

If repository test-script argument forwarding differs from the command above, use the equivalent focused Node command without modifying `package.json`.

## Cashfree sandbox/manual test cases

Use synthetic booking IDs, sandbox credentials, and a non-production origin only. Capture request/response metadata without secrets or raw card data.

### Method selection and mounting

- [ ] Load the existing `/booking/payment/:requestId` route with a persisted unpaid synthetic booking.
- [ ] Verify the server-provided amount, currency, booking summary, and request ID remain unchanged while selecting methods.
- [ ] Verify each required choice is separately visible: PhonePe, Google Pay, Paytm, Other UPI (QR), Cards; add only verified Net Banking and wallet choices.
- [ ] Verify selection alone does not call `cashfree.pay`, `cashfree.checkout`, open a popup/modal, launch an app, or navigate away.
- [ ] Verify only the selected Element is mounted and the previous Element is unmounted on method change.
- [ ] Verify no generic hosted selector or direct-payment-window link is reachable from any method.
- [ ] Verify all method controls are keyboard operable, have visible selected/focus states, meet the existing touch-target convention, and do not overflow at 360, 375, 390, 412, 430 CSS px or desktop.

### PhonePe, Google Pay, and Paytm

- [ ] On a supported Android mobile browser with the relevant app installed, select PhonePe, Google Pay, and Paytm separately and verify the matching `upiApp` ID is mounted.
- [ ] Verify explicit CTA activation is the only trigger for each app handoff.
- [ ] Verify app missing, app cancellation, back navigation, return URL, and network interruption leave the booking intact and do not show paid state without server confirmation.
- [ ] On desktop, verify app-only methods show an honest capability/fallback state and do not throw an unhandled load error or open hosted checkout.
- [ ] In a custom Android WebView, verify the documented limitation is reported; do not modify native code to work around it under this phase.

### Other UPI QR

- [ ] Verify the QR Element is inline, branded by the surrounding VibeTogether panel, and shows the server-calculated amount.
- [ ] Verify scanning with a sandbox UPI test flow leaves the page usable and status polling/recheck reads the backend result.
- [ ] Verify no VPA/collect input is rendered and no client-generated UPI payment is treated as confirmed.
- [ ] Verify pending, successful, failed, expired, and network-disconnected QR states.

### Cards

- [ ] Verify card number, expiry, CVV, and cardholder fields are Cashfree Elements, not ordinary VibeTogether inputs.
- [ ] Verify raw PAN/CVV/expiry values never appear in React state, DOM attributes owned by VibeTogether, network payloads to the VibeTogether backend, logs, screenshots, or test output.
- [ ] Verify sandbox successful, failed, incomplete, and issuer-authentication/redirect outcomes.
- [ ] Verify the exact selected card component contract is submitted only after explicit activation.

### Net Banking and wallets

- [ ] Verify only merchant-enabled bank codes/providers are represented.
- [ ] Verify selected bank/wallet changes remount only the selected component and retain the same booking/session.
- [ ] Verify bank and wallet authentication handoffs, cancellation, return, pending, failed, and retry outcomes.
- [ ] Verify the wallet phone value comes from the already validated booking contact and is not logged or copied to a new payment field unnecessarily.
- [ ] Record unsupported merchant/sandbox capabilities as blocked rather than passing them through hosted checkout.

## Payment outcome and data-integrity tests

| Case | Required result |
| --- | --- |
| Successful component result | Frontend calls server verify/status; booking is paid only after provider-bound amount/currency/payment success is persisted; ticket/reference appears afterward |
| Browser callback says success but server says pending | Show pending/recheck; no ticket, reference, notification-as-paid, or second charge |
| Provider returns failed | Show retry/method-change state; no booking reference; server failure state remains retryable where the existing contract allows |
| User cancels app/bank/issuer handoff | Do not mark failure solely from cancellation; reconcile status before enabling another attempt |
| Network timeout after provider submission | Mark outcome uncertain, poll/recheck, and block duplicate submission until server decision |
| Double-click / repeated submit | One provider initiation at most from the UI; CTA disabled via state and ref lock; server duplicate verification remains idempotent |
| Refresh / return URL with `order_id` | Verify the order against the booking; unrelated order IDs are rejected; status is no-store and server-authoritative |
| Duplicate verify | Existing paid booking returns duplicate/idempotent result without allocating a second reference |
| Amount/currency mismatch | No paid state, no reference, no ticket; mismatch is logged safely without secrets |
| Signed success webhook | Raw body signature, timestamp, order binding, payment ID, amount, and INR currency pass before persistence |
| Invalid/expired/malformed webhook | Rejected without payment mutation or notification |
| Duplicate webhook | No duplicate reference, payment record, or notification side effect |

## MongoDB, booking, ticket, and notification validation

- [ ] Assert the booking's original `requestId`, attendee details, event/category, pricing, and currency survive method changes and retries.
- [ ] Assert the Cashfree order/session/payment reference fields and `paymentOrders` entry are persisted through existing fields only.
- [ ] Assert `paymentStatus` remains non-paid for pending/failed/cancelled attempts and a reference is absent until verified success.
- [ ] Assert paid state updates `reference`, `paymentStatus`, `status`, `cfPaymentId`, `cfPaymentStatus`, `cfPaymentMethod`, `paidAt`, and `paymentVerifiedAt` according to the existing service contract.
- [ ] Assert ticket QR/reference and `/booking/confirmation/:bookingReference` are available only after authoritative paid state.
- [ ] Assert WhatsApp/email notification behavior follows existing backend calls and a notification failure cannot turn a paid booking into a failed one.
- [ ] Assert no schema migration or new payment method trust field is introduced.

## Razorpay coexistence regression

- [ ] Run the existing Razorpay unit/webhook suites with no Cashfree UI selected.
- [ ] Verify the Razorpay provider branch still creates its own order, verifies signatures, handles failed/pending/captured outcomes, and supports retry.
- [ ] Verify no Cashfree method selector or SDK path is rendered when the booking's provider mode is Razorpay.
- [ ] Verify no Razorpay source, webhook, configuration, or tests are deleted or repurposed.

## Android and responsive regression protection

- [ ] Confirm `git diff --name-only` contains no native Android source; because none exists in this repository, label native-app validation as unavailable rather than passed.
- [ ] Inspect the website in Android Chrome (not only desktop emulation) for app handoff/cancel/return behavior.
- [ ] Inspect all required widths: 360, 375, 390, 412, 430 CSS px, plus a desktop viewport.
- [ ] Check no horizontal overflow, clipped card fields, clipped QR, hidden CTA, or layout shift when the selected Element becomes ready.
- [ ] Preserve existing `prefers-reduced-motion` behavior and avoid adding payment-page animation that masks loading or status.

## Performance validation boundary

- [ ] Verify the Cashfree SDK is absent from homepage/public route startup and loads only in the payment flow.
- [ ] Verify method switching does not reload the page or recreate the booking/order unnecessarily.
- [ ] If performance changes are later authorized, repeat the Phase 1 comparable protocol and report median/range; do not compare a payment-page run to the homepage baseline as if they were the same measurement.
- [ ] Do not claim Performance, LCP, TBT, or payment-page speed targets without fresh comparable evidence.

## Production-readiness criteria

The implementation is not production-ready until all of the following are true:

- [ ] Merchant capability and domain/API-version gates are signed off.
- [ ] Focused tests, frontend build/lint/tests, backend payment/webhook regressions, and protected-flow checks pass.
- [ ] Sandbox success/failure/pending/cancelled/duplicate/amount-mismatch/webhook cases pass for every offered method.
- [ ] MongoDB persistence, booking reference, ticket QR, and notifications are verified.
- [ ] No hosted checkout is reachable from the initial method surface.
- [ ] No browser callback alone can create paid state.
- [ ] Razorpay remains a tested rollback/independent path.
- [ ] Android-native behavior is explicitly marked unavailable or separately tested with the actual app.
- [ ] Production deployment and any live transaction have separate explicit authorization.

## Assumptions and unresolved decisions

| Item | Status | Required decision |
| --- | --- | --- |
| Website-only scope | Confirmed | Keep native Android outside this repository/task |
| Other UPI meaning | Confirmed | QR/app-supported flow only; no VPA collect |
| PhonePe/Google Pay/Paytm IDs | Officially documented | Confirm merchant enablement and sandbox handoff |
| Cards | Documented Elements, exact pay wiring not fully verified here | Confirm current provider example before coding |
| Net Banking/wallets | Documented component types, merchant list unknown | Obtain enabled bank/provider list; otherwise block |
| Sandbox app-specific intent | Not established by sandbox guide | Test on supported Android browser or report blocked |
| Custom Android WebView | Officially unsupported for `upiApp` | Do not change native app without separate authorization |
| `CASHFREE_API_VERSION` | Repository default `2023-08-01`; current API examples include `2025-01-01` | Confirm merchant-supported value; do not change in this task |
| Create-order idempotency after lost response | Requires explicit regression | If gap exists, separate backend authorization |
| Existing backend/webhook/schema contracts | Protected and read-only for this plan | Reuse unchanged |
| Implementation authorization | Not granted | Stop after planning; wait for explicit approval |

## Validation sign-off

- [x] Phase 1 documentation and performance evidence were reviewed.
- [x] Architecture and official Cashfree capability research are documented.
- [x] Protected files and authorization boundaries are explicit.
- [x] Future automated and manual checks cover success, failure, pending, cancellation, duplicate prevention, webhooks, persistence, ticketing, Razorpay, Android isolation, and responsive behavior.
- [ ] Merchant capability/API-version/sandbox gates completed.
- [ ] Implementation authorization received.
- [ ] Implementation validation completed.

**Current result:** planning complete; implementation blocked pending explicit authorization and the listed Cashfree capability gates.

