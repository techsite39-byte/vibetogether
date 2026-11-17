---
phase: "01"
slug: "mobile-baseline-evidence-audit"
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-16"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for the audit-only baseline.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Chrome DevTools and the existing Lighthouse 13.6 CLI; no application test framework changes |
| **Config file** | `package.json`, `vite.config.js` |
| **Quick run command** | `npm.cmd run build` |
| **Full suite command** | Not required for this audit-only phase; unit tests do not establish current LCP evidence |
| **Estimated runtime** | Build time varies; three Lighthouse captures run sequentially |

## Sampling Rate

- **After every task commit:** Validate the generated report/trace artifacts and run settings; no application-code task commits are expected.
- **After every plan wave:** Run the production build and complete the evidence checks for that wave.
- **Before `/gsd-verify-work`:** Confirm three valid, sequential cold-cache local captures, median and range, actual LCP evidence, a separately labeled live reference or explicit blocked result, and the dated summary.
- **Max feedback latency:** A Lighthouse capture duration; captures must not run concurrently.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 1 | LCP-01 | T-01-01 | Homepage-only, read-only capture; raw evidence stays local | build + browser evidence review | `npm.cmd run build` | Yes | passed |
| 01-02 | 01 | 1 | LCP-01 | T-01-01 | No transactional endpoints or production writes | Lighthouse / trace review | Existing Lighthouse 13.6 CLI on the built local preview; sequential captures | Yes, locally installed | passed |

## Wave 0 Requirements

- Existing project build and browser tooling cover this phase; no test framework, package, or application-code changes are required.
- Lighthouse is locally available but extraneous from the project manifest. Do not install or add it as a dependency; use Chrome DevTools as the fallback if the existing CLI cannot run.
- Create raw Lighthouse JSON, traces, and screenshots only in a verified local temporary directory outside the repository.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Identify the rendered LCP candidate, resource, dimensions, priority, request timing, phase breakdown, and dependency chain | LCP-01 | Lighthouse and Chrome trace evidence requires browser-level interpretation | Inspect the report and saved trace; keep reported LCP and trace candidate time separate. |
| Capture live homepage reference without modifying production state | LCP-01 | Live reachability and read-only navigation require environment inspection | Navigate to the homepage only; if unavailable, record blocked and continue with local preview. |
| Confirm visual evidence is comparable | LCP-01 | Screenshot composition and hero state require visual review | Capture before/after screenshots at the same viewport, scroll position, and hero state. |
| Confirm no production writes occurred during local preview capture | LCP-01 | Network requests must be reviewed in the browser | Allow only homepage navigation and public read-only requests; stop if a transactional request appears. |

## Validation Sign-Off

- [x] Every plan task has an automated verify command or an explicit manual-evidence procedure.
- [x] Sampling continuity: three valid local mobile runs are captured sequentially; retain valid outliers and retry only invalid attempts.
- [x] Wave 0 covers missing test infrastructure; no new test framework is needed.
- [x] No watch-mode flags are used for validation commands.
- [x] Evidence includes run configuration, build/commit provenance, LCP details, and the live/local distinction.
- [x] `nyquist_compliant: true` set after validation evidence is complete.

**Approval:** complete
