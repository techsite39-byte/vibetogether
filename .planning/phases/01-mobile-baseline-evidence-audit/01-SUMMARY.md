---
phase: 01-mobile-baseline-evidence-audit
plan: 01
status: complete
completed: 2026-11-17
---

# Phase 1 Summary — Mobile Baseline & Evidence Audit

## Outcome

Completed the audit-only mobile homepage baseline: production build, one separate live reference, three sequential local production-preview Lighthouse captures, trace review, request-safety review, and dated baseline documentation. No application, checkout, booking, payment, database, or deployment changes were made.

## Captures

- Source commit: `234be78cc806d7e33abc9dbdafd452c210c62f01`. Build passed with Vite 8.3.6; Node 24.19.0, npm 11.17.0, Chrome 157.0.8103.52, Lighthouse 13.6.0.
- Approximate Moto G Power / Slow 4G emulation: mobile viewport 412 × 915 CSS px, DPR 2.625, simulated 150 ms RTT, 1638.4 Kbps, and 4× CPU.
- Separate live reference: Performance 47, FCP 1.1 s, LCP 6.3 s, TBT 3,340 ms, CLS 0.007, Speed Index 3.6 s.
- Local median (range): Performance 50 (45–73), FCP 0.9 s (0.9–1.0), Lighthouse LCP 5.0 s (3.0–6.5), TBT 4,562 ms (930–5,170), CLS 0.0074, Speed Index 3.9 s (1.9–4.1).
- The hero image was the LCP candidate in all local runs. Trace-candidate median was 1.874 s (1.061–2.125); this is separate from Lighthouse's simulated LCP metric. Element-render delay was the largest LCP subpart. Long-task attribution did not confirm a code-level cause.
- All four saved browser logs contained only GET requests. No payment, booking submission, or admin action occurred. A first-slide baseline screenshot and raw reports/traces are retained outside the repository at `C:\Users\user\AppData\Local\Temp\vibetogether-phase1-audit-2026-11-17\`.

## Phase 2 evidence

The hero was eager, high priority, and discoverable, but no single cause was confirmed. Lighthouse image, render-blocking, and unused-JavaScript savings remain estimates. TBT varies substantially and long-task source attribution is unavailable; gather targeted evidence before making changes.

## Validation and worktree

- `npm.cmd run build` passed; `git diff --check` passed.
- No checkout-specific build/test or payment flow was run.
- Planning and audit documentation changes remain uncommitted on protected `main`; no branch change, staging, or commit was performed.
