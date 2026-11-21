---
status: investigating
trigger: "next payment page not working"
created: 2026-11-20
updated: "2026-11-20T06:05:59+05:30"
---

## Symptoms

- Expected: "return to home page error" (user-provided; unclear whether this describes expected behavior or the observed failure).
- Actual: The payment flow redirects to the home page and displays an error.
- Errors: Exact message not supplied.
- Timeline: Unknown.
- Reproduction: Unknown beyond the redirect to home with an error.
- Authorization: Diagnose only; no source edits authorized.
- Clarification: The only confirmed symptom is that the payment flow ends at home and an error is displayed. The earlier “Expected” wording was ambiguous; expected behavior is unknown. Exact message, timeline, and reproducible steps remain unknown.

## Current Focus

bug_class: unknown (not reproducible/classifiable from the available symptom)
hypothesis: Source contains several distinct error/failure states with user-initiated home links and a global error-boundary reset to `/`; no inspected payment-page code establishes an automatic redirect to home.
candidate_causes:
- code: The visible payment-failure/cancel screen may be followed by a user selecting its home link; a render exception may show the global error boundary, whose reset button reloads `/`.
- provider/config: The actual provider or backend return target may differ from the website-owned return URLs found in source; its runtime configuration was not inspected.
- data/state: A missing/invalid booking or payment result may produce the payment page's booking-load error state.
and_gate: unknown; the symptom does not identify whether an error state and a separate user/provider navigation condition both occurred.
test: Read-only text inspection only. No tests, builds, browser payment attempts, production access, API requests, or live transactions.
expecting: Determine whether source proves a specific redirect/error cause; otherwise document the exact missing user-observable details.
next_action: Obtain the exact displayed error, route/URL before and after the home transition (with identifiers/query values redacted), flow/provider used, and whether a Return Home control was selected.

## Evidence

- timestamp: 2026-11-20
  checked: `src/App.jsx` route tree and `src/components/common/AppErrorBoundary.jsx`
  found: `/booking/payment/:requestId` renders `BookingPayment` inside the application-wide error boundary (`App.jsx:44,60`). The boundary records a render error and displays a fallback; its `/` navigation is only in `handleReset`, called by the “Return to home” button (`AppErrorBoundary.jsx:10,18-22,25-45`).
  implication: A rendering exception can explain an error fallback, and selecting its reset button reloads home; source does not show that the boundary automatically redirects home.

- timestamp: 2026-11-20
  checked: `src/pages/BookingPayment.jsx` initial booking load and error rendering
  found: Rejection of the initial `getBookingEnquiry` request sets `bookingState.status` to `error` (`BookingPayment.jsx:316-354`). A failure of the optional `order_id` verification is caught locally and only sets `statusCheckFailed` (`BookingPayment.jsx:323-328`). The booking-load error state renders “We couldn’t load your booking,” the underlying error text, and a link to `/booking` (`BookingPayment.jsx:940-950`), not `/`.
  implication: A failed booking lookup is a possible source of the displayed error, but this path does not itself navigate home; a failed return verification follows a separate uncertain-payment path.

- timestamp: 2026-11-20
  checked: `src/pages/BookingPayment.jsx` failure/cancel states and home navigation
  found: Terminal payment failure renders “Payment Failed” with a “Return Home” link (`BookingPayment.jsx:870-878,1106-1118`); the cancelled/incomplete state has a separate “Return to home” link (`BookingPayment.jsx:880-885,1126-1165`). The success screen also has a homepage link (`BookingPayment.jsx:1101`). Search of this component found no `navigate('/')`, `window.location` home assignment, or other automatic home redirect.
  implication: Home is an explicit user-selectable destination from multiple payment states; seeing both home and an error does not distinguish a user-selected link from a separate redirect.

- timestamp: 2026-11-20
  checked: Website-owned checkout return URL source
  found: The Cashfree payment-page return URL points back to `/booking/payment/:requestId?order_id=...` (`BookingPayment.jsx:406-407,592-600`); the separate checkout flow sends `returnUrl` as `/booking/confirmation` (`services/paymentCheckout.js:77`) and then assigns the returned checkout URL (`pages/Booking.jsx:176`).
  implication: The inspected frontend return URLs do not target `/`. This does not establish what a provider/backend runtime configuration did for the reported occurrence.

- timestamp: 2026-11-20
  checked: Investigation constraints
  found: Only repository text was inspected. No tests/builds, payment flow, browser, API, production environment, or live transaction was used.
  implication: No runtime behavior or provider/backend redirect configuration has been verified.

## Resolution

root_cause: ""
fix: ""
verification: "Not performed; diagnose-only and runtime/payment verification explicitly prohibited."
files_changed: []
diagnosis: "Inconclusive. Source identifies plausible error and user-initiated home paths, but does not establish which path occurred or prove an automatic home redirect."
missing_information:
  - "Verbatim visible error text (or a screenshot with personal/payment data redacted)."
  - "The route/page immediately before and after the transition, with booking IDs and sensitive query values redacted."
  - "Which flow/provider was in use (the custom `/booking/payment/:requestId` page or the separate hosted checkout flow)."
  - "Whether the user selected a Return Home control, or home appeared without any such action."
  - "A minimal sequence of user actions and when the issue first began."
