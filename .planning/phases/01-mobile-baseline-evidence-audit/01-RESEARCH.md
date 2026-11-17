<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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
- **D-11:** Keep live-site navigation read-only. Use sandbox or mocked payment services and synthetic test data only; never initiate a real charge or create or modify production bookings. If a safe test environment is unavailable, report the check as blocked instead of treating it as passed.

### the agent's Discretion
- The user requested no further clarification and asked the agent to proceed automatically. Use the recommended options for remaining details: retain valid outliers, retry invalid runs, capture matched screenshots, and use only sandbox/mocked services with synthetic data.
- Select the exact tooling and trace-capture procedure that can reproduce the stated conditions. Record deviations and avoid unsupported comparisons.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 1's audit and verification boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LCP-01 | Before implementation, the developer can identify the mobile LCP element and its resource, rendered dimensions, loading priority, request timing, LCP phase breakdown, and network dependency chain from a current trace. [VERIFIED: `.planning/REQUIREMENTS.md`] | Use a fresh mobile Lighthouse 13.6 report plus its saved trace/network log; record DOM selector, resource URL, CSS and intrinsic dimensions, priority, request start/end, LCP subparts, and the dependency tree. Keep metric LCP and trace candidate time separate. [CITED: Chrome LCP docs; Lighthouse CLI help; Lighthouse 13 dependency-tree docs] |
</phase_requirements>

# Phase 1: Mobile Baseline & Evidence Audit - Research

**Researched:** 2026-11-16  
**Domain:** Reproducible browser-based mobile performance measurement and evidence capture  
**Confidence:** MEDIUM

**Citation shorthand:** `COC D-n` refers to decision D-n in `.planning/phases/01-mobile-baseline-evidence-audit/01-CONTEXT.md`. [VERIFIED: phase CONTEXT.md read this session]

## Summary

This is a measurement phase, not an optimization phase: do not edit application code, infer a root cause from the supplied scorecard, or run payment/booking flows. Score the homepage only. Preserve two clearly labeled datasets: a fresh read-only live-site reference and a local Vite production-preview baseline intended to pair with a later local preview run. The previously recorded Lighthouse reports in `docs/performance-baseline.md` are historical context, not current measurements. [VERIFIED: `.planning/phases/01-mobile-baseline-evidence-audit/01-CONTEXT.md`; `.planning/REQUIREMENTS.md`; `docs/performance-baseline.md`]

**Primary recommendation:** Build and serve the current frontend as a local production preview, record the exact source/build/browser/Lighthouse conditions, then collect three sequential cold-cache mobile Lighthouse 13.6 runs with raw JSON and trace artifacts saved outside the repository. Use a separate homepage-only live navigation reference; never merge its results with the local sample. If the exact Moto G Power / Slow 4G parameters cannot be reconstructed, record Lighthouse's actual emulation and throttle settings and call the comparison approximate. Lighthouse reports both metric and diagnostic evidence; use the current trace to establish the LCP node/resource and its causal request chain. [VERIFIED: `package.json:12,15`; local Lighthouse 13.6 `--help`; COC decisions D-01–D-07; CITED: Lighthouse score variability; Chrome DevTools Performance]

The supplied 2026-11-16 values and savings estimates are audit leads only. No new Lighthouse run, live navigation, preview build, or production request was made in this research; this document makes no new score or performance claim. [VERIFIED: research-session actions; ASSUMED: user-provided 2026-11-16 report is a reference input, not a reproducible current capture]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mobile LCP, request, rendering, animation and main-thread evidence | Browser / Client | — | The LCP candidate, its layout/rendered size, browser request priority, screenshots, and main-thread tasks must be observed in Chrome/Lighthouse. [CITED: Chrome DevTools Performance reference; Chrome LCP docs] |
| Local production preview and asset delivery | Frontend Server (static preview) | Browser / Client | Vite builds and serves the production frontend; the browser is the measurement client. Use the production preview, not the Vite development server, for the local checkpoint. [VERIFIED: `package.json:12,15`; `vite.config.js`; CITED: Lighthouse overview] |
| Homepage event-data request | API / Backend | Browser / Client | The homepage calls the public events endpoint. Vite statically sets `import.meta.env.PROD` for production builds; without `VITE_API_URL` or `VITE_API_BASE_URL`, this repo's configured production API URL is selected. Log the request and verify its actual method; do not exercise booking or payment endpoints. [VERIFIED: `src/config/api.js:1-13`; `src/services/bookingEnquiry.js:8-24`; CITED: `https://vite.dev/guide/env-and-mode`] |
| Evidence summary | Documentation | Browser / Client | Append only the dated human-readable findings to the existing baseline document; keep raw report/trace artifacts local and uncommitted. [VERIFIED: COC D-09; `docs/performance-baseline.md`] |

