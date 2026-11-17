---
phase: 01-mobile-baseline-evidence-audit
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/performance-baseline.md
autonomous: true
requirements:
  - LCP-01
estimate:
  tokens: 50000
  raw_tokens: 50000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "A fresh local production-preview homepage baseline has three valid sequential cold-cache mobile runs, summarized by median and full range with all valid outliers retained."
    - "The current trace evidence identifies the mobile LCP element and resource, rendered dimensions, loading priority, request timing, LCP phase breakdown, and network dependency chain."
    - "Fresh live production evidence is reported separately from the local preview sample, or explicitly marked blocked without a live-site claim."
    - "The dated audit distinguishes new measurements, supplied leads, historical reports, Lighthouse opportunity estimates, and evidence-based hypotheses."
    - "Current image, render-blocking, animation, long-task, DOM, JavaScript, and Accessibility/Best Practices/SEO guardrail evidence is recorded."
    - "FLAGGED ASSUMPTION — captures are never concurrent; an interrupted set is incomplete; preserve valid runs and retry until three valid local runs exist."
  artifacts:
    - path: "docs/performance-baseline.md"
      provides: "Dated, human-readable Phase 1 baseline and diagnostic evidence summary"
  key_links:
    - from: "index.html"
      to: "src/pages/Home.jsx"
      via: "Compare responsive hero preload hints with the runtime-selected LCP image and request."
    - from: "src/pages/Home.jsx"
      to: "src/pages/Home.css"
      via: "Correlate the runtime LCP element's rendered box and visual state with hero image styling."
    - from: "docs/performance-baseline.md"
      to: "index.html"
      via: "Append the measured runtime LCP evidence without treating source declarations as measurements."
  prohibitions:
    - statement: "Do not modify application code or any file other than docs/performance-baseline.md; do not alter payment, booking, database, or production state."
      status: unresolved
      verification: null
      resolution: flagged-unverified
      reason: "Spec-less prohibition recall retained this project-specific audit boundary without inventing a mechanical check."
    - statement: "Keep raw Lighthouse reports, traces, and screenshots in a confirmed local temporary directory outside the repository; do not commit or upload them."
      status: unresolved
      verification: null
      resolution: flagged-unverified
      reason: "Spec-less prohibition recall retained the local-only evidence boundary without inventing a mechanical check."
---

<objective>
Establish a reproducible, audit-only mobile homepage baseline and document the current LCP path and diagnostic evidence needed to scope Phase 2.

Purpose: Ground follow-on performance work in current browser evidence rather than the supplied opportunity estimates or older, non-comparable reports.
Output: One dated append to `docs/performance-baseline.md`; raw reports, traces, and screenshots remain uncommitted in a confirmed local temp directory.
</objective>

<execution_context>
@~/.copilot/gsd-core/workflows/execute-plan.md
@~/.copilot/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/01-mobile-baseline-evidence-audit/01-CONTEXT.md
@.planning/phases/01-mobile-baseline-evidence-audit/01-RESEARCH.md
@.planning/phases/01-mobile-baseline-evidence-audit/01-PATTERNS.md
@.planning/phases/01-mobile-baseline-evidence-audit/01-VALIDATION.md
@docs/performance-baseline.md
@.github/copilot-instructions.md
@package.json
@vite.config.js
@index.html
@src/pages/Home.jsx
@src/pages/Home.css
@src/App.jsx
@src/config/api.js

The roadmap's MVP label does not expand this brownfield audit-only phase: no tracer, scaffold, source edits, database work, deployment, code cleanup, or performance implementation. The worktree starts dirty on `restore-cashfree-checkout-9317`; preserve it and do not inspect, alter, stage, revert, or include the protected `src/pages/BookingPayment.jsx` and `src/pages/BookingPayment.css` work.

