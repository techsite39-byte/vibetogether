---
phase: "02"
slug: "evidence-backed-performance-changes"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-18"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract. This is a future execution plan, not evidence that implementation or payment tests have run.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner; Vite 8 production build; Oxlint |
| **Config file** | `package.json`, `backend/package.json`, `vite.config.js`, `.oxlintrc.json` |
| **Quick run command** | `npm.cmd test` |
| **Full suite command** | `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd --prefix backend test` |
| **Estimated runtime** | Existing tests/build; measure during execution |

No new test framework or dependency is required by current evidence.

## Sampling Rate

- **After each frontend task:** Run `npm.cmd test`; run `npm.cmd run lint` after changes to JSX/CSS/module structure.
- **After each backend/payment-contract task:** Run `npm.cmd --prefix backend test`.
- **After each plan wave:** Run the full suite commands above.
- **Before `/gsd-verify-work`:** Complete the automated suite, protected-flow checks, required viewport review, and three sequential valid local Lighthouse captures.
- **Max feedback latency:** One targeted test command; Lighthouse captures run sequentially and are not parallelized.

## Per-Task Verification Map

The planner must align concrete task IDs with these requirements before execution; every implementation task needs a runnable verification or explicit manual-evidence procedure.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CFPLAT-01 | T-02-01 | Explicit user approval gates all later website source edits; decline/absence stops execution | blocking decision checkpoint | `git status --short -- src backend render.yaml vercel.json package.json package-lock.json` | Yes; read-only status check | pending |
| 02-02-01 | 02 | 2 | LCP-02, IMG-01, IMG-02, PATH-01, ANIM-01, JS-01 | T-02-02 | Current trace/profile precedes edits; findings separate observations, estimates, trace candidate, and Lighthouse LCP | production build + browser trace/profile | `npm.cmd run build`; report-section check with Node | Existing build; findings report created by task | pending |
| 02-02-02 | 02 | 2 | CFUI-02, CFSEC-01 | T-02-03 | Official Elements capability, merchant sandbox enablement, and existing server contracts are reviewed before payment code | blocking merchant/sandbox review | Node check of `02-CASHFREE-VERIFICATION.md` required-method and API-version entries | Report created at the blocking checkpoint | pending |
| 02-03-01 | 03 | 3 | CFUI-01, CFSEC-01, CFSEC-02, CFPLAT-01 | T-02-04 | Test-first PhonePe-only selected Element tracer; every other Cashfree method is unavailable and cannot be mounted/submitted before approval | focused/full frontend tests + build/lint + sandbox PhonePe tracer | `node --test test/cashfreePaymentMethods.test.js`; `npm.cmd test`; `npm.cmd run build`; `npm.cmd run lint` | Focused test created by task | pending |
| 02-03-02 | 03 | 3 | CFUI-01, CFUI-03, CFSEC-02 | T-02-04 | Explicit human approval of the PhonePe-only tracer is required before Task 02-03-03 and dependent Plan 02-04 work can start | blocking tracer-review decision + tracer behavior regression | `node --test test/cashfreePaymentMethods.test.js`; explicit human approval required | Existing focused test; decision recorded at checkpoint | pending |
| 02-03-03 | 03 | 3 | CFUI-01, CFUI-03, CFSEC-01, CFSEC-02, CFCOMP-01, CFPLAT-01 | T-02-04, T-02-05 | Expand only after explicit approval; map each method to its selected Element, preserve the card data boundary and server authority, and offer only verified-enabled methods | focused/full frontend tests + build/lint + sandbox method checks | `node --test test/cashfreePaymentMethods.test.js`; `npm.cmd test`; `npm.cmd run build`; `npm.cmd run lint` | Focused tests expanded by task | pending |
| 02-04-01 | 04 | 4 | CFSEC-02, CFCOMP-01 | T-02-06 | Cancellation and uncertainty do not create false failure, duplicate charge, or browser-only paid state | state-machine + full frontend tests/build/lint + sandbox | `node --test test/cashfreePaymentState.test.js`; `npm.cmd test`; `npm.cmd run build`; `npm.cmd run lint` | Focused test created by task | pending |
| 02-04-02 | 04 | 4 | CFUI-01, CFUI-02, CFUI-03, CFPLAT-01 | T-02-06 | Exact UI-SPEC method copy, keyboard operation, touch targets, responsive layout, and status-only QR action | focused/full frontend tests + build/lint + viewport review | `node --test test/cashfreePaymentPresentation.test.js`; `npm.cmd test`; `npm.cmd run build`; `npm.cmd run lint` | Focused test created by task | pending |
| 02-05-01 | 05 | 4 | LCP-02, IMG-01, IMG-02, PATH-01, ANIM-01, JS-01 | T-02-07 | Only current trace-confirmed cause paths change; inconclusive evidence yields a recorded no-change result | build/full frontend tests/lint + local resource review | `npm.cmd run build`; `npm.cmd test`; `npm.cmd run lint` | Yes | pending |
| 02-06-01 | 06 | 5 | CFSEC-01, CFSEC-02, CFCOMP-01, CFPLAT-01 | T-02-08 | Existing booking, payment, webhook, schema, Razorpay, Android, and supported website behavior are regression-checked | frontend/backend tests + sandbox/manual regression | `npm.cmd run build`; `npm.cmd run lint`; `npm.cmd test`; `npm.cmd --prefix backend test` | Yes | pending |
| 02-06-02 | 06 | 5 | LCP-02, IMG-01, IMG-02, PATH-01, ANIM-01, JS-01 | T-02-08 | Three sequential comparable local captures support actual results; no unsupported target claim | Lighthouse evidence + report structure | Node final-run section check; `git diff --check -- docs/performance-baseline.md` | Existing Lighthouse/Chrome; report and doc updated by task | pending |