The source-of-truth API configuration contains these exact values:

```js
const productionApiUrl = 'https://vibetogether-ahgy.onrender.com/api'
const configuredApiUrl = (env.VITE_API_URL ?? env.VITE_API_BASE_URL ?? '').trim()
return env.PROD ? productionApiUrl : '/api'
```

[VERIFIED: `src/config/api.js:1,3,13`; quoted source lines read this session]

## Standard Stack

### Core

| Tool | Version / State | Purpose | Why Standard |
|------|-----------------|---------|--------------|
| Chrome for desktop | `157.0.8103.52` observed in this environment | Browser runtime, device/network emulation, and trace analysis | Lighthouse CLI and DevTools use Chrome; record the exact browser version because DevTools interfaces/settings can vary by version. [VERIFIED: local Chrome `--version`; CITED: Lighthouse overview; Chrome DevTools Performance reference] |
| Lighthouse CLI | `13.6.0` present locally; package is **extraneous** from the project manifest | Repeatable mobile navigation reports, JSON export, trace and DevTools-log capture | Official Lighthouse supports CLI audits and JSON output; the current local CLI help exposes `--save-assets` for trace/log saving. Use only the already-present executable; do not install or add a dependency for this audit. [CITED: `https://developer.chrome.com/docs/lighthouse/overview`; VERIFIED: local CLI `--version`/`--help`; `npm ls lighthouse --all`] |
| Vite production build and preview | Project scripts: `"build": "vite build"` and `"preview": "vite preview"` | Generate and serve the local production preview | These are the existing project commands; avoid the development server so the local reference uses built assets. [VERIFIED: `package.json:12,15`; `vite.config.js`] |

### Supporting

| Tool | Version / State | Purpose | When to Use |
|------|-----------------|---------|-------------|
| Chrome DevTools Lighthouse panel | Included with installed Chrome | Human-driven fallback for report capture and local-page auditing | Use if the local Lighthouse CLI is absent or unusable; the official workflow supports local pages. Save the report JSON and use the Performance panel for the load trace. Do not install a substitute automatically. [CITED: `https://developer.chrome.com/docs/lighthouse/overview`; `https://developer.chrome.com/docs/devtools/performance/reference`] |
| Chrome DevTools Performance / Network panels | Included with installed Chrome | Inspect LCP trace events, network request timing/priority, screenshots, and targeted runtime evidence | Use for trace review and only targeted follow-up animation/long-task traces when the initial evidence warrants them. [CITED: Chrome DevTools Performance reference; Network reference] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing Lighthouse CLI | DevTools Lighthouse panel | The panel avoids package installation and supports local pages, but repeated runs and output naming are more manual. Keep the same version/settings and still save each report and trace. [CITED: Lighthouse overview] |
| Simulated Lighthouse throttling | Chrome DevTools throttling | Different throttling methods can yield non-identical results. Use the method that most closely matches the supplied profile, record it, and do not label a nonmatching profile exact. [CITED: Lighthouse variability; Chrome DevTools throttling docs] |

**Installation:** None for Phase 1. Do not add a package, change a lockfile, or use `npx` to download tools. If the existing CLI is no longer available, use DevTools; any request to install the npm package requires a human verification checkpoint because the package legitimacy check returned `SUS`. [VERIFIED: current package manifest and local `npm ls`; package legitimacy seam; COC audit-only boundary]

## Package Legitimacy Audit

No package installation is planned. The table records the optional tool already present in this worktree because the plan may use its executable. [VERIFIED: `package.json`; local `npm ls lighthouse --all`; package-legitimacy check]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `lighthouse` [WARNING: flagged as suspicious — verify before using.] | npm | Published 2026-10-27 (~20 calendar days before research date) | 7,562,592 weekly | `github.com/GoogleChrome/lighthouse` | SUS (`too-new`) | Existing local executable only; do not install. If absent, use Chrome DevTools; a future install needs `checkpoint:human-verify`. [VERIFIED: package-legitimacy check returned SUS; local executable reports `13.6.0`] |

**Packages removed due to [SLOP] verdict:** none.  
**Packages flagged as suspicious [SUS]:** `lighthouse` — existing copy only; do not add/install without human verification. [VERIFIED: package-legitimacy check]

## Architecture Patterns

### Evidence Flow

