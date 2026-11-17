---
phase: "02"
slug: "evidence-backed-performance-changes"
status: approved
shadcn_initialized: false
preset: none
created: "2026-11-18"
---

# Phase 02 — UI Design Contract

> Visual and interaction contract for Phase 2. Preserve VibeTogether’s current payment-page identity; this contract does not authorize implementation.

## Design System

| Property | Value |
|----------|-------|
| Tool | none — hand-authored CSS and tokens; no `components.json` |
| Preset | not applicable |
| Component library | Existing React page/components and CSS; no installed component system |
| Icon library | `lucide-react` 1.69.0 |
| Font | Existing Inter body, Space Grotesk headings, Syne display |

Use the existing `.booking-payment` page shell, progress stepper, two-column booking summary/payment cards, dark cinematic gradients, glass surfaces, rounded outlines, and purple/violet glow. Extend the existing class/token patterns in `src/pages/BookingPayment.css` and `src/styles/theme.css`; do not introduce a new visual system, hosted-checkout surface, or component registry.

## Primary Visual Anchor and Hierarchy

The primary visual anchor is the existing payment card’s active, selected-method surface, with the payable amount and that method’s primary action presented as one checkout focus. Keep it in the current payment column; for QR, the inline QR surface is the active-method focal point. Preserve the existing glass/gradient styling and do not add a page, modal, or new checkout surface.

Hierarchy within the existing page:
1. Payable amount and primary action for the currently selected method.
2. Active method surface and selected method choice; keep inline instructions, validation, and status adjacent to that surface.
3. Booking summary and trust treatment as supporting information.
4. Brand header and progress stepper as orientation, not competing focal points.

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label gaps |
| sm | 8px | Compact control gaps |
| md | 16px | Default control/panel spacing |
| lg | 24px | Card and section spacing |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major content separation |
| 3xl | 64px | Page-level separation |

Exceptions: preserve existing fluid page gutters/card padding and existing 12px/20px micro-spacing where already used; interactive targets remain at least 44px high, as in the current global CSS.

## Typography

For payment selector and active-method content, use these four sizes and two weights. Keep the existing responsive clamp behavior for the page hero and ticket-success typography.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Helper / method metadata | 12px | 400 | 1.4 |
| Body / method description | 14px | 400 | 1.5 |
| Method name / form label | 16px | 700 | 1.4 |
| Panel heading | 20px | 700 | 1.2 |

Font families remain Inter for body, Space Grotesk for headings, and Syne for display. Do not restyle the existing booking summary or paid-ticket display.

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#07040F` (`--bp-bg-deep`) | Payment page background and negative space |
| Secondary (30%) | `rgba(19, 10, 36, 0.78)` (`--bp-bg-card`) and `rgba(28, 14, 54, 0.55)` | Existing glass cards, method detail panel, booking summary |
| Accent (10%) | `#9D4EDD` → `#C77DFF` | Selected method outline/fill, keyboard focus, primary payment action, active-step emphasis |
| Destructive / error semantic | Existing `#F87171` / `#FCA5A5` | Error and failed-payment status only; no destructive actions are introduced |

Accent reserved for: selected payment-method state, visible keyboard focus, the current payment step, and the primary payment/verification CTA. Keep method-provider logos in their recognizable brand colors only; do not use brand colors as general page accents. Retain the existing green success and amber pending/status treatments.

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | Use the selected method’s exact label in the CTA table below; for QR, `I’ve paid — check status` |
| Empty state heading | `Choose a payment method` |
| Empty state body | `Select a method to view its secure payment fields. Your booking details are saved.` |
| Error state | `We couldn’t load this payment method. Retry loading it or choose another method; your booking remains saved.` |
| Destructive confirmation | None — payment selection has no destructive action. Canceling an app/bank/issuer handoff is non-destructive and must not require a confirmation dialog. |

Use these exact primary, in-progress, and retry CTA labels for the selected method. Substitute the server-calculated payable amount and the verified selected bank or wallet name where shown.

