# Roadmap: VibeTogether Mobile Performance Optimization

## Overview

This MVP is an audit-first mobile optimization of the existing VibeTogether site, combined in Phase 2 with the user-requested website-only Cashfree custom payment UI. It begins with a comparable mobile Lighthouse baseline, then addresses only measured bottlenecks and plans the custom payment interface around Cashfree Elements and the existing server-side order/verification paths. Preserve the existing design and protected booking, payment, ticket, notification, account, and admin behavior; do not change backend payment business rules, webhooks, or database schemas. Phase 2 remains planning-only until the user separately authorizes implementation. Performance targets are goals to measure, not promised outcomes.

## Phases

- [x] **Phase 1: Mobile Baseline & Evidence Audit** - Reproduce a comparable mobile baseline and document LCP and relevant diagnostic evidence before any implementation. *(Complete; Plan 01)*
- [ ] **Phase 2: Evidence-Backed Performance Changes** - Plan evidence-backed mobile improvements and the website-only Cashfree Elements UI while preserving existing backend payment behavior.
- [ ] **Phase 3: Regression & Comparable Verification** - Validate build, tests, protected journeys, viewports, and final Lighthouse results.

## Phase Details

### Phase 1: Mobile Baseline & Evidence Audit
**Goal**: A reproducible mobile baseline and current trace make the actual LCP path and measured performance evidence clear before code changes begin.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: LCP-01
**Success Criteria** (what must be TRUE):
  1. A Lighthouse 13.6 mobile baseline and trace are captured with run conditions documented against the supplied Moto G Power / Slow 4G context; any material differences or run variability are called out.
  2. The trace identifies the actual LCP element and resource, rendered dimensions, loading priority, request timing, LCP phase breakdown, and network dependency chain.
  3. The audit records the actual render-blocking requests, relevant image evidence, non-composited animation and long-task evidence, and DOM/JavaScript evidence, distinguishing measured causes from hypotheses so implementation can be scoped from findings.
**Plans**: 1 (`01-PLAN.md`)

### Phase 2: Evidence-Backed Performance Changes
**Goal**: The website has a detailed, implementation-ready plan for evidence-backed mobile improvements and a branded Cashfree Elements checkout, with existing backend payment behavior and visual design preserved.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LCP-02, IMG-01, IMG-02, PATH-01, ANIM-01, JS-01, CFUI-01, CFUI-02, CFUI-03, CFSEC-01, CFSEC-02, CFCOMP-01, CFPLAT-01
**Success Criteria** (what must be TRUE):
  1. The verified LCP resource is not lazy-loaded; any preload or high fetch priority is limited to that resource and justified by the trace.
  2. Audited image issues are addressed with suitable responsive sizes/formats and reserved layout space; below-the-fold loading is appropriate and unneeded carousel slides are not all preloaded.
  3. Render-blocking changes target only requests shown to delay rendering, while fonts, appearance, and behavior remain intact.
  4. Animation, long-task, DOM, or JavaScript changes address only measured causes; important motion remains, reduced-motion preferences are respected, and unnecessary admin code is not added to public-page loads.
  5. The website payment selector offers PhonePe, Google Pay, Paytm, Other UPI via QR, Cards, and additional Net Banking / Cashfree-supported wallet options where Cashfree Elements and the merchant account support them; unsupported methods are surfaced for review, not silently removed or routed to hosted checkout.
  6. The selected payment method uses its corresponding Cashfree Element in the VibeTogether page. No initial/default Cashfree hosted checkout page or modal opens; a user-selected payment may hand off to a UPI app, bank, or issuer when required.
  7. Cashfree order creation, pricing, authoritative verification, webhook validation, booking persistence, and payment state continue through the existing secure backend contracts; no database schema change or Razorpay removal is planned.
  8. Native Android code remains untouched; the website's mobile-browser experience, including Android browsers, may change.
  9. Implementation remains blocked until the user separately authorizes it. Any performance or payment success claim is backed by comparable validation evidence.
**Plans**: 6 (`02-01-PLAN.md` through `02-06-PLAN.md`)
**Execution waves**:
- Wave 1: `02-01` — explicit authorization gate.
- Wave 2: `02-02` — current performance evidence and Cashfree capability review.
- Wave 3: `02-03` — PhonePe tracer, approval checkpoint, then method expansion.
- Wave 4: `02-04` and `02-05` — payment-state/presentation work and evidence-backed performance changes.
- Wave 5: `02-06` — regression validation and three sequential comparable Lighthouse runs.
**UI hint**: yes

### Phase 3: Regression & Comparable Verification
**Goal**: The optimized site is verified across the required viewports and available user journeys, with actual before/after performance results reported accurately.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: REG-01, TEST-01, VIEW-01, LH-01, LH-02
**Success Criteria** (what must be TRUE):
  1. The production build and relevant tests pass; representative navigation, booking, checkout, and ticket journeys are checked, and any unavailable backend/service checks are reported as blocked rather than passed.
  2. Existing routes/APIs, responsive design, booking and ticket generation, Cashfree/Razorpay flows and verification, webhooks, QR codes, WhatsApp notifications, login, and admin authentication have no regression in checks available for the environment.
  3. The site has been inspected at 360, 375, 390, 412, and 430 px and at a desktop viewport without layout or interaction regressions.
  4. A comparable Lighthouse 13.6 mobile run records available before/after metrics; Performance 95+, LCP ≤2.5 s, FCP ≤1.8 s, TBT ≤200 ms, and CLS ≤0.1 are reported as targets, with misses stated plainly.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Mobile Baseline & Evidence Audit | 1/1 | Complete | 2026-11-17 |
| 2. Evidence-Backed Performance Changes | 0/6 | Planned; awaiting authorization | - |
| 3. Regression & Comparable Verification | 0/TBD | Not started | - |
