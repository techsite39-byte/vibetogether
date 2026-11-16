# Phase 1: Mobile Baseline & Evidence Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 1-Mobile Baseline & Evidence Audit
**Areas discussed:** Live vs. local comparison, Booking/payment test boundary

---

## Live vs. local comparison

| Question | Options presented | Selected |
|----------|-------------------|----------|
| How should live production and local preview results be compared? | Live reference plus separate local pair / Cross-environment comparison with caveats / Live only | Live reference plus separate local before/after pair |
| How many identical mobile runs per checkpoint? | Three runs with median and range / One run / Other count or method | Three runs with median and range |
| What if the exact Moto G Power / Slow 4G profile is unavailable? | Closest profile with differences documented / Stop / Ask first | Closest profile with differences documented |
| What evidence should be preserved? | Summary plus local uncommitted raw files / Commit all / Summary only | Summary plus local uncommitted raw files |
| How to report Lighthouse/trace LCP timing discrepancies? | Report separately and explain / Lighthouse only / Trace only | Report separately and explain |
| How to judge targets across three runs? | Median and range / All runs must pass / Report only | Median and range |
| Should Accessibility, Best Practices, and SEO be guardrails? | No-regression guardrails / Report only / Performance only | No-regression guardrails |
| Which pages receive the scored Phase 1 baseline? | Homepage, other routes only if a shared cause appears / Sample routes / All public routes | Homepage, other routes only if a shared cause appears |
| What if the live site cannot be audited? | Continue locally and mark live blocked / Pause / Ask first | Continue locally and mark live blocked |
| What interaction profiling is in scope? | Page-load plus targeted traces / Broader profiling / Page-load only | Page-load plus targeted traces |
| What counts as target evidence without deployment? | Local result is preview-only; production claim requires deployed run / Production only / Either, labeled | Local result is preview-only; production claim requires deployed run |
| What cache state for local scored runs? | Cold cache / Both / Warm cache | Cold cache |
| How to make the LCP finding verifiable? | Selector/resource plus screenshot or trace reference / Selector only / Full annotated trace in report | Selector/resource plus screenshot or trace reference |
| How to report opportunity savings? | Separate estimates from observed savings / Estimates only if needed / Omit estimates | Separate estimates from observed savings |
| Where should the human-readable summary go? | Append dated results to `docs\performance-baseline.md` / Phase artifacts only / Both | Append dated results to `docs\performance-baseline.md` |
| What if Lighthouse 13.6 is unavailable? | Closest version, label it / Hold / Ask first | Closest version, label it |
| How should invalid and valid outlier runs be handled? | Retry invalid runs and keep all valid runs / Count failures / Exclude outliers | Retry invalid runs; keep valid outliers and report median/range |
| What build provenance should be included? | Commit and build identifier / Timestamp and URL only / None | Commit and build identifier |
| What visual evidence should accompany the report? | Matched screenshots / LCP-only / None | User asked to proceed automatically; agent selected matched screenshots at the same mobile viewport |

**Notes:** The latest supplied Lighthouse values remain user-supplied until reproduced. The existing baseline contains earlier live and local-preview measurements that are not controlled comparisons.

---

## Booking/payment test boundary

| Question | Options presented | Selected |
|----------|-------------------|----------|
| How should booking and payment checks avoid production mutations? | Not separately asked; user requested no further questions and automatic progress | Agent discretion: live navigation read-only; sandbox/mocked services and synthetic test data only; no real charges or production booking changes; mark unavailable safe tests as blocked |

**Notes:** Do not read or expose secret values. Use existing test configuration only when safe and available.

---

## the agent's Discretion

- Use the recommended comparison and screenshot choices where the user requested automatic progress.
- Choose appropriate technical audit tooling and report any environment differences; do not broaden the phase beyond the approved audit boundary.

## Deferred Ideas

None.