## Wave 0 Requirements

- Existing project test/build/lint and Lighthouse tooling are sufficient.
- Use Cashfree sandbox credentials and synthetic bookings only when implementation is separately authorized.
- Confirm merchant method enablement and the supported `x-api-version` before implementation; do not change production settings as part of this phase.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PhonePe, Google Pay, and Paytm app handoffs | CFUI-01, CFUI-03 | Requires the enabled Cashfree merchant account and supported mobile apps/browser configuration | In Cashfree sandbox only, verify each documented app ID from an Android browser with the relevant app installed; cover missing app, cancellation, return, and retry. |
| QR and card issuer authentication | CFUI-01, CFUI-03 | Provider/issuer behavior and app/bank availability are external | Use sandbox flows; verify the QR stays in-page and any required issuer handoff occurs only after explicit submit. Never use a live charge. |
| Net Banking and wallet availability | CFUI-02 | Elements support and merchant enablement are account-specific | Verify each branded option against Cashfree Elements and the merchant account; if unsupported, stop for review rather than silently removing it or using hosted checkout. |
| Booking, ticket, and payment outcome | CFSEC-01, CFSEC-02, CFCOMP-01, REG-01, TEST-01 | Requires browser interaction and a safe sandbox/mocked backend | Confirm server-side paid/pending/failed/cancelled outcomes, booking reference, ticket QR, and retry behavior; do not trust a browser callback alone. |
| Responsive website and Android browser | CFPLAT-01, VIEW-01 | Requires visual and interaction inspection | Inspect 360, 375, 390, 412, and 430 CSS-pixel widths and desktop; include Android browser and confirm no native Android files changed. |
| Performance comparison | LCP-02, LH-01, LH-02 | Lighthouse trace interpretation and visual evidence require browser review | Run three valid sequential cold-cache local captures with Phase 1 conditions and provenance; report median/range and separate trace candidate time from Lighthouse LCP. |

## Validation Sign-Off

- [ ] Every final plan task has an automated verify command or explicit manual-evidence procedure.
- [ ] No three consecutive implementation tasks lack automated verification.
- [ ] No production payment or deployment test is scheduled without separate explicit authorization.
- [ ] No watch-mode flags are used.
- [ ] Three comparable Lighthouse runs are planned sequentially; no target is claimed without fresh results.
- [ ] `nyquist_compliant: true` is set only after implementation validation is complete.

**Approval:** pending