| Method | Primary CTA | In-progress CTA | Retry CTA |
|--------|-------------|-----------------|-----------|
| PhonePe | `Pay ₹{amount} with PhonePe` | `Opening PhonePe…` | `Retry with PhonePe` |
| Google Pay | `Pay ₹{amount} with Google Pay` | `Opening Google Pay…` | `Retry with Google Pay` |
| Paytm | `Pay ₹{amount} with Paytm` | `Opening Paytm…` | `Retry with Paytm` |
| Other UPI (QR) | `I’ve paid — check status` | `Checking payment status…` | `Check payment status again` |
| Cards | `Pay ₹{amount} by card` | `Processing card payment…` | `Retry card payment` |
| Net Banking | `Continue to {bank name}` | `Connecting to {bank name}…` | `Retry with {bank name}` |
| Supported wallet | `Pay ₹{amount} with {wallet name}` | `Connecting to {wallet name}…` | `Retry with {wallet name}` |

For charging methods, show the retry CTA only after a definitive non-paid result or a canceled handoff. While payment status is pending or uncertain, keep charging disabled and use `Recheck Status`; the QR status-check CTA only checks status and does not initiate another charge.

Use existing concise status language for loading, pending, cancellation, retry, and paid outcomes below. Do not claim payment success from a browser SDK callback.

## UI Considerations

Applicable state considerations resolved: 29 explicit, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Method selector, selected payment fields, QR surface, booking summary | ✅ covered | With no selection, show the Copywriting Contract's empty state. If no supported methods exist, show an unavailable state and stop for owner review; never silently omit methods or substitute hosted checkout. |
| loading | Method selector, active Cashfree Element, QR surface, payment actions/status, booking summary | ✅ covered | Keep the page in place and show the inline loading status/spinner while booking, order, SDK, or selected Element loads; disable submission until ready and retain the established booking-loading state. |
| error | Method selector, active payment fields, QR surface, payment actions/status, booking summary | ✅ covered | Show an inline actionable, method-specific error and retry/alternative path; preserve booking details and never fall back to hosted checkout. |
| populated | Method selector, QR surface, booking summary | ✅ covered | Show only verified-supported choices, the selected method's matching Element, and the existing booking/pricing details. |
| partial | Method selector, active payment fields, booking summary | ✅ covered | Keep incomplete Card Elements validation beside their fields; do not enable submission until Cashfree's required components are complete or expose raw card data to VibeTogether. |
| overflow | Method selector, payment actions/status, booking summary | ✅ covered | Wrap choices and booking/status text; constrain QR/Element mounts to the panel; prevent horizontal page scrolling and clipped controls. |
| zero-one-many | Method selector, booking summary | ✅ covered | Zero methods shows unavailable state and owner-review gate; one method remains clear and full-width; multiple methods wrap without hiding supported choices. |
| long-text | Method selector, active payment fields, payment actions/status, booking summary | ✅ covered | Wrap complete labels, instructions, booking values, and errors; do not ellipsize critical payment or retry guidance. |

Coverage was generated from five confirmed UI surfaces: the method list/control, active payment form, QR media, payment actions/status, and booking summary. All 29 applicable probe rows are explicitly resolved by this contract.

## Payment UI Interaction Contract

### Page and selection

- Preserve the existing VibeTogether payment route, brand header, five-step booking tracker, pricing ledger, booking details, trust treatment, and success-ticket presentation. Do not redesign surrounding booking content.
- Default the visual selection to the existing `Other UPI` QR choice if no prior selection exists. Selection alone must not open a payment window, start an app handoff, or submit a payment.
- Present separate branded choices for **PhonePe**, **Google Pay**, **Paytm**, **Other UPI (QR)**, and **Cards**. Each selection visibly marks the selected control and reveals only its corresponding active-method panel.
- **Net Banking** and individual Cashfree-supported **wallets** are additional choices only after Elements support and merchant-account enablement are confirmed. Build the bank/wallet list from the verified supported options, not an assumed fixed list. Unsupported capability is a pre-implementation review gate; do not silently remove it, represent it as available, or route it through hosted checkout.
- Keep keyboard focus visible, selection programmatically exposed, and all selector/payment controls keyboard operable. Preserve the existing minimum 44px touch target.

### Active method surfaces