The user-supplied 2026-11-16 values (Lighthouse 13.6, Performance 86, FCP 1.4 s, LCP 3.8 s, TBT 20 ms, CLS 0, Speed Index 4.2 s, 241 KiB image estimate, 340 ms render-blocking estimate, 35 KiB unused JS, 15 non-composited animations, and two long tasks) are leads only. Older entries in the baseline document are historical, not current measurements.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the local production preview and record provenance</name>
  <read_first>
    @package.json
    @vite.config.js
    @index.html
    @src/pages/Home.jsx
    @src/pages/Home.css
    @src/App.jsx
    @src/config/api.js
    @.planning/phases/01-mobile-baseline-evidence-audit/01-CONTEXT.md
    @.planning/phases/01-mobile-baseline-evidence-audit/01-RESEARCH.md
    @.github/copilot-instructions.md
  </read_first>
  <files>none; read-only build and provenance capture</files>
  <action>Build the existing frontend once with `npm.cmd run build`; do not edit application or configuration files. Record `git rev-parse HEAD`, the worktree as dirty per the supplied context, Node/npm versions, Chrome version, and Lighthouse version if the existing CLI is runnable. Identify this build by combining the source commit with a SHA-256 digest of the sorted generated `dist/` file paths and contents. Keep the existing Lighthouse 13.6 executable only if it runs; its package is extraneous and flagged suspicious, so do not install, download, or add it. Record that the live and local datasets are separate per D-01, and document actual provenance for every local checkpoint per D-03. Do not change branches or claim a clean worktree.</action>
  <acceptance_criteria>
    - The existing production build succeeds without source/config edits.
    - Provenance records the source commit, build identifier, dirty-worktree status, and actual runtime/tool versions.
    - No package is installed or downloaded; if Lighthouse is unavailable, the plan's DevTools fallback remains available.
    - D-01 and D-03 are honored.
  </acceptance_criteria>
  <verify>
    <automated>npm.cmd run build</automated>
    <fails_when>The command exits nonzero or Vite reports a build error.</fails_when>
    <human-check>Confirm the source commit and build identifier are recorded, the build was made from the existing dirty worktree without claiming it clean, and no tracked source/config file was changed.</human-check>
  </verify>
  <done>The production build and provenance are recorded, and the repository remains audit-only.</done>
</task>

<task type="auto">
  <name>Task 2: Capture the separate live reference and three-run local mobile evidence</name>
  <read_first>
    @.planning/phases/01-mobile-baseline-evidence-audit/01-CONTEXT.md
    @.planning/phases/01-mobile-baseline-evidence-audit/01-RESEARCH.md
    @.planning/phases/01-mobile-baseline-evidence-audit/01-VALIDATION.md
    @package.json
    @vite.config.js
    @index.html
    @src/pages/Home.jsx
    @src/pages/Home.css
    @src/App.jsx
    @src/config/api.js
  </read_first>
  <files>none; reports, traces, and screenshots are local temporary evidence only</files>
  <action>Confirm a writable temp directory outside the repository and save every raw report, trace/log, and screenshot there, uncommitted, per D-09. Run a fresh Lighthouse 13.6 homepage-only production reference against `https://www.vibetogether.show/` with read-only navigation; if unreachable or unsafe, record the live capture as blocked and continue locally without a production claim, per D-05 and D-11. Serve the built app with the existing `npm.cmd run preview -- --host 127.0.0.1 --strictPort` script; do not substitute the development server. Inspect Network requests: allow only homepage navigation and public read-only requests (including the configured public events GET if it occurs); stop if a transactional method, booking/payment endpoint, form submission, charge, webhook, or admin action appears. Capture three valid local homepage runs one at a time with cold cache, preserving all valid outliers; record invalid attempts and retry until there are three valid runs. Never run captures concurrently and never count an interrupted set as complete: this is the flagged, unresolved concurrency-probe assumption. Do not disable Lighthouse storage reset. Use the closest available Moto G Power / Slow 4G profile; record actual Lighthouse/browser versions, viewport, DPR, CPU/network throttling method and values, cache state, URL, and capture time, and label the match approximate whenever any supplied condition is not identical, per D-02 and D-04. Use only the already-installed Lighthouse executable if runnable; otherwise use Chrome DevTools Lighthouse and Performance/Network panels without installing a replacement. For every local run, retain the report and saved trace/network log, source commit, and build identifier. Capture the local baseline homepage screenshot at the page top and first-hero-slide state, recording viewport/DPR and motion settings so Phase 3 can capture the matching after screenshot at the same state and dimensions, per D-10. Keep Lighthouse's reported LCP separate from trace candidate timing; gather the selected DOM node/selector and resource, intrinsic and rendered dimensions, loading/fetch priority, request timing, LCP subparts, and document-to-resource dependency chain, per D-06, D-07. Also capture current image evidence, render-blocking requests, animation evidence, long-task durations and available attribution, DOM size, and JavaScript evidence. Report opportunity estimates separately from observed transfer/timing, and keep Accessibility, Best Practices, and SEO as no-regression guardrails, per D-08. Treat the supplied report values as unverified leads, not new measurements.</action>
  <acceptance_criteria>
    - One fresh live homepage reference is captured separately or explicitly marked blocked; no live-site result is merged into the local sample.
    - There are three valid, sequential, cold-cache local mobile runs. Every valid outlier is retained; invalid attempts and retries are recorded; an interrupted set is not complete.
    - Every local run records the source commit, build identifier, actual browser/Lighthouse/emulation settings, and raw report/trace references.
    - The current LCP element/resource, selector, intrinsic and rendered dimensions, loading priority, request timing, LCP phase breakdown, and network dependency chain are evidenced from runtime output.
    - Image, render-blocking, animation, long-task, DOM, JavaScript, and accessibility/Best Practices/SEO evidence is collected, with estimates distinct from observations and hypotheses distinct from findings.
    - A baseline screenshot and exact capture state are recorded for a Phase 3 same-viewport/state after screenshot.
    - No capture is concurrent; no booking/payment/admin flow or production write occurs.
    - D-01, D-02, and D-04 through D-11 are honored.
  </acceptance_criteria>
  <verify>
    <automated>npm.cmd run build</automated>
    <fails_when>The built preview cannot be served from the successful build, or the build command exits nonzero; browser evidence still requires the checks below.</fails_when>
    <human-check>Review each of the three local reports and traces for a successful cold-cache homepage navigation and required LCP/network fields; verify run ordering, invalid-attempt log, actual settings, separate live reference or blocked note, temp-only raw artifact location, matched-screenshot capture state, and absence of transactional requests.</human-check>
  </verify>
  <done>The live reference and reproducible local sample are kept separate, and current runtime LCP plus diagnostic evidence is available without production writes.</done>
