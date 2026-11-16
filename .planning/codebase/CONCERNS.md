---
last_mapped_commit: dfd13358e4048e76e43d14d8b409d3eec824b005
last_mapped_at: 2026-11-16
---
﻿# Codebase Concerns

**Analysis Date:** 2026-11-16

## User-supplied performance context

- The performance numbers in `E:\club\docs\performance-baseline.md` are user-supplied Lighthouse observations captured before the latest changes. They are retained as context, but they are not independently reproduced by this repository audit and should be treated as unverified unless a fresh run is attached.
- The same baseline includes mobile LCP of 60.4 s, mobile Performance 73, desktop Performance 68, and a total payload of 16.5 MB. These metrics are not validated against the current repo state and are marked user-supplied.
- The repository evidence reviewed here is code-level only: route structure in `E:\club\src\App.jsx`, hero loading logic in `E:\club\src\pages\Home.jsx`, and the authentication / storage patterns in `E:\club\src\admin\services\adminApi.js` and `E:\club\src\utils\bookingStorage.js`.

## Tech Debt

**Home page performance debt:**
- Issue: the homepage hero is implemented as a four-slide carousel that assigns every slide image and its source set up front, then preloads the next slide in JavaScript. The logic in `E:\club\src\pages\Home.jsx` defines `heroBackgroundSlides` with four full-size variants and calls `preloadImage.srcset` / `preloadImage.src` before the next slide is actually needed.
- Files: `E:\club\src\pages\Home.jsx`
- Impact: it increases the chance of large image discovery, render delay, and main-thread cost before the user is actually interacting with the later slides. This aligns with the user-supplied LCP observations in `E:\club\docs\performance-baseline.md` that identify the first hero slide as the LCP candidate and point to large PNG payloads.
- Fix approach: gate image discovery behind viewport / LCP detection, keep only the current slide eager, and avoid loading subsequent slides until the browser actually needs them.

**Route/schema drift in the booking flow:**
- Issue: the route map in `E:\club\src\App.jsx` contains `booking/step-4/:requestId` but renders `<div aria-hidden="true" />` instead of a real page or step component. The path appears to be a stub, not a finished booking stage.
- Files: `E:\club\src\App.jsx`
- Impact: the booking experience has an incomplete route in the public navigation path, which makes the flow fragile and harder to reason about when backend responses or redirects vary.
- Fix approach: either implement the step or remove the route until the flow is supported, so the app does not expose a dead end.

**Client-side storage for booking records is treated as durable state:**
- Issue: `E:\club\src\utils\bookingStorage.js` stores booking data, references, counters, and attendee metadata in `localStorage`, including names, email, phone numbers, and ticket counts. The module describes this as a mock booking flow (`storageMode: 'device-mock'`) and persists it aggressively.
- Files: `E:\club\src\utils\bookingStorage.js`
- Impact: this creates a security and privacy concern because browser storage is readable by client-side script and not protected with server-side access controls or encryption. It also creates stale-data and data-integrity risk when multiple tabs or old versions read the same keys.
- Fix approach: keep only opaque identifiers client-side and move the canonical booking record back to a server-backed store, or explicitly scope the local-only mock flow to clearly ephemeral demo data.

**Admin auth and CSRF are stored in browser storage:**
- Issue: `E:\club\src\admin\services\adminApi.js` stores admin tokens and CSRF values in `localStorage` or `sessionStorage` via `saveStoredSession()`, and it also reads OAuth token values out of `window.location.hash` before cleaning the URL.
- Files: `E:\club\src\admin\services\adminApi.js`
- Impact: any XSS in the app or a compromised browser extension can access the token and csrf data. This is materially less secure than a server-managed, HttpOnly session cookie and makes the admin session dependent on client-side browser state.
- Fix approach: move admin session management to secure authenticated cookies and keep the browser only as a transport layer for non-sensitive session state.

**Backend dependency is spread across the frontend:**
- Issue: `E:\club\src\config\api.js` resolves the API base URL from env or a production fallback, while `E:\club\src\services\paymentCheckout.js` hard-fails when the booking backend is not configured. The public pages, booking pages, and admin flows all assume a live API is available.
- Files: `E:\club\src\config\api.js`, `E:\club\src\services\paymentCheckout.js`, `E:\club\src\services\bookingEnquiry.js`
- Impact: the app is fragile when the backend is offline or misconfigured, producing brittle user experiences that break on booking or admin actions without a clear fallback.
- Fix approach: define explicit feature flags and fail-safe UX so a missing backend is obvious and does not silently degrade.