```text
Fresh homepage navigation
       |
       +--> Live site (reference only; read-only navigation)
       |       +--> Lighthouse report / trace --> separate live-reference record
       |
       +--> Local production build --> Vite preview --> Chrome mobile emulation
                                       |                    |
                                       |                    +--> Lighthouse JSON metrics
                                       |                    +--> Trace: LCP node/resource
                                       |                    +--> Network timing/priority/dependency tree
                                       |                    +--> Filmstrip and main-thread evidence
                                       |
                                       +--> Public events GET (if configured production API is used)
                                              +--> verify method/status; no booking/payment actions
       |
       +--> Three sequential valid local cold-cache runs
               +--> median + full range; retain valid outliers
               +--> dated human summary appended to docs/performance-baseline.md
               +--> raw JSON/traces remain outside repository and uncommitted
```

The diagram distinguishes the live reference from the local before/after pair and keeps the production API request visible as an external dependency rather than assuming the static preview is fully offline. [VERIFIED: `src/config/api.js:1-13`; `src/services/bookingEnquiry.js:8-24`; COC D-01/D-09/D-11]

### Recommended Project Structure

No source structure changes are required. Research the existing `index.html` preload, `src/pages/Home.jsx` and `Home.css`, route boundary in `src/App.jsx`, Vite build/preview scripts, and `docs/performance-baseline.md`; Phase 1 output is a report summary, not application code. [VERIFIED: files read this session; `package.json:12,15`; COC D-06]

### Pattern 1: Paired, isolated measurements

**What:** Capture the live homepage as a separately labeled reference, then capture the local production preview as its own three-run sample. Keep the same local build, viewport, Lighthouse version, browser, throttling, storage-reset behavior, and screenshot method for the later local after checkpoint. [VERIFIED: COC D-01–D-04; CITED: Lighthouse variability]

**When to use:** Every Phase 1 baseline and its Phase 2/3 local comparison. [VERIFIED: `.planning/ROADMAP.md`; COC D-01–D-04]

**Example (run one CLI capture at a time; create the temporary output directory first):**

```powershell
node .\node_modules\lighthouse\cli\index.js "<local-preview-url>/" `
  --form-factor=mobile `
  --throttling-method=simulate `
  --output=json `
  --output-path="$env:TEMP\vt-phase1\local-run-01.json" `
  --save-assets
```

The observed Lighthouse 13.6 CLI supports these options; its help says `--save-assets` saves trace contents and DevTools logs. The output parent directory must already exist. Run sequentially, rename the run output for each attempt, and do not pass `--disable-storage-reset`; classify the actual resulting profile from the report instead of assuming it exactly matches Moto G Power / Slow 4G. [VERIFIED: local Lighthouse 13.6 `--help`; ASSUMED: `$env:TEMP` is writable in the execution environment]

### Pattern 2: LCP evidence before diagnosis

**What:** From the current Lighthouse report and Chrome Performance trace, record (a) Lighthouse's LCP metric, (b) trace LCP candidate timestamp separately, (c) element selector/node and screenshot/trace reference, (d) resource URL or “no resource” for text candidates, (e) intrinsic and rendered dimensions, loading/fetch priority, request start/end/transfer timing, and (f) TTFB, resource load delay, load time, and render delay. Trace the dependency chain from the document to the candidate resource. [CITED: `https://developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint`; `https://web.dev/articles/optimize-lcp`; `https://developer.chrome.com/docs/performance/insights/network-dependency-tree`; VERIFIED: COC D-07 and LCP-01]

**When to use:** The scored homepage navigation, not a booking/payment route. [VERIFIED: COC D-06/D-11; `.planning/ROADMAP.md` Phase 1]

**Repository observation (not a current measurement):** The HTML head contains a responsive image preload:

```html
rel="preload"
as="image"
href="/assets/optimized/hero/h1-960-v1.webp"
imagesrcset="/assets/optimized/hero/h1-480-v1.webp 480w, /assets/optimized/hero/h1-960-v1.webp 960w, /assets/optimized/hero/h1-1672-v1.webp 1672w"
imagesizes="100vw"
fetchpriority="high"
```

[VERIFIED: `index.html:46-51`; quoted values read from the source this session]

The homepage component conditionally renders hero image elements with the following declared dimensions/loading values:

```jsx
width="1672"
height="941"
loading={index === 0 ? 'eager' : 'lazy'}
fetchPriority={index === 0 ? 'high' : 'auto'}
decoding="async"
```

[VERIFIED: `src/pages/Home.jsx:395-411`; quoted values read from the source this session]