</task>

<task type="auto">
  <name>Task 3: Analyze findings and append the dated evidence summary</name>
  <read_first>
    @docs/performance-baseline.md
    @.planning/phases/01-mobile-baseline-evidence-audit/01-CONTEXT.md
    @.planning/phases/01-mobile-baseline-evidence-audit/01-RESEARCH.md
    @.planning/REQUIREMENTS.md
    @index.html
    @src/pages/Home.jsx
    @src/pages/Home.css
    @src/App.jsx
    @src/config/api.js
  </read_first>
  <files>docs/performance-baseline.md</files>
  <action>Append one dated human-readable Phase 1 section to `docs/performance-baseline.md`; preserve all historical sections and make no other repository edits. Present live reference and local preview results in separate labeled subsections. For local metrics, report the median and full range across the three valid runs, retain and explain valid outliers, and list invalid retries separately. Record the supplied reference profile and actual settings/deviations; call the result approximate when non-identical. Include source commit/build identifier, browser/Lighthouse versions, screenshot state, and local raw-artifact directory reference without embedding raw report data. Document the Lighthouse LCP metric and trace candidate time separately, then report selector/node, resource URL, intrinsic/rendered dimensions, loading/fetch priority, request start/end and transfer timing, LCP phase breakdown, and network dependency chain. Summarize measured image transfer and render-blocking requests separately from Lighthouse savings estimates; include animation findings, long-task timing and any available call-stack attribution, DOM size, JavaScript evidence, and Accessibility/Best Practices/SEO guardrail scores. Label the 2026-11-16 supplied figures as unverified leads and prior document entries as historical. Distinguish observation, estimate, hypothesis, attribution limit, and environmental block explicitly. Include a reasoned Phase 2 evidence summary without prescribing or implementing changes; state clearly if no cause is confirmed. Reference the matched baseline screenshot's viewport/state for later pairing. Keep the report append-only and all raw artifacts local and uncommitted, per D-07 through D-10.</action>
  <acceptance_criteria>
    - Only a dated append to `docs/performance-baseline.md` is made; existing historical entries remain intact.
    - The append has distinct live/local labels and includes three-run local medians and ranges, outliers, invalid attempts, provenance, actual settings, and screenshot matching details.
    - LCP metric and trace candidate timing are separately labeled; every LCP-01 field is documented from trace/report evidence.
    - Image/render-blocking estimates are not described as observed savings; animation, long-task, DOM, and JavaScript evidence is separated into measurement, attribution, and hypothesis.
    - Accessibility, Best Practices, and SEO guardrails are reported, and blocked/limited evidence is stated without a pass claim.
    - Raw JSON, traces, and screenshots remain outside the repository and uncommitted; no performance fix or source modification is included.
    - D-07, D-08, D-09, and D-10 are honored.
  </acceptance_criteria>
  <verify>
    <automated>git diff --check -- docs/performance-baseline.md</automated>
    <fails_when>The command reports whitespace errors in the appended baseline section or exits nonzero.</fails_when>
    <human-check>Compare the appended narrative against the saved reports/traces and verify every stated number has a source, every estimate is labeled, and the live/local distinction and raw-evidence boundary remain explicit.</human-check>
  </verify>
  <done>The baseline document contains a trace-grounded audit summary sufficient to decide Phase 2 scope, with no implementation changes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser to live production homepage | Read-only public navigation; any attempt to reach transactional or administrative behavior is prohibited. |