## Known Bugs

**Booking and payment flows mix mock and real backends:**
- Symptoms: some paths use local mock data (`E:\club\src\utils\bookingStorage.js`), some use server-backed booking records (`E:\club\src\services\bookingRecords.js`), and others require an external payment backend (`E:\club\src\services\paymentCheckout.js`).
- Files: `E:\club\src\utils\bookingStorage.js`, `E:\club\src\services\bookingRecords.js`, `E:\club\src\services\paymentCheckout.js`
- Trigger: actions that rely on the backend are not guaranteed to be available in dev or in production; local validation in `E:\club\docs\performance-baseline.md` explicitly notes the backend was unavailable and booking/payment flows were not fully verified.
- Workaround: keep the application in a preview/mock mode only for demo-like flows, or carefully route every booking/payment status through a single canonical backend service.

**Public event cache can mask stale or bad data:**
- Symptoms: `E:\club\src\services\bookingEnquiry.js` caches public events in memory for 30 seconds and returns fresh copies from that cache, with no validation beyond a schema check.
- Files: `E:\club\src\services\bookingEnquiry.js`, `E:\club\src\hooks\usePublicEvents.js`
- Trigger: a transient API issue or a malformed event payload can populate the cache and then be reused across the app until TTL expires, making the UI appear stable while the data is stale.
- Workaround: add stronger cache invalidation, error state plumbing, and stale-while-revalidate guardrails.

## Security Considerations

**Admin session tokens are browser-accessible:**
- Risk: `E:\club\src\admin\services\adminApi.js` writes tokens and CSRF values to `localStorage` or `sessionStorage`, and the token is inserted into a bearer header on every call. If an attacker can run arbitrary JavaScript in the page, the same token can be exfiltrated.
- Files: `E:\club\src\admin\services\adminApi.js`
- Current mitigation: the code strips OAuth-minted tokens from URL hash fragments and caches them in memory, but the app still relies on browser storage for persistence.
- Recommendations: prefer server-issued HttpOnly, SameSite cookies for authenticated admin sessions, and keep any client-side copy of the token limited to a short-lived in-memory value only.

**Booking data persists in client storage with personal details:**
- Risk: `E:\club\src\utils\bookingStorage.js` stores attendee names, emails, phone numbers, booking references, and ticket counts in `localStorage` under predictable keys. This is convenient for demos but increases privacy exposure for any XSS or browser compromise.
- Files: `E:\club\src\utils\bookingStorage.js`
- Current mitigation: the code validates the parsed shape and restricts storage keys, but it does not add encryption, expiry, or server enforcement.
- Recommendations: store a minimal opaque ID in the browser and fetch the booking record from a protected backend when needed.

**Environment-driven external API configuration is permissive:**
- Risk: `E:\club\src\config\booking.js` validates `VITE_BOOKING_API_URL`, but the approach still allows same-origin or localhost values and makes the booking/payment flow dependent on env correctness. `E:\club\src\services\contactSubmission.js` also allows the contact API endpoint to be configured externally and then sends payloads to it directly.
- Files: `E:\club\src\config\booking.js`, `E:\club\src\services\contactSubmission.js`
- Current mitigation: the validator checks scheme, host, and query/hash safeguards.
- Recommendations: maintain an explicit allowlist of permitted backends and reject configuration drift in CI before deploys.

## Performance Bottlenecks

**Hero image discovery and LCP risk:**
- Problem: the homepage hero is the primary LCP candidate in the user-supplied audit reported in `E:\club\docs\performance-baseline.md`. The repository code in `E:\club\src\pages\Home.jsx` shows it eagerly loads a four-image slide set with `srcSet`, `src`, and `Image()` preloading logic.
- Files: `E:\club\src\pages\Home.jsx`, `E:\club\src\components\home\HomeCategoriesSection.jsx`
- Cause: large hero image payloads, eager assignment of all slide URLs, and additional animation work on the main thread all stack against the critical rendering path.
- Improvement path: only prefetch the first true LCP image, size the image to the rendered viewport, and defer visual effects or carousel transitions until after the main content is painted.