These source declarations are leads only: they do not prove which candidate wins LCP, which `srcset` URL the browser selects, its actual rendered box, or whether the preload matches the measured candidate. Verify those from the current browser report/trace. [VERIFIED: source files read this session; CITED: Chrome LCP docs]

### Pattern 3: Matched screenshot evidence

Use Chrome DevTools device emulation with the exact CSS viewport and DPR recorded for the Lighthouse run. Capture the homepage screenshot with the same method for before/after, at the same scroll position and matching hero-slide state; record the viewport and capture time beside the image. Keep the screenshot separate from the metric evidence—the screenshot is for visual comparison, not a Lighthouse result. [VERIFIED: COC D-10; CITED: Chrome DevTools Performance reference]

### Pattern 4: Build provenance

Before each local checkpoint, record `git rev-parse HEAD`, the worktree status (paths only), Node/npm/Chrome/Lighthouse versions, and a build identifier. A practical local identifier is the SHA-256 digest of the generated build output plus the commit SHA; keep any pre-existing user changes untouched and disclose a dirty worktree without treating unrelated files as Phase 1 edits. This makes the built artifact distinguishable even when the source commit alone does not describe the complete worktree. [VERIFIED: COC D-03; local tool versions; ASSUMED: generated-output digest is an acceptable build identifier]

### Anti-Patterns to Avoid

- **Treating a Lighthouse opportunity estimate as an observed saving:** record the estimate in its own column; separately report the observed request bytes/timing. [VERIFIED: COC D-08; CITED: Lighthouse performance scoring]
- **Combining live and local scores:** the local preview is not a production deployment result. [VERIFIED: COC D-01/D-05]
- **Parallel Lighthouse runs or selecting only the best run:** resource contention and browser variability distort samples; keep three sequential valid runs and retain all valid outliers. [CITED: `https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md`; VERIFIED: COC D-02]
- **Calling an audit lead a cause:** unused-JS/image savings estimates, render-blocking estimates, non-composited-animation flags, DOM size, and long tasks require request/trace evidence and source attribution before Phase 2 scope is chosen. [VERIFIED: COC; CITED: Lighthouse overview; Chrome DevTools Performance reference]
- **Using the development server or a payment route for the scored capture:** use the built preview and homepage only. [VERIFIED: `package.json:12,15`; COC D-06/D-11]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web performance scoring and lab audit | Custom synthetic LCP score or hand-built score calculator | Lighthouse report, preserving the report's stated version/settings | Lighthouse scoring changes across releases, and the report itself distinguishes metrics from opportunity diagnostics. [CITED: Lighthouse overview; Lighthouse performance scoring] |
| Request priority, timing, dependency chain | Scrape source markup and infer the browser waterfall | Chrome Network/Performance panels and Lighthouse trace/network dependency-tree insight | The browser's selected resource, actual request priority, and causal ordering are runtime facts, not safely inferred from source alone. [CITED: Chrome Network reference; Lighthouse 13 network dependency tree] |
| Repeated-run summary | Keep only the best score or average away outliers | Three valid local runs, median and min–max range, failed attempts recorded separately | Lighthouse recommends repeated runs and aggregate summaries; locked project decision specifies three and retaining valid outliers. [CITED: Lighthouse variability; VERIFIED: COC D-02] |

**Key insight:** The old `critical request chains` audit is documented as moved to Lighthouse 13's **Network dependency tree** insight. Plan the Phase 1 analysis around the 13.6 report/trace terminology, not historical audit labels. [CITED: `https://developer.chrome.com/docs/lighthouse/performance/critical-request-chains`; `https://developer.chrome.com/docs/performance/insights/network-dependency-tree`]

## Common Pitfalls

### Pitfall 1: Approximate device/network presented as exact
**What goes wrong:** A local Lighthouse profile is called “Moto G Power / Slow 4G” when its viewport, DPR, CPU slowdown, network latency/throughput, or Lighthouse version differs.  
**Why it happens:** The user-supplied report description does not include every emulation parameter or a saved settings file. [ASSUMED: original full report/settings were not provided in the inspected project context]  
**How to avoid:** Record the actual profile shown by Lighthouse/DevTools and every deviation; say “closest available” unless the conditions match. Chrome CPU throttling is relative to the host machine and is not a physical mobile CPU replica. [CITED: Chrome DevTools Performance reference; DevTools throttling docs; VERIFIED: COC D-04]  
**Warning signs:** Missing device viewport/DPR, unknown CPU/network throttling method, version mismatch, or claiming the user-provided result was reproduced without a saved original report.