| Local production preview to configured public API | The homepage may issue a public events GET against the production API; inspect actual methods and stop if a write or transactional request appears. |
| Browser evidence to local storage | Reports and traces can contain sensitive request metadata; keep raw artifacts in a confirmed local temp directory and out of version control or external services. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-01-01 | Tampering | Live and preview browser navigation | high | mitigate | Score only the homepage, keep live navigation read-only, inspect network methods, and stop before any transactional/admin request or interaction. |
| T-01-02 | Information Disclosure | Lighthouse JSON, traces, screenshots | medium | mitigate | Store raw evidence only in the confirmed local temp directory; do not upload, commit, or expose raw headers/cookies. |
| T-01-03 | Denial of Service | Sequential Lighthouse capture process | low | mitigate | Run one capture at a time and retry only invalid attempts; never launch concurrent capture jobs. |
| T-01-SC | Tampering | npm package acquisition | high | mitigate | Install nothing. Use only the existing Lighthouse 13.6 CLI if runnable, otherwise Chrome DevTools; any later install proposal stops for human verification of the flagged package before package-manager use. |
</threat_model>

## Source audit

| Source | Item | Plan | Status |
|--------|------|------|--------|
| GOAL | Reproducible audit-only mobile homepage baseline and current LCP path | 01-01 | COVERED |
| REQ | LCP-01: current LCP element/resource, dimensions, priority, request timing, breakdown, dependency chain | 01-01, task 2 and task 3 | COVERED |
| RESEARCH | Built local production preview, provenance, fresh separate live reference, three sequential cold-cache local captures, actual profile/settings and fallback tooling | 01-01 | COVERED |
| RESEARCH | Trace-grounded LCP and network dependency evidence; images, render-blocking, animations, long tasks, DOM and JavaScript; measurements distinguished from estimates/hypotheses | 01-01 | COVERED |
| RESEARCH | Local-only raw evidence, matched screenshot state, public events GET inspection, no transactional actions, append-only summary | 01-01 | COVERED |
| CONTEXT | D-01 through D-11: independent environments, run count/summary/retry, provenance, approximate-profile disclosure, blocked-live fallback, homepage/read-only scope, separate LCP measurements, guardrails, summary/raw storage, matched screenshots, and transaction safety | 01-01 | COVERED |

## Flagged assumption

The spec-less edge probe left concurrency/interruption handling unresolved. This plan explicitly adopts the conservative assumption: do not run captures concurrently; an interrupted set does not count as complete; preserve every valid run and retry until three valid local runs exist. The policy is flagged and has no fabricated automated check.

<verification>
<automated>npm.cmd run build</automated>
<fails_when>The production build exits nonzero or Vite reports a build error.</fails_when>
<human-check>Confirm three valid sequential local captures, complete LCP evidence, a separate live reference or blocked status, the dated append, local-only raw evidence, and the stated audit-only and transaction-safety boundaries.</human-check>
</verification>

<success_criteria>
LCP-01 is fully documented from a fresh mobile homepage report and trace. The local baseline has three valid sequential cold-cache runs summarized by median and range, with provenance and actual settings; live results remain separate or blocked. Diagnostic findings and guardrails distinguish observations from estimates and hypotheses. `docs/performance-baseline.md` is the only repository file modified by phase execution, no application code or production state changes, and raw evidence remains local and uncommitted.
</success_criteria>

## Artifacts this phase produces

- Dated human-readable baseline and evidence summary appended to `docs/performance-baseline.md`.
- Outside-repository temporary raw Lighthouse JSON, traces/network logs, and baseline screenshot, retained locally and uncommitted.

<output>
Create `.planning/phases/01-mobile-baseline-evidence-audit/01-SUMMARY.md` when done.
</output>