**Main-thread work still appears expensive:**
- Problem: the user-supplied baseline mentions high LCP and long tasks, and the repo contains several heavy UI modules and media libraries in the homepage path, including `@lottiefiles/dotlottie-react` imported lazily in `E:\club\src\pages\Home.jsx` and a large home-page script loaded through the route shell.
- Files: `E:\club\src\pages\Home.jsx`, `E:\club\src\App.jsx`
- Cause: large gallery, animation, and hero-related modules are concentrated on the first viewport; browser main-thread work does not have a clear source attribution in the baseline, so the issue remains hard to isolate.
- Improvement path: split non-critical animations and below-the-fold sections into later routes or lazy chunks, and add performance budgets to prevent large hero assets from regressing again.

**Loading strategy is still inconsistent across page types:**
- Problem: `E:\club\src\App.jsx` uses `React.lazy` heavily for routes, but the home page still primes heavy hero sources and related UI immediately. Some other pages are route-lazy, but the critical home path is loaded as part of the first render.
- Files: `E:\club\src\App.jsx`, `E:\club\src\pages\Home.jsx`
- Cause: the app has route-level laziness, but not strict critical-path gating at the component level.
- Improvement path: enforce a critical-path budget and add automated Lighthouse or bundle checks to the CI pipeline for landing pages.

## Fragile Areas

**Admin workspace and auth state are tightly coupled to browser storage:**
- Files: `E:\club\src\admin\services\adminApi.js`, `E:\club\src\admin\pages\AdminLoginPage.jsx`, `E:\club\src\admin\components\AdminLayout.jsx`
- Why fragile: token persistence, redirect handling, and session validation all depend on client-side browser state and external auth service health.
- Safe modification: centralize auth state transitions; keep a single session-authority path and avoid multiple token stores.
- Test coverage: no explicit repository coverage for auth callback parsing, token expiry, or refresh flow was identified.

**Booking and payment logic spans multiple state sources:**
- Files: `E:\club\src\utils\bookingStorage.js`, `E:\club\src\services\paymentCheckout.js`, `E:\club\src\services\bookingRecords.js`, `E:\club\src\pages\BookingPayment.jsx`
- Why fragile: mock booking state, server-backed booking records, and payment verification all overlap, but the app does not appear to enforce one canonical state model.
- Safe modification: define a single booking record schema and a single state transition pipeline from draft -> pending -> verified -> cancelled.
- Test coverage: not enough repository evidence of full end-to-end coverage for the booking/payment path.

**Public event data is shared across multiple consumers:**
- Files: `E:\club\src\services\bookingEnquiry.js`, `E:\club\src\hooks\usePublicEvents.js`, `E:\club\src\pages\Home.jsx`, `E:\club\src\pages\Events.jsx`
- Why fragile: each consumer depends on the same API contract and the same in-memory cache, without a clear invalidation strategy or fallback for API downtime.
- Safe modification: make cache invalidation and empty/error states explicit, and keep data transformations centralized.
- Test coverage: no repository evidence of comprehensive failover behavior in the event fetch path.

## Missing Critical Features / Coverage Gaps

**No verified end-to-end payment or booking confirmation flow:**
- Problem: the repo contains booking/payment logic and admin flows, but the user-supplied audit notes that the backend was unavailable and real booking, payment, QR, and admin routes were not fully verified.
- Files: `E:\club\src\services\paymentCheckout.js`, `E:\club\src\utils\bookingStorage.js`, `E:\club\src\admin\services\adminApi.js`
- Risk: real-world transactions and admin action verification can silently fail in production without a stable regression gate.
- Priority: High

**No automated performance regression guard:**
- Problem: `E:\club\package.json` includes `build`, `lint`, and `test` scripts but no Lighthouse, bundle-size, or performance budget gate. The user-supplied baseline and local preview metrics show meaningful variability and large payloads, but there is no enforced check in the repo to stop a regression before deployment.
- Files: `E:\club\package.json`
- Risk: performance issues can reappear unnoticed because the repo has no threshold-based monitoring or CI gate.
- Priority: High

**No proven admin auth failure-mode coverage:**
- Problem: the admin login page handles several auth and OAuth error states, but the repository does not show a comprehensive test matrix for expired tokens, invalid CSRF, failed Google callbacks, or denied users.
- Files: `E:\club\src\admin\pages\AdminLoginPage.jsx`, `E:\club\src\admin\services\adminApi.js`
- Risk: production admin access becomes brittle under edge conditions and provider outages.
- Priority: Medium

---

*Concerns audit: 2026-11-16*