### Pitfall 2: Invalid run discarded or valid outlier erased
**What goes wrong:** A valid slow run is removed from the sample, or an invalid page-load/trace is counted as a valid run.  
**Why it happens:** Page/network/browser variability can remain even with controlled settings. [CITED: Lighthouse variability]  
**How to avoid:** Define invalidity before running: CLI/browser failure; wrong URL/environment; navigation error; Lighthouse runtime error or missing required report/trace evidence; wrong emulation settings; or cache not cold. Retry those attempts and record them. Keep every technically valid run, including outliers; stop only when three valid local results exist. [VERIFIED: COC D-02; CITED: Lighthouse variability]  
**Warning signs:** Output files missing, HTTP navigation error, Lighthouse error report, or configuration mismatch. A high/low score alone is not an invalidity criterion.

### Pitfall 3: Confusing candidate and metric LCP
**What goes wrong:** Trace candidate timestamp is substituted for Lighthouse's LCP metric, or phase values are forced to sum to a different metric result.  
**Why it happens:** The metric and trace display are distinct measurements and may not agree exactly. [VERIFIED: COC D-07; prior documented discrepancy is historical, not current evidence]  
**How to avoid:** Report both values, method/source and discrepancy side by side; do not reconcile without evidence. Use the selected element and request timing to explain hypotheses. [CITED: Chrome LCP docs; VERIFIED: COC D-07]  
**Warning signs:** A single unlabeled “LCP” number with no report/trace attribution.

### Pitfall 4: Local preview makes a production API request
**What goes wrong:** The researcher assumes the local preview is offline or interacts with a production transactional endpoint.  
**Why it happens:** The frontend API configuration selects the production base URL in a production build when no Vite API override is set; the homepage requests public events. Vite documents `import.meta.env.PROD` as true for an app built in production mode. [VERIFIED: `src/config/api.js:1-13`; `src/services/bookingEnquiry.js:8-24`; CITED: `https://vite.dev/guide/env-and-mode`]  
**How to avoid:** Limit the preview to homepage navigation; inspect Network requests and confirm no writes or booking/payment requests occurred. The current events call is `fetch(`${API_BASE_URL}/events`, { signal })`; it does not specify a method, so verify the actual method in the Network panel rather than infer runtime behavior from source. Do not click booking/payment controls. If the request fails, note its status and whether it affects the measured page; do not turn an environmental failure into a pass. [VERIFIED: `src/services/bookingEnquiry.js:24`; COC D-11; CITED: `https://vite.dev/guide/env-and-mode`]  
**Warning signs:** Any POST/PUT/PATCH/DELETE, payment-gateway request, booking-enquiry request, or production form submission.

### Pitfall 5: Historical report reused as fresh truth
**What goes wrong:** Prior values in the baseline document or the supplied 2026-11-16 report are presented as today's measurement.  
**Why it happens:** Existing notes contain several separately configured historical live and local audits. [VERIFIED: `docs/performance-baseline.md`; user prompt]  
**How to avoid:** Capture new results; label supplied, historical, fresh live, and fresh local data separately. Append a dated summary rather than rewriting the old record. [VERIFIED: COC D-01/D-09]

### Pitfall 6: Main-thread/animation evidence lacks attribution
**What goes wrong:** A task duration or animation count is used to prescribe code changes without a source stack or reproducible frame evidence.  
**Why it happens:** A trace can show blocked time without identifying the responsible function. A task longer than 50 ms is a long task, but its existence alone does not identify a safe fix. [CITED: `https://web.dev/articles/optimize-long-tasks`; Chrome DevTools Performance reference]  
**How to avoid:** Preserve JS samples in the trace; record task start/duration and available call stack. Only record a focused interaction/animation trace if initial evidence identifies a candidate, and classify unattributed work as unresolved evidence, not a confirmed code cause. [VERIFIED: COC D-06; CITED: Chrome DevTools Performance reference]  
**Warning signs:** A Lighthouse diagnostic count with no trace event, call stack, element, or source attribution.

## Code Examples

### Reproducible capture and evidence checklist

```text
1. Record git HEAD, worktree status, build time/identifier, Node/npm,
   Chrome/Lighthouse versions, URL, viewport/DPR, throttling method/settings,
   cache-reset state, and capture time.
2. Build once; serve only the production preview on loopback.
3. Capture a separately labeled live homepage reference with read-only navigation.
4. Run three local mobile Lighthouse captures sequentially; save JSON and trace/log
   files to a temporary directory outside the repository.
5. For each run, record Lighthouse LCP and trace candidate separately.
6. Extract selector/node, resource URL/currentSrc, intrinsic and rendered size,
   loading/priority, request times and network dependency chain.
7. Record measured request transfer/timing separately from estimated audit savings.
8. Summarize three valid local runs with median and range; list invalid retries.
9. Append dated prose to docs/performance-baseline.md; keep raw artifacts local.
```