| Selection | Active surface and behavior |
|-----------|-----------------------------|
| PhonePe | Mount the Cashfree PhonePe `upiApp` Element using documented ID `phonepe` after merchant enablement and sandbox behavior are verified. Launch/handoff only after the customer activates the pay action. No VPA/collect field. |
| Google Pay | Mount the Cashfree Google Pay `upiApp` Element using ID `gpay` after enablement and sandbox verification. Launch/handoff only after explicit pay action. No VPA/collect field. |
| Paytm | Mount the Cashfree Paytm `upiApp` Element using ID `paytm` after enablement and sandbox verification. Launch/handoff only after explicit pay action. No VPA/collect field. |
| Other UPI (QR) | Mount the Cashfree `upiQr` Element inline, with scan instructions and the server-calculated payable amount. This is the QR route for other UPI apps; do not expose VPA collect or an all-methods selector. Provide `I’ve paid — check status` and pending/status feedback. |
| Cards | Mount Cashfree Elements for card number, expiry, CVV, and cardholder. Keep card entry and card data within Cashfree Elements; never copy raw card data into React state, VibeTogether-owned inputs, logs, or the backend. Submit only the selected Card Element. |
| Net Banking | Mount the corresponding Cashfree Net Banking Element and allow a bank choice among verified enabled banks. The user-initiated submit may hand off to the selected bank for authentication. |
| Supported wallets | Show a separate branded option for each verified Cashfree Element wallet enabled for this merchant. Submit only that selected wallet Element; any required issuer handoff occurs after explicit user action. |

The currently selected method must be the one mounted and submitted. No initial/default Cashfree hosted checkout page or modal, generic “all methods” modal, or modal fallback is allowed. A UPI app, bank, or card-issuer authentication handoff is allowed only after method selection and explicit user activation; do not promise that authentication remains embedded. Keep Razorpay’s existing independent fallback behavior unchanged.

Load the Cashfree browser SDK only when the website payment flow needs it; do not add it to public-page startup. Preserve existing server-created orders and server-calculated amounts, payment verification/status endpoints, signed webhook authority, booking state, and payment persistence. Browser SDK results are provisional UI signals, never proof of payment.

### Lifecycle, cancellation, retry, and outcome states

| State | Required visual/interaction contract |
|-------|---------------------------------------|
| Booking loading | Retain the current loading card and `Retrieving Booking Dossier` status until booking details are available. |
| Order / SDK / Element loading | Keep the page in place; show an inline spinner and `Preparing secure payment elements…`. Do not show a blank panel or hosted checkout surface. Disable submit until the selected Element is ready. |
| SDK or Element error | Show an inline alert with the method-specific problem and retry path. Preserve the current booking and selection; allow retrying Element setup or choosing another method. Do not fallback to a hosted page/modal. |
| Incomplete method data | Keep Cashfree Elements’ validation close to its fields and do not submit while required Element fields are incomplete/invalid. VibeTogether must not receive raw card values. |
| Submitting / handoff | Change the selected method’s CTA to its exact method-specific in-progress label in the Copywriting Contract, disable repeat submission, and allow only the handoff required by that method. Return to the same booking/payment context after an external handoff. |
| User cancels handoff | Treat cancellation as non-destructive: retain the booking and selected method, restore the actionable payment state, and allow retry or method change. Do not mark the booking failed solely because a handoff was dismissed. If outcome is uncertain, check server status before enabling another charge attempt. |
| Pending / uncertain | Show `Payment confirmation is pending. Check status before retrying.` with a `Recheck Status` action and its in-progress label `Checking payment status…`. Keep the booking intact and block duplicate payment while status is uncertain. Do not show the paid ticket until server confirmation. |
| Failed | Show `Payment was not completed. Retry or choose another payment method.` Keep the booking and amount summary, provide the selected method’s exact retry CTA from the Copywriting Contract and method selection, and avoid a destructive confirmation dialog. |
| Paid | Show the existing VibeTogether verified-success/ticket state only after authoritative server verification/status reports paid. Preserve booking reference, paid amount, ticket QR, and the existing full-ticket/home actions. |

## Responsive and Platform Contract

- Retain the existing two-column booking-details/payment layout on wide screens and its single-column stack at the current `1024px` breakpoint. Keep all method controls and the payable amount legible in both arrangements.
- Preserve mobile spacing, compact payment-stepper badge, wrapping method choices, and full-width payment actions. Prevent QR/Element panels, card fields, bank/wallet choices, and long labels from exceeding the viewport.
- Validate the website at 360, 375, 390, 412, and 430 CSS-pixel widths and at desktop as required by the phase; Android mobile browsers are in scope.
- Native Android application code and behavior are out of scope. On web Android, verify app availability/cancellation and allowed handoff behavior; do not assume custom Android WebView behavior.
- Continue respecting the existing `prefers-reduced-motion` rules. Do not add a new animation language to the payment surface.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None — no shadcn initialization or third-party registry use | None | Not applicable |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved 2026-11-18
