# Roadmap: VibeTogether Mobile Performance Optimization

## Overview

This MVP is a narrow, audit-first optimization of the existing VibeTogether site. It begins by reproducing a comparable mobile Lighthouse baseline and collecting trace evidence, then changes only measured bottlenecks, and finishes with regression checks and a comparable final run. Existing design, responsive behavior, and protected booking, payment, ticket, notification, account, and admin flows remain in scope for preservation; payment logic and database schemas do not change. Performance targets are goals to measure, not promised outcomes.

## Phases

- [ ] **Phase 1: Mobile Baseline & Evidence Audit** - Reproduce a comparable mobile baseline and document LCP and relevant diagnostic evidence before any implementation.
- [ ] **Phase 2: Evidence-Backed Performance Changes** - Address only bottlenecks confirmed by Phase 1 while preserving the existing experience.
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
**Plans**: TBD

### Phase 2: Evidence-Backed Performance Changes
**Goal**: Users receive only evidence-justified mobile performance improvements, with the critical path and existing visual and functional behavior preserved.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LCP-02, IMG-01, IMG-02, PATH-01, ANIM-01, JS-01
**Success Criteria** (what must be TRUE):
  1. The verified LCP resource is not lazy-loaded; any preload or high fetch priority is limited to that resource and justified by the trace.
  2. Audited image issues are addressed with suitable responsive sizes/formats and reserved layout space; below-the-fold loading is appropriate and unneeded carousel slides are not all preloaded.
  3. Render-blocking changes target only requests shown to delay rendering, while fonts, appearance, and behavior remain intact.
  4. Animation, long-task, DOM, or JavaScript changes address only measured causes; important motion remains, reduced-motion preferences are respected, and unnecessary admin code is not added to public-page loads.
**Plans**: TBD
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
| 1. Mobile Baseline & Evidence Audit | 0/TBD | Not started | - |
| 2. Evidence-Backed Performance Changes | 0/TBD | Not started | - |
| 3. Regression & Comparable Verification | 0/TBD | Not started | - |