The ordered evidence fields follow LCP diagnostic guidance, Chrome's trace/network workflow, and the locked project capture decisions. [CITED: Lighthouse LCP docs; web.dev Optimize LCP; Chrome DevTools Performance and Network references; VERIFIED: COC D-01–D-10]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lighthouse “critical request chains” report item | Lighthouse 13 “Network dependency tree” insight | As of Lighthouse 13 | Inspect the actual current report insight; do not expect the older audit label. [CITED: `https://developer.chrome.com/docs/lighthouse/performance/critical-request-chains`; Lighthouse 13 network dependency tree docs] |
| One Lighthouse score as a stable baseline | Repeated reports summarized as a distribution (median and range) | Lighthouse variability guidance | Use the project-mandated three valid local runs and retain outliers; do not make a conclusion from a single run. [CITED: Lighthouse variability; VERIFIED: COC D-02] |
| Source inspection as proof of the LCP request | Trace/report/network inspection of the current rendered page | Current browser measurement practice | Source shows candidate hints only; runtime evidence establishes chosen image, priority, request timings, and actual dimensions. [CITED: web.dev Optimize LCP; Chrome DevTools Network reference] |

**Deprecated/outdated:** Treat historical Lighthouse 13.6 audit labels and previously recorded performance values as historical. In particular, use the Lighthouse 13 Network dependency tree insight rather than assuming the old critical-request-chains audit remains present. [CITED: Lighthouse 13 migration note; VERIFIED: `docs/performance-baseline.md` is a historical record]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 [ASSUMED] | The full original Moto G Power / Slow 4G Lighthouse settings are not present in the files inspected here; only the user-supplied profile description is available. | Environment / Pitfalls | The exact profile might be reproducible if the original report/settings are found; label all output by actual settings regardless. |
| A2 [ASSUMED] | Lighthouse CLI or DevTools can reach the live homepage and its public resources when the audit is run. | Environment Availability | Live reference may be blocked; use the locked fallback to local preview and make no live-site claim. |
| A3 [ASSUMED] | The local preview's public events request may reach the production API if no API override is provided. | Pitfall 4 | An API failure could change below-fold content; inspect and report the request instead of assuming a fully isolated local app. |
| A4 [ASSUMED] | `$env:TEMP` is writable and excluded from the repository. | CLI example | If not, choose another confirmed local-only directory and verify it is not staged/tracked. |

## Open Questions

1. **What were the exact settings behind the supplied 2026-11-16 Lighthouse report?**
   - What we know: the supplied description says Lighthouse 13.6, Moto G Power emulation, and Slow 4G. [VERIFIED: user-provided phase context]
   - What's unclear: viewport, DPR, CPU rate, network latency/throughput, Chrome version, throttling method, cache state, and original raw report were not provided.
   - Recommendation: use the closest profile available, record all actual parameters, and call it approximate unless a source report proves an exact match. [VERIFIED: COC D-04]
2. **Will the live reference and public events API be reachable during execution?**
   - What we know: no live request was made in this research; local production API fallback is present in source. [VERIFIED: research-session actions; `src/config/api.js:1-13`]
   - What's unclear: runtime availability and effect of any public events response on the current homepage rendering.
   - Recommendation: record statuses; if live audit is unavailable, mark it blocked and continue with local preview only. Do not attempt a transactional route. [VERIFIED: COC D-05/D-11]
3. **Which LCP element and request are current?**
   - What we know: current source contains a responsive hero-image preload and conditional hero `<img>` elements. [VERIFIED: `index.html:46-51`; `src/pages/Home.jsx:395-411`]
   - What's unclear: the candidate selected by a fresh browser run, current `srcset` choice, rendered dimensions, priority, and complete request dependency chain.
   - Recommendation: resolve only from a new Lighthouse report and trace; do not treat source or older audit tables as the answer. [VERIFIED: LCP-01; CITED: Chrome LCP docs]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Vite build, Lighthouse CLI | ✓ | `v24.19.0` | None identified |
