# VibeTogether Mobile Performance Optimization

## What This Is

VibeTogether is a customer-facing website for discovering and booking live music, social events, community meetups, and related experiences. This project improves the existing website's mobile performance through an audit-first workflow, without redesigning the site or changing its product behavior.

## Core Value

Make the mobile experience measurably faster while preserving the existing design and reliable event discovery, booking, payment, ticket, notification, and account flows.

## Business Context

- **Customer**: People discovering and booking VibeTogether events and experiences.
- **Revenue model**: Event bookings and ticket purchases.
- **Success metric**: A comparable Lighthouse 13.6 mobile run reaches Performance 95+ and LCP ≤2.5 s, with FCP ≤1.8 s, TBT ≤200 ms, and CLS ≤0.1; report actual results without claiming unmeasured targets.

## Requirements

### Validated

- ✓ The site has public event discovery and booking routes — existing codebase.
- ✓ The application includes Cashfree and Razorpay payment flows, payment verification/webhooks, and UPI support — existing codebase.
- ✓ Booking confirmation, ticket/QR, login, and admin functionality are present — existing codebase.
- ✓ Public and admin routes use separate layouts and route-level lazy loading — existing codebase.

### Active

- [ ] Identify the exact mobile LCP element, resource, priority, dimensions, request timing, breakdown, and dependency chain before changing the critical path.
- [ ] Use current Lighthouse evidence to select and implement only justified image, render-blocking, animation, DOM, or JavaScript optimizations.
- [ ] Preserve the existing visual design, responsive behavior, route/API contracts, booking and ticket generation, Cashfree/Razorpay payments and verification, webhooks, and admin authentication.
- [ ] Verify the production build and relevant tests; inspect layouts at 360, 375, 390, 412, and 430 px and on desktop.
- [ ] Exercise navigation and the booking, checkout, and ticket journeys where the available backend/environment permits; report any verification blocked by unavailable services.
- [ ] Run Lighthouse mobile under conditions comparable to the supplied baseline and report before/after metrics, failures, and any targets not met.

### Out of Scope

- Payment/business logic, payment webhooks, booking rules, or database schema changes — performance work must not alter transactional behavior.
- Redesigning the site, changing routes/APIs, or changing the responsive design — the requested work is optimization without functional or visual regression. Feature removals require separate explicit authorization and must preserve unrelated behavior.
- Unmeasured cleanup, dependency removal, or broad refactoring — changes must address a measured bottleneck and preserve behavior.

## Context

- This is a brownfield React 19/Vite 8 single-page application with an Express/MongoDB backend. Route-level lazy loading is already used; public and admin areas share a repository but have separate route shells.
- The latest user-supplied Lighthouse 13.6 mobile report (16 November 2026, Moto G Power emulation, Slow 4G) is Performance 86, FCP 1.4 s, LCP 3.8 s, TBT 20 ms, CLS 0, and Speed Index 4.2 s. It reports 241 KiB estimated image savings, 340 ms render-blocking savings, DOM-size optimization, 35 KiB unused JavaScript, 15 non-composited animated elements, and two long main-thread tasks.
- The repository's `docs/performance-baseline.md` contains older independent audits and local-preview runs with materially different results. They are historical context, not a controlled comparison with the latest supplied run; do not treat them as current measurements.
- The user requires an audit-first approach: identify the actual LCP and measured causes, do not lazy-load the LCP image, preload only the actual critical image when appropriate, avoid preloading every carousel slide, preserve image layout dimensions, and respect reduced-motion preferences.
- The existing codebase map is in `.planning/codebase/`. It documents the current architecture and identifies performance observations that require validation against the latest report before action.

## Constraints

- **Compatibility**: Preserve all existing routes, APIs, responsive behavior, booking/ticket flows, payment integrations and verification, webhooks, login, and admin authentication.
- **Performance**: Optimize only issues confirmed by current evidence; preserve image quality and the existing design.
- **Validation**: Do not claim a target was met without a new comparable Lighthouse run. Distinguish user-supplied, repository-observed, and newly measured results.
- **Data integrity**: Do not change payment logic or database schemas.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Audit the LCP element and its request path before implementation | The user requires measured, targeted changes rather than speculative score chasing | — Pending |
| Treat the 16 November 2026 Lighthouse report as the current supplied baseline and retain older audits as historical | The existing baseline document contains non-comparable runs with conflicting metrics | — Pending |
| Preserve transactional and authenticated functionality; make no payment or schema changes | These flows are explicitly protected and are not the target of this performance work | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-16 after initialization*
