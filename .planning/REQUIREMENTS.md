# Requirements: VibeTogether Mobile Performance Optimization and Website Cashfree UI

**Defined:** 2026-11-16
**Core Value:** Make the mobile experience measurably faster while preserving the existing design and reliable event discovery, booking, payment, ticket, notification, and account flows.

## v1 Requirements

### LCP and Image Delivery

- [ ] **LCP-01**: Before implementation, the developer can identify the mobile LCP element and its resource, rendered dimensions, loading priority, request timing, LCP phase breakdown, and network dependency chain from a current trace.
- [ ] **LCP-02**: The actual critical LCP resource is not lazy-loaded; any preload or high fetch priority applies only to that verified resource and is justified by the trace.
- [ ] **IMG-01**: Image changes address assets identified by the current audit, use suitable responsive dimensions and formats where beneficial, preserve visual quality, and reserve layout space with intrinsic dimensions or aspect ratio.
- [ ] **IMG-02**: Below-the-fold images are lazy-loaded where appropriate, and carousel images that are not immediately needed are not all preloaded.

### Critical Path and Main Thread

- [ ] **PATH-01**: CSS and JavaScript requests responsible for the reported render-blocking delay are identified; defer or remove non-critical requests only when evidence supports it, inline only genuinely critical CSS, and preserve fonts, appearance, and behavior.
- [ ] **ANIM-01**: The reported non-composited animations and long main-thread tasks are investigated; optimize only measured causes, prefer transform/opacity where appropriate, reduce unnecessary mobile motion, preserve important animation, and respect `prefers-reduced-motion`.
- [ ] **JS-01**: DOM size, unused JavaScript, and long tasks are investigated with profiling or trace evidence; remove, defer, or split code only after confirming its use and effect, and do not load unnecessary admin code on public pages.

### Website Cashfree Checkout UI

- [ ] **CFUI-01**: The website presents separate branded choices for PhonePe, Google Pay, Paytm, Other UPI (QR), and Cards. "Other UPI" uses Cashfree-supported UPI app/QR flows, not VPA collect.
- [ ] **CFUI-02**: Existing Net Banking and Cashfree-supported wallet choices remain available as additional branded methods when Elements and the merchant account support them. If a method is unsupported, surface that limitation for review; do not silently remove it or fall back to hosted checkout.
- [ ] **CFUI-03**: A user's selection mounts/starts the corresponding Cashfree Element in the VibeTogether page. No initial/default hosted checkout redirect or modal is used. A UPI-app, bank, or issuer handoff after explicit method selection is allowed when required; do not promise that all authentication remains embedded.

### Secure Payment and Compatibility

- [ ] **CFSEC-01**: Cashfree orders, payment sessions, and payable amounts continue to be created by the existing backend using the booking-bound, server-calculated amount; Cashfree secrets remain server-side.
- [ ] **CFSEC-02**: The browser's Elements result is not treated as proof of payment. Payment confirmation continues through existing server-side Cashfree verification and the signature-verified webhook path, preserving idempotency and pending/failed handling.
- [ ] **CFCOMP-01**: The existing booking/payment state, Cashfree backend contracts, MongoDB schema, and Razorpay fallback remain intact; no schema or unrelated payment-business-rule changes are introduced.
- [ ] **CFPLAT-01**: Changes are limited to the website; native Android code remains unchanged. The website experience in Android browsers is in scope.

### Regression Protection and Verification

- [ ] **REG-01**: Performance changes preserve existing routes and APIs, responsive design, booking and ticket generation, Cashfree and Razorpay payment flows and verification, payment webhooks, QR codes, WhatsApp notifications, login, and admin authentication.
- [ ] **TEST-01**: The production build and relevant tests pass, and representative navigation, booking, checkout, and ticket journeys are checked; any backend or environment limitation is reported rather than treated as a pass.
- [ ] **VIEW-01**: The site is inspected at mobile viewport widths 360, 375, 390, 412, and 430 pixels and at a desktop viewport without layout or interaction regressions.
- [ ] **LH-01**: A new mobile Lighthouse 13.6 run uses conditions comparable to the supplied baseline and reports all available before/after metrics; no target is claimed without that run.
- [ ] **LH-02**: The intended targets are Performance 95+, LCP <=2.5 s, FCP <=1.8 s, TBT <=200 ms, and CLS <=0.1; results that miss a target are reported accurately.

## v2 Requirements

(None identified. Additional work remains out of scope unless new evidence or user direction justifies it.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Changes to backend payment business rules, booking rules, Cashfree webhook verification, MongoDB schemas, or Razorpay removal | The Phase 2 request is for the website UI; existing secure backend behavior and data integrity remain protected. |
| Hosted Cashfree checkout as the initial/default method surface | The requested experience is a branded website UI; required post-selection app/bank/issuer authentication handoffs remain allowed. |
| Redesign, unrelated feature removal, or route/API changes | Preserve the existing user experience and contracts. |
| Broad refactoring, dependency removal, or code cleanup without measured evidence | Every performance change must address a verified bottleneck. |
| Production deployment or implementation before separate explicit user authorization | This task prepares the plan only; deployment was not requested. |
| Claims that a performance target has been met without a new comparable Lighthouse run | Score changes and target achievement must be backed by fresh measurements. |

## Definition of Done

- The critical LCP element and material bottlenecks are documented from current evidence.
- Only evidence-backed, in-scope changes are implemented.
- The website uses the selected Cashfree Elements UI while keeping order creation and payment confirmation server-authoritative; Razorpay and native Android remain unchanged.
- Build and relevant tests pass; viewport and protected-flow checks are recorded, including any environment-blocked checks.
- A comparable Lighthouse run is recorded with actual results and no unsupported performance claims.
- No payment logic or database schema changes are made.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LCP-01 | Phase 1 | Pending |
| LCP-02 | Phase 2 | Pending |
| IMG-01 | Phase 2 | Pending |
| IMG-02 | Phase 2 | Pending |
| PATH-01 | Phase 2 | Pending |
| ANIM-01 | Phase 2 | Pending |
| JS-01 | Phase 2 | Pending |
| CFUI-01 | Phase 2 | Pending |
| CFUI-02 | Phase 2 | Pending |
| CFUI-03 | Phase 2 | Pending |
| CFSEC-01 | Phase 2 | Pending |
| CFSEC-02 | Phase 2 | Pending |
| CFCOMP-01 | Phase 2 | Pending |
| CFPLAT-01 | Phase 2 | Pending |
| REG-01 | Phase 3 | Pending |
| TEST-01 | Phase 3 | Pending |
| VIEW-01 | Phase 3 | Pending |
| LH-01 | Phase 3 | Pending |
| LH-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-11-16*
*Last updated: 2026-11-18 after Phase 2 scope clarification*