| npm on Windows | Existing build/preview scripts | ✓ via `npm.cmd`; `npm.ps1` is blocked by execution policy in this shell | `11.17.0` | Invoke `npm.cmd` |
| Chrome | Lighthouse and DevTools | ✓ | `157.0.8103.52` | DevTools workflow only if CLI launch fails |
| Lighthouse CLI | Repeated reports and saved traces | ✓, local extraneous package | `13.6.0` | Chrome DevTools Lighthouse panel; do not auto-install |
| Vite build/preview scripts | Local production baseline | Script exists; build/preview not run in this research | Repository script values quoted above | If build/preview fails, report local evidence blocked; no dev-server substitute for the scored production preview |
| Live homepage/public network | Separate read-only reference | Not probed | — | Follow D-05; local preview can proceed, with live reference marked blocked |
| Moto G Power exact profile | Condition matching | Not verified | — | Closest available mobile profile with all differences documented |

Tool/version observations are from commands run in this session; availability does not imply a Lighthouse run or live-site audit was performed. [VERIFIED: local runtime probes; package legitimacy check; research-session actions]

**Missing dependencies with no fallback:** None identified for local evidence capture.  
**Missing dependencies with fallback:** Exact Moto G Power profile and live-site reachability are unverified; use the documented approximation/local-only fallback, respectively. [VERIFIED: COC D-04/D-05; session availability probes]

## Validation Architecture

`workflow.nyquist_validation` is enabled; `.planning/config.json` contains `"nyquist_validation": true` and `"security_enforcement": true`. [VERIFIED: `.planning/config.json:25,49`; quoted values read this session]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner is declared in the root package scripts; Phase 1 has no application-code change and needs no new unit test. [VERIFIED: `package.json:14`] |
| Config file | No performance-test configuration is needed for this audit; Lighthouse is the browser evidence tool. [VERIFIED: `package.json`; local project scripts inspection] |
| Quick run command | `npm.cmd run build`, then `npm.cmd run preview -- --host 127.0.0.1 --strictPort` for the local production preview. [VERIFIED: `package.json:12,15`; `vite.config.js`] |
| Full suite command | Not required for this audit-only phase; do not treat a test suite result as evidence of LCP. [VERIFIED: Phase boundary in CONTEXT.md and ROADMAP.md] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LCP-01 | Current mobile homepage evidence identifies LCP node/resource, rendered dimensions, loading priority, request timing, phase breakdown, and dependency chain. | Manual evidence review of Lighthouse JSON + saved Chrome trace/network log | Lighthouse CLI command in Architecture Pattern 1; three sequential local captures | Reports/traces created during execution; not committed |

### Sampling Rate

- **Per task commit:** No implementation commits in this phase; validate each capture against run settings and required trace fields. [VERIFIED: phase boundary]
- **Per wave merge:** Not applicable; this is audit-only. [VERIFIED: phase boundary]
- **Phase gate:** Three valid local cold-cache captures; median and range; complete LCP evidence; live capture separately labeled or explicitly blocked; dated human summary appended without application-code edits. [VERIFIED: COC D-01–D-10; `.planning/ROADMAP.md` Phase 1 success criteria]

### Wave 0 Gaps

- [ ] None for application tests. At execution, create only a local temporary report/trace directory; no framework or package install is required. [VERIFIED: package manifest and Phase 1 boundary]

## Security Domain

Security enforcement is enabled in the project configuration. Audit scope is the public homepage; live navigation is read-only and no real booking/payment or account operation is permitted. [VERIFIED: `.planning/config.json:49`; COC D-06/D-11]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Do not authenticate to admin or account routes for this public-homepage measurement. [VERIFIED: COC D-06] |
| V3 Session Management | No | Do not use authenticated sessions or capture authenticated pages. [VERIFIED: COC D-06/D-11] |
| V4 Access Control | Yes, as audit boundary | Target only the public homepage; do not access or modify production bookings, payment, admin, or account state. [VERIFIED: COC D-06/D-11] |
| V5 Input Validation | Limited | Use a fixed homepage URL and explicit local preview URL; do not submit forms or arbitrary payloads. [VERIFIED: COC D-06/D-11] |
| V6 Cryptography | No code change | Do not inspect, export, or alter secrets; no cryptographic implementation is part of the phase. [VERIFIED: phase boundary; project instructions] |

