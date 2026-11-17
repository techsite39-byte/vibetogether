---
phase: "02"
slug: "website-custom-cashfree-payment-ui"
status: blocked
created: "2026-11-17"
scope: capability-verification-only
---

# Cashfree Capability Verification Report

## Verification boundary

This report verifies public Cashfree documentation and repository configuration only. No Cashfree payment API, merchant dashboard, sandbox order, production endpoint, or real payment was accessed. No secret values were read; `.env` was not opened. No application, backend, payment, schema, deployment, package, lockfile, or Android file was modified.

The previously prepared planning documents were reviewed:

- [02-RESEARCH.md](./02-RESEARCH.md)
- [02-PLAN.md](./02-PLAN.md)
- [02-VALIDATION.md](./02-VALIDATION.md)

## Official SDK contract verified

The following current official documentation pages returned successfully during this verification:

- [Custom web checkout overview](https://www.cashfree.com/docs/payments/online/element/overview.md)
- [Web Element SDK](https://www.cashfree.com/docs/payments/online/element/introduction.md)
- [Component reference](https://www.cashfree.com/docs/payments/online/element/components.md)
- [Component lifecycle](https://www.cashfree.com/docs/payments/online/element/component-overview.md)
- [UPI components](https://www.cashfree.com/docs/payments/online/element/upi.md)
- [Card components](https://www.cashfree.com/docs/payments/online/element/cards.md)
- [Wallet/net-banking components](https://www.cashfree.com/docs/payments/online/element/other-components.md)
- [Payment options](https://www.cashfree.com/docs/payments/online/element/payment-options.md)
- [Element examples](https://www.cashfree.com/docs/payments/online/element/examples.md)
- [UPI/wallet/bank appendix](https://www.cashfree.com/docs/payments/online/element/appendix.md)
- [Create Order API](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order.md)
- [Get Order API](https://www.cashfree.com/docs/api-reference/payments/latest/orders/get-order.md)
- [Webhook signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification.md)
- [Sandbox environment](https://www.cashfree.com/docs/payments/online/resources/sandbox-environment.md)
- [Payment errors](https://www.cashfree.com/docs/api-reference/payments/errors.md)

### Exact documented SDK behavior

1. Load `cashfree.js` from the Cashfree CDN and initialize `Cashfree({ mode: 'sandbox' | 'production' })` after the SDK is ready.
2. Create a component with `cashfree.create(componentName, options)`.
3. Mount it with `component.mount(querySelector)` after the SDK and DOM container are ready.
4. Use `ready`, `loaderror`, `complete`, `invalid`, and related component events. `component.isComplete()` is documented for payable-component readiness. `component.unmount()` removes a component; `component.destroy()` is permanent.
5. Start payment with a payment-options object containing at least:

   ```js
   {
     paymentMethod: component,
     paymentSessionId: 'server-created-payment-session-id',
     returnUrl: 'https://example.com/payment-return?order_id={order_id}',
     redirect: 'if_required'
   }
   ```

6. `cashfree.pay()` returns a Promise. Documented outcomes are `result.error`, `result.redirect`, or `result.paymentDetails`/`paymentMessage` for non-redirect flows such as UPI/QR. Cashfree warns that `pay()` may take several seconds and user interaction should be disabled while it runs.
7. `redirect: 'if_required'` can avoid redirect for Card, UPI, and QR, but is ignored when the selected method requires a redirect. `returnUrl` is still required for redirect-capable flows.
8. `cashfree.checkout()` is the hosted-page path. Its `redirectTarget: '_modal'` option is not an acceptable initial surface for this VibeTogether requirement.
9. Public documentation does not define a stable, specific “user cancelled” error enum for `cashfree.pay()`. The SDK exposes a generic error object/type; cancellation must be reconciled with the server-side order status before retrying or recording failure.

## Capability matrix

| Capability | Documentation verified | Merchant confirmation needed | Sandbox test possible | Status |
| --- | --- | --- | --- | --- |
| **PhonePe** | `upiApp`; `values.upiApp: 'phonepe'`; mobile-only; `ready`/`loaderror`; custom Android WebView unsupported | Confirm UPI intent is enabled for this merchant/environment, domain is whitelisted, and PhonePe handoff is enabled for the test browser/app combination | **Partial.** Public sandbox docs provide UPI test VPAs, but do not guarantee app-specific PhonePe intent handoff. Requires a supported mobile-browser sandbox test | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |
| **Google Pay** | `upiApp`; `values.upiApp: 'gpay'`; same mobile/browser constraints | Confirm Google Pay intent enablement and supported browser/app behavior | **Partial.** Generic UPI sandbox data is documented; Google Pay intent behavior is not guaranteed by the sandbox page | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |
| **Paytm** | `upiApp`; `values.upiApp: 'paytm'`; same mobile/browser constraints | Confirm Paytm intent enablement and supported browser/app behavior | **Partial.** Generic UPI sandbox data is documented; Paytm intent behavior is not guaranteed by the sandbox page | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |
| **Other UPI (QR)** | `upiQr` is a documented payable component; initialize with `cashfree.create('upiQr', { values: { size: '220px' } })`, mount it, wait for readiness, then use the documented `cashfree.pay()` contract with `redirect: 'if_required'` or the current QR example's exact sequence | Confirm UPI/QR is enabled and the domain/session is approved for the merchant | **Partial/possible.** QR component rendering and mocked/sandbox session behavior can be tested; sandbox documentation explicitly lists UPI test VPAs, but does not guarantee every QR handoff path | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |
| **Cards** | Four secure Elements are documented: `cardNumber`, `cardExpiry`, `cardCvv`, `cardHolder`. Payment options require the payable component to be complete; the docs explicitly require all four card components to be complete before `pay()` | Confirm cards, supported schemes, 3DS/issuer flow, domain whitelist, and the merchant's current card Element example | **Yes, for card flows.** Sandbox provides test card details and OTP guidance | **BLOCKED — SDK CAPABILITY NOT VERIFIED** |
| **Net Banking** | `netbanking` is a payable component requiring `values.netbankingBankName` with a Cashfree bank code/name; bank redirect may be required | Confirm enabled banks and exact merchant bank-code availability | **Yes, for the documented test net-banking bank**; production bank coverage still needs merchant confirmation | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |
| **Wallets** | `wallet` is a payable component requiring provider, button options, and a 10-digit customer phone; provider list is documented | Confirm which wallet providers are enabled for this merchant and whether the customer phone/issuer flow is supported | **No individual-provider proof.** Sandbox says only one generic test wallet exists and no individual provider is present | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |
| **API version** | Current Create Order and Get Order API references identify `2026-01-01` as the current `x-api-version`; the header is required | Confirm the merchant accepts `2026-01-01` and whether an upgrade from the repository default is approved | Mock/header tests are possible; a real compatibility check requires a non-production merchant sandbox request | **BLOCKED — MERCHANT CONFIRMATION REQUIRED** |

## Complete card contract: what is and is not verified

The public docs verify the following:

- Create and mount `cardNumber`, `cardExpiry`, `cardCvv`, and `cardHolder` as separate secure Cashfree components.
- Keep card data in Cashfree Elements; the server must not receive PAN/CVV/expiry values.
- Before `pay()`, check that the payable card component is complete with `component.isComplete()` and that `cardNumber`, `cardExpiry`, `cardCvv`, and `cardHolder` are all complete.
- Pass the ready payable component object as `paymentMethod`, along with the server-created `paymentSessionId`, `returnUrl`, and `redirect: 'if_required'` where appropriate.
- Use the Promise result only for provisional UI state and perform server-side status verification before confirming the booking.

The publicly accessible Markdown pages do not show a complete card-specific code block that unambiguously identifies which card component reference is passed as `paymentMethod` when the four fields are mounted. The official examples page links to a Cashfree CodePen card example, but the CodePen source was not accessible from this environment (HTTP 403). Therefore the exact card submission reference must be obtained from an accessible current Cashfree DevStudio/example or Cashfree merchant support before implementation. No `cashfree.pay()` card payload should be invented.

## UPI QR sequence

The current official component references verify this sequence:

```js
const upiQr = cashfree.create('upiQr', {
  values: { size: '220px' }
})
upiQr.on('loaderror', handleLoadError)
upiQr.mount('#mount-here')
upiQr.on('ready', handleReady)
```

The component reference marks `upiQr` payable. The payment-options page explicitly lists QR among the methods that may use `redirect: 'if_required'` and says the Promise can resolve with `paymentDetails` instead of redirecting. The implementation must therefore use the current documented QR example's exact order of readiness, explicit payment activation, and status reconciliation; the existing page's status polling alone is not sufficient evidence of the complete provider sequence.

## Browser, redirect, and cancellation behavior

- Cashfree describes custom checkout as supported in modern browsers, but `upiApp` has a stricter documented requirement: mobile phone, and not a custom Android WebView/in-app browser.
- PhonePe/Google Pay/Paytm may hand off to the selected app after explicit `pay()` activation. The initial selector remains VibeTogether-owned.
- Net-banking, card issuer, and wallet authentication may require redirects even with `redirect: 'if_required'`; the flag does not guarantee an embedded flow.
- `returnUrl` is a GET callback URL after a terminal provider state. It is not payment proof.
- The public SDK docs expose generic `result.error`, `result.redirect`, and `result.paymentDetails`, but do not document a stable cancellation code. Cancellation, timeout, and app dismissal must be treated as uncertain until the existing backend status/verification endpoint reconciles the Cashfree order.

## API-version verification without secret access

The repository was inspected without opening `.env`:

- [env.js](../../../backend/src/config/env.js:153) reads `CASHFREE_API_VERSION` and falls back to `2023-08-01`.
- [cashfreePayments.js](../../../backend/src/services/cashfreePayments.js:13) defines the same `2023-08-01` default.
- [server.js](../../../backend/src/server.js:47) passes the configured value into the Cashfree service.

The actual runtime override cannot be confirmed without reading the environment, which is intentionally out of scope. The current official Create Order and Get Order pages specify `2026-01-01` as the current API version. This is a compatibility decision requiring merchant confirmation; no change is authorized by this report.

## Merchant-dashboard confirmation checklist

Obtain non-secret confirmation from the Cashfree merchant dashboard/support for:

1. Cashfree Elements/custom web checkout enabled for the relevant sandbox and production merchant accounts.
2. Domain whitelist for the VibeTogether payment origin.
3. PhonePe, Google Pay, Paytm UPI intent enablement and supported mobile-browser/app behavior.
4. UPI QR enablement and expected QR `pay()`/status sequence.
5. Card schemes, card/3DS/issuer support, and the current card Element example.
6. Enabled net-banking bank codes and individual wallet providers.
7. Accepted `x-api-version`, specifically whether `2026-01-01` is supported for this merchant and whether changing from `2023-08-01` is required.
8. Return URL and webhook/notify URL registration requirements.

Public documentation cannot establish any of these account-level facts.

## Sandbox testability

| Scenario | Can be tested safely in sandbox? | Evidence/limit |
| --- | --- | --- |
| Card success/failure/incomplete | Yes | Public sandbox page provides test card data and OTP guidance; use synthetic booking only |
| Net-banking flow | Yes, limited | Public sandbox page provides a test bank; does not prove all production banks |
| UPI VPA/collect | Yes | Public sandbox page lists test VPAs; VPA collect is not the requested Other UPI experience |
| QR rendering and status | Partially | The Element and example are documented; complete QR payment behavior must be exercised with the merchant sandbox session |
| PhonePe/Google Pay/Paytm app intent | Not guaranteed by public sandbox docs | Requires a supported Android browser, installed app, enabled merchant method, and manual sandbox verification |
| Individual wallets | No public proof | Sandbox explicitly says only a generic test wallet is present; merchant-enabled individual wallets need separate testing |
| Webhook signature handling | Yes with fixtures/mocks | Existing repository tests can use synthetic signed raw payloads; no provider webhook delivery is required for unit verification |
| Production API compatibility | No | Must not be tested with production requests in this task; confirm via merchant dashboard/support or an authorized non-production compatibility test |

## Repository safety result

- Branch remains `main` at `234be78cc806d7e33abc9dbdafd452c210c62f01`.
- Existing Git changes remain preserved.
- Only this report is added by this verification task.
- No frontend, backend, Cashfree, Razorpay, MongoDB, `.env`, deployment, package, lockfile, or Android file was modified.
- No test command, build, payment order, production request, commit, push, or deployment was performed.

## Final disposition

**BLOCKED — SDK CAPABILITY NOT VERIFIED**

The required high-level Cashfree components and method identifiers are publicly documented, and Card/Net Banking/Wallet/QR/UPI component mechanics are sufficiently described to guide a future implementation. However, the complete card-specific `paymentMethod` submission contract is not explicitly available in the accessible official Markdown, the linked official card example could not be retrieved, and merchant-level enablement/API-version/app-handoff confirmation is still required. Implementation must not begin until those exact gates are resolved and the user separately authorizes website changes.

