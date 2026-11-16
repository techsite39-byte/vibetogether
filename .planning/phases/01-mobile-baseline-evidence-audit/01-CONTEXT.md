# Phase 1: Mobile Baseline & Evidence Audit - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a reproducible, audit-only mobile homepage baseline and document the actual LCP path and diagnostic evidence needed to scope Phase 2. Capture a fresh live-site result as a separate reference and a local production-preview baseline for a later same-environment before/after comparison. Make no application-code changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Live vs. local comparison
- **D-01:** Keep production and local-preview evidence separate. Re-run the live site as a reference, but compare the local production preview before and after changes as its own pair. A local target result is preview-only; claim live-site success only after a deployed production run.
- **D-02:** Use three successful, cold-cache local runs per checkpoint. Judge targets by the median and report the full range. Retry invalid runs until three valid runs exist and record failed attempts; retain all valid outliers.
- **D-03:** Record the source commit and build identifier for every local checkpoint.
- **D-04:** Use the closest available Moto G Power / Slow 4G profile or Lighthouse version if the exact one is unavailable. Record every difference and do not describe non-identical settings as an exact comparison.
- **D-05:** If the live site cannot be audited, continue with a clearly labeled local preview audit, mark the live capture blocked, and make no live-site claim.
- **D-06:** Use the homepage for the scored baseline. Inspect another route only if evidence points to a shared resource or cause. Add targeted interaction traces only for identified animation or long-task evidence.
- **D-07:** Keep Lighthouse's reported LCP and trace-observed candidate timing/breakdown as separate measurements; explain any discrepancy. Record the DOM selector and resource, with a screenshot or trace reference when available.
- **D-08:** Track Accessibility, Best Practices, and SEO as no-regression guardrails. Report Lighthouse opportunity estimates separately from observed transfer-size and timing changes.
- **D-09:** Append a dated human-readable summary to `docs\performance-baseline.md`. Keep raw Lighthouse JSON and traces local and uncommitted.
- **D-10:** Include matched before/after homepage screenshots at the same mobile viewport as visual evidence; use agent discretion for the exact capture method.

### Booking/payment test boundary
- **D-11:** Keep live-site navigation read-only. Use sandbox or mocked payment services and synthetic test data only; never initiate a real charge or create or modify production bookings. If a safe test environment is unavailable, report the check as blocked instead of treating it as passed.

### the agent's Discretion
- The user requested no further clarification and asked the agent to proceed automatically. Use the recommended options for remaining details: retain valid outliers, retry invalid runs, capture matched screenshots, and use only sandbox/mocked services with synthetic data.
- Select the exact tooling and trace-capture procedure that can reproduce the stated conditions. Record deviations and avoid unsupported comparisons.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and evidence
- `.planning\PROJECT.md` — Project goals, targets, protected behavior, and constraints.
- `.planning\REQUIREMENTS.md` — Testable v1 requirements and target metrics.
- `.planning\ROADMAP.md` — Phase boundary, sequence, and success criteria.
- `docs\performance-baseline.md` — Historical, non-comparable audits; append dated results without conflating environments.

### Existing architecture and performance-sensitive code
- `.planning\codebase\STACK.md` — Frontend build stack and existing tooling.
- `.planning\codebase\ARCHITECTURE.md` — SPA routes, page shells, and frontend/backend boundaries.
- `.planning\codebase\CONCERNS.md` — Previously observed performance concerns to verify against current traces, not assume.
- `src\pages\Home.jsx` — Homepage hero and first-viewport implementation to inspect.
- `src\App.jsx` — Route composition and existing lazy-loading boundaries.
- `index.html` — Initial document resources and hints to verify against the actual LCP element.
- `vite.config.js` — Production build and chunk configuration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The production build and preview commands in `package.json` can produce a local same-code-state baseline without deploying.
- Existing optimized image assets and route-level lazy loading are documented in the codebase map; verify actual current requests and usage before proposing changes.

### Established Patterns
- The frontend is a React/Vite SPA with public and admin routes defined in `src\App.jsx`; most non-home routes are already lazy-loaded.
- The repository has an existing `docs\performance-baseline.md` that retains historical user-supplied, independent live, and local-preview results. New runs must remain separately labeled and comparable only within matching environments.
- Frontend tests use Node's test runner. Backend payment and notification behavior is implemented separately from the static frontend build.

### Integration Points
- `src\pages\Home.jsx`, `index.html`, and the production browser trace are the primary Phase 1 inputs for identifying the actual LCP resource and critical request path.
- `src\App.jsx` and `vite.config.js` provide route and build context; Phase 1 must not change them.
- Payment and booking journeys are protected for later regression checks. Phase 1 may inspect routes read-only and must not submit production transactions.

</code_context>

<specifics>
## Specific Ideas

- The supplied current reference is Lighthouse 13.6 on Moto G Power emulation with Slow 4G: Performance 86, FCP 1.4 s, LCP 3.8 s, TBT 20 ms, CLS 0, and Speed Index 4.2 s.
- The supplied opportunities are 241 KiB image savings, 340 ms render-blocking savings, DOM-size optimization, 35 KiB unused JavaScript, 15 non-composited animated elements, and two long main-thread tasks. Treat these as audit leads, not verified diagnoses.
- Performance targets are Performance 95+, LCP <=2.5 s, FCP <=1.8 s, TBT <=200 ms, and CLS <=0.1. Do not promise or claim them before comparable measurements.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1's audit and verification boundary.

</deferred>

---

*Phase: 1-mobile-baseline-evidence-audit*
*Context gathered: 2026-11-16*