### Known Threat Patterns for browser performance auditing

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental production write through a test interaction | Tampering | Navigation-only homepage audit; confirm network methods; no booking/payment clicks or submissions. [VERIFIED: COC D-11; `src/services/bookingEnquiry.js:24`] |
| Sensitive headers, cookies, or response data retained in traces | Information Disclosure | Save raw JSON/traces only to a local temporary directory; do not upload, gist, commit, or paste them externally; review before sharing. [VERIFIED: COC D-09; CITED: Lighthouse JSON export docs] |
| Production API unexpectedly called from local production preview | Tampering / Information Disclosure | Inspect the homepage network log and allow only the public read-only events fetch; stop if transactional methods/endpoints appear. [VERIFIED: `src/config/api.js:1-13`; `src/services/bookingEnquiry.js:8-24`; COC D-11] |

## Project Constraints (from copilot-instructions.md)

- Use GSD entry points before file-changing work; this research is within the phase workflow and writes only the requested research artifact. [CITED: `.github/copilot-instructions.md`]
- Do not make direct repository edits outside a GSD workflow unless explicitly asked to bypass it. [CITED: `.github/copilot-instructions.md`]
- Preserve existing routes, APIs, responsive behavior, booking/ticket flows, payment integrations and verification, webhooks, notifications, login, and admin authentication; do not change payment logic or database schemas. [VERIFIED: `.planning/PROJECT.md`; `.planning/REQUIREMENTS.md`; COC D-11]
- This audit is frontend-performance-only. The caller warns the codebase map is stale for backend and `.github` changes; treat those map portions as approximate and do not broaden the audit into those areas. [ASSUMED: caller-provided map-staleness caveat]
- Existing working-tree changes in `src/pages/BookingPayment.jsx` and `src/pages/BookingPayment.css` belong to the user. Do not read, edit, format, stage, revert, or treat them as Phase 1 work. Record source/build provenance without including their contents. [VERIFIED: explicit user scope]
- Frontend conventions for any later implementation are semicolonless JavaScript, single-quoted imports, and trailing commas in multiline structures; Phase 1 makes no source edits. [VERIFIED: `.github/copilot-instructions.md` project context]

## Sources

### Primary (HIGH confidence)

- `E:\club\.planning\phases\01-mobile-baseline-evidence-audit\01-CONTEXT.md` — locked scope, conditions, and safety boundaries.
- `E:\club\.planning\REQUIREMENTS.md` — LCP-01 definition and future performance requirements.
- `E:\club\.planning\ROADMAP.md` — Phase 1 boundary and success criteria.
- `E:\club\package.json`, `E:\club\index.html`, `E:\club\src\pages\Home.jsx`, `E:\club\src\App.jsx`, `E:\club\src\config\api.js`, `E:\club\src\services\bookingEnquiry.js`, `E:\club\vite.config.js` — current frontend scripts, route/lazy boundary, preload, image declarations, API fallback, and preview/build configuration, read this session.
- Local Chrome/Lighthouse CLI version/help and package-legitimacy checks — current tool versions/options and package disposition.

### Secondary (MEDIUM confidence)

- [Lighthouse overview and JSON output](https://developer.chrome.com/docs/lighthouse/overview) — supported workflows and report export.
- [Lighthouse LCP diagnostic](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint) — element reporting and image LCP subparts.
- [Chrome DevTools Performance reference](https://developer.chrome.com/docs/devtools/performance/reference) — load traces, screenshots, CPU/network capture settings.
- [Chrome DevTools Network reference](https://developer.chrome.com/docs/devtools/network/reference) — cache disabling, screenshots, network throttling and request analysis.
- [Chrome DevTools throttling settings](https://developer.chrome.com/docs/devtools/settings/throttling) — CPU calibration and custom network profiles.
- [Lighthouse score variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md) — run variability, repeated runs, aggregation, and avoiding concurrent runs.
- [Lighthouse critical request chains migration note](https://developer.chrome.com/docs/lighthouse/performance/critical-request-chains) and [Network dependency tree insight](https://developer.chrome.com/docs/performance/insights/network-dependency-tree) — Lighthouse 13 terminology.
- [web.dev: Optimize LCP](https://web.dev/articles/optimize-lcp) — LCP waterfall and subpart analysis.
- [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks) — long-task definition and trace interpretation.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — local Chrome and Lighthouse version checked; Lighthouse package is locally extraneous and legitimacy seam flagged it SUS, so do not install automatically.
- Architecture: HIGH — current frontend source/config and relevant project decisions were read this session; runtime LCP remains unmeasured.
- Pitfalls: MEDIUM — Lighthouse/Chrome official docs and project safety constraints cross-checked; actual run variability and request behavior still need execution evidence.

**Research date:** 2026-11-16  
**Valid until:** 2026-11-23 (tool versions and browser UI change quickly; recheck installed versions/settings during execution).
