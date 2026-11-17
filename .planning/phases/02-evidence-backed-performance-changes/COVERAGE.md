# API Coverage — Cashfree Elements and Existing Payment Contracts

> Full coverage by default. Opt-outs are explicit, reasoned decisions. This is the Phase 2 API/SDK coverage decision; `INTEGRATE` does not assume merchant enablement. Required-method capability and sandbox enablement are a blocking pre-implementation verification in plan 02-02.

| capability | decision | reason |
|---|---|---|
| Lazy-load and initialize the Cashfree browser SDK in the website payment flow | INTEGRATE | |
| Cashfree Element create/mount/readiness/error/unmount lifecycle | INTEGRATE | |
| PhonePe UPI app Element using documented ID `phonepe` | INTEGRATE | |
| Google Pay UPI app Element using documented ID `gpay` | INTEGRATE | |
| Paytm UPI app Element using documented ID `paytm` | INTEGRATE | |
| Other UPI through the in-page `upiQr` Element | INTEGRATE | |
| Card Elements: card number, expiry, CVV, and cardholder | INTEGRATE | |
| Net Banking Element and selection of each merchant-enabled supported bank | INTEGRATE | |
| A separate Element choice for each Cashfree-supported, merchant-enabled wallet | INTEGRATE | |
| Submit selected Element with existing session via `cashfree.pay` | INTEGRATE | |
| Required post-selection UPI-app, bank, or issuer authentication handoff | INTEGRATE | Allowed only after explicit user activation; do not promise every authentication step remains embedded. |
| Server-created order/session with booking-bound server-calculated amount | INTEGRATE | Preserve the current backend contract. |
| Existing Cashfree order retrieval and server-side payment verification | INTEGRATE | Browser SDK results are provisional, never proof of payment. |
| Existing Cashfree payment status and failure-recording endpoints | INTEGRATE | Preserve pending, failed, canceled, and retry behavior. |
| Existing raw-body signed Cashfree webhook verification and processing | INTEGRATE | Preserve signature verification, idempotency, and backend authority. |
| Existing booking/payment-order persistence touchpoints | INTEGRATE | Preserve current fields and behavior; no schema change. |
| Current `CASHFREE_API_VERSION`/merchant API compatibility | INTEGRATE | Verify the existing value with the merchant before implementation; do not change backend configuration under this phase. |
| VPA collect for “Other UPI” | OPT-OUT | Explicitly out of scope; “Other UPI” is the Cashfree-supported UPI app/QR flow, not collect. |
| Hosted modal, default redirect, generic checkout, or fallback surface | OPT-OUT | Explicitly out of scope; the selected method must use its corresponding in-page Element. |
| Saved-card storage, card tokenization, or reusable-card management | OPT-OUT | Not required for the selected-method checkout and introduces a separate data/consent surface. |
| Refunds and payment reversals initiated by this UI | OPT-OUT | Not needed for the website payment-initiation scope; preserve existing backend rules. |
| Settlements, payouts, and merchant balance operations | OPT-OUT | Explicitly out of scope for customer checkout. |
| Subscriptions and recurring payments | OPT-OUT | Not needed for the booking's one-time payment flow. |
| Cashfree payment links or a separate hosted payment page | OPT-OUT | Explicitly out of scope; preserve the existing booking-bound Elements flow. |

## Blocking verification rule

Before any Cashfree UI implementation, plan 02-02 must verify the official Elements capability and the merchant's sandbox enablement/behavior for PhonePe, Google Pay, Paytm, Other UPI QR, Cards, Net Banking, and each enabled wallet. If a required method is unsupported or unverified, execution stops for blocking review; the method is not silently removed, relabeled, or sent to hosted checkout. No production transaction, production setting change, API-version change, backend payment-rule change, schema change, or Razorpay removal is authorized.
