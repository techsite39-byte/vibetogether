# Vibe Together performance baseline

Captured 14 November 2026, before performance changes. No production deployment was made.

## Lighthouse results supplied for the baseline

| Metric | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 73 | 68 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 82 | 82 |
| First Contentful Paint | 1.7 s | 0.5 s |
| Largest Contentful Paint | 60.4 s | 9.7 s |
| Total Blocking Time | 70 ms | 10 ms |
| Cumulative Layout Shift | 0.009 | 0 |
| Speed Index | 3.4 s | 2.9 s |
| Total network payload | 16.5 MB | 19.5 MB |

These are the user-provided Lighthouse 13.6 results; they are retained separately from the audit below because scores vary with the run environment.

## Independent mobile audit

An independent Lighthouse 13.6.0 mobile navigation audit of `https://www.vibetogether.show/` was run before changes. It reported Performance 44, Accessibility 96, Best Practices 100, SEO 83; FCP 2.0 s, LCP 60.2 s, TBT 990 ms, CLS 0.009, Speed Index 7.7 s, and 15,415 KiB total transfer size. The result differs from the supplied baseline and should not be compared as if it were the same run configuration.

## Independent desktop audit

An independent Lighthouse 13.6.0 desktop navigation audit of the same URL was run before changes. It reported Performance 45, Accessibility 96, Best Practices 100, SEO 83; FCP 0.7 s, LCP 9.8 s, TBT 470 ms, CLS 0.004, Speed Index 4.4 s, and 17,250 KiB total transfer size. Both independent runs used Lighthouse's default mobile or desktop configuration, respectively.

Lighthouse identified the LCP candidate in both runs as the first homepage hero slide: `.home-hero__image--1`, with the `/h1.png` CSS background. Its LCP request-discovery audit found no high-priority hint. The image-delivery audit reported 10,493 KiB of potential mobile savings; the four hero PNGs alone total 10,115 KiB:

| Asset | Dimensions | Original size |
| --- | ---: | ---: |
| `/h1.png` | 1672 × 941 | 1,984,137 bytes |
| `/h2.png` | 1672 × 941 | 3,056,141 bytes |
| `/h3.png` | 1672 × 941 | 3,239,955 bytes |
| `/h4.png` | 1672 × 941 | 2,077,888 bytes |

Other findings in the mobile run: 1,100 ms estimated render-blocking savings; 16 KiB unused CSS; 45 KiB unused JavaScript; and a forced-reflow insight attributing 349.7 ms to the homepage bundle. The page had 667 DOM elements in that audit.

## Repository and live-site observations

- The frontend is a React 19 single-page application built with Vite 8. Public pages, event details, booking/payment pages, account pages, and admin pages are declared in `src/App.jsx`; page components are already route-lazy-loaded.
- The hero is a four-slide CSS-background carousel. All four background URLs are assigned at initial render, so the browser can request the complete set before later slides are needed.
- The home experience carousel marks its images eager. Several images use width-bounded Unsplash URLs, but the hero and other local PNG files are substantially larger than their rendered use.
- Global CSS imports a Google Fonts stylesheet for six families, including Playfair Display and Cormorant Garamond; both are used in component CSS, so they cannot be removed without a typography change.
- A production build succeeds. Baseline largest bundles: shared JavaScript 539.92 kB (160.84 kB gzip), homepage JavaScript 132.19 kB (29.39 kB gzip), shared CSS 121.67 kB (23.26 kB gzip), and homepage CSS 98.05 kB (19.77 kB gzip).
- `robots.txt`, `sitemap.xml`, `llms.txt`, and `ai-catalog.json` all returned the SPA HTML document (`text/html`, 840 bytes) instead of their expected content types. The homepage had no description or canonical link, and its title was only `VIBE TOGETHER`.
- The existing deployment configuration is in `vercel.json` and `render.yaml`. The backend is a separate Render service; payment and booking APIs are not part of the static frontend build.
- The worktree already contained untracked files under `public/assets/folder/qr*`; they were present before this work and are out of scope.

## Route inventory

Public: `/`, `/about`, `/events`, `/events/:id`, `/booking`, `/booking/:eventId`, `/booking/confirmation`, `/booking/confirmation/:bookingReference`, `/booking/payment/:requestId`, `/booking/step-4/:requestId`, `/my-bookings`, `/sing-along`, `/strangers-meet`, `/strangers-trip`, `/fun-games`, `/services`, `/gallery`, `/testimonials`, `/contact`, and the not-found route.

Admin: `/admin/login`, `/admin`, `/admin/dashboard`, `/admin/users`, `/admin/organizers`, `/admin/events`, `/admin/bookings`, `/admin/testimonials`, `/admin/subscribers`, `/admin/enquiries`, `/admin/analytics`, `/admin/activity`, `/admin/settings`, `/admin/gallery`, and the admin not-found route.

## Post-change local preview audit

Captured 14 November 2026 against the local Vite preview at `http://127.0.0.1:4173` with Lighthouse 13.6.0. These are local results, not a production-site audit, and are not directly comparable to the user-provided baseline above.

| Metric | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 44 | 50 |
| Accessibility | 100 | 100 |
| Best Practices | 96 | 96 |
| SEO | 100 | 100 |
| First Contentful Paint | 1.0 s | 0.3 s |
| Largest Contentful Paint | 4.7 s | 2.5 s |
| Total Blocking Time | 6,550 ms | 1,540 ms |
| Cumulative Layout Shift | 0 | 0.009 |
| Speed Index | 9.3 s | 3.1 s |
| Total network payload | 1,417 KiB | 2,398 KiB |

An earlier local-preview run recorded Mobile Performance 39, LCP 8.37 s, TBT 4,175 ms, and 1,468,739 bytes; Desktop Performance 94, LCP 1.35 s, TBT 90 ms, and 1,848,524 bytes. Relative to that run, the latest mobile LCP improved, while mobile TBT increased. Desktop LCP, TBT, payload, and Performance score regressed. The captured results do not support claiming an overall performance improvement, and the desktop regression remains unresolved.

The measured LCP element is the first hero slide, now a responsive `<img>` using `h1-960-v1.webp` on mobile (50,824 bytes), with `fetchpriority="high"` and an eager load. The LCP candidate therefore changed from the CSS background `/h1.png` found in the pre-change live audit to the responsive WebP image. The test environments differ, so the timings should not be read as a controlled live-site before/after comparison.

The existing optimized WebP hero variants total 1,053,528 bytes at 1672px versus 10,358,121 bytes across the four original PNGs (about 89.8% smaller). Those variants predated this pass; no original images were replaced and no image files were newly encoded. The post-change image-delivery audit still estimates 44 KiB (mobile) and 22 KiB (desktop) of savings. It flags additional compression for the hero image and the 256px logo variant currently rendered at about 44–54px.

The post-change mobile audit reports zero unused CSS, down from 16 KiB in the earlier mobile baseline, and 54 KiB of estimated unused JavaScript, versus 45 KiB in the earlier independent live audit. The initial entry chunk is 148,889 bytes; the production build splits below-the-fold homepage sections and route-specific code. The local audit also reports 270 ms of estimated savings from render-blocking CSS and a 1.9 s longest network dependency chain on mobile.

## Latest follow-up local preview audit

Captured against `http://127.0.0.1:4173` with Lighthouse 13.6.0 after the homepage carousel preload change. This is a local preview result, not a production audit or a controlled comparison with the user-provided live-site baseline.

| Metric | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 44 | 61 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| First Contentful Paint | 1.0 s | 0.3 s |
| Lighthouse Largest Contentful Paint | 6.0 s | 1.6 s |
| Total Blocking Time | 8,650 ms | 1,780 ms |
| Cumulative Layout Shift | 0.009 | 0.005 |
| Speed Index | 5.4 s | 1.8 s |
| Total network transfer | 1,012 KiB | 1,097 KiB |
| Estimated image-delivery savings | 236 KiB | 335 KiB |
| Estimated unused JavaScript | 54 KiB | 54 KiB |

### LCP evidence and limits

Both Chrome traces identify the first hero image as the LCP candidate:

| Device | LCP resource | Request interval | Trace-observed candidate | Lighthouse breakdown |
| --- | --- | ---: | ---: | --- |
| Mobile | `/assets/optimized/hero/h1-960-v1.webp` | 303–542 ms (239 ms) | 3,365 ms | TTFB 285 ms; load delay 18 ms; download 239 ms; render delay 2,823 ms |
| Desktop | `/assets/optimized/hero/h1-1672-v1.webp` | 33–57 ms (24 ms) | 3,204 ms | TTFB 17 ms; load delay 16 ms; download 24 ms; render delay 3,147 ms |

The Lighthouse LCP metric (6.0 s mobile, 1.6 s desktop) does not match the trace-observed candidate timing or the corresponding breakdown totals (3.365 s mobile, 3.204 s desktop). Treat these as discrepant measurements, not as one consistent before/after result. The image is discovered early and downloads quickly; the large reported render delay is the material LCP concern.

The mobile trace contains a 1,848 ms `CrRendererMain` task from 1,525 ms to 3,373 ms, overlapping the hero LCP at 3,365 ms. The desktop trace contains a 1,689 ms `CrRendererMain` task from 1,109 ms to 2,798 ms, followed by the LCP candidate at 3,204 ms. Lighthouse reports nine mobile and three desktop long tasks; its largest entries are unattributed (7,391 ms mobile and 1,689 ms desktop), with smaller document and entry-script entries. The trace has no usable JavaScript call-stack attribution for the long tasks, so it does not identify a source function or dependency that can be safely optimized. The task is not considered fixed.

The hero's existing opacity transition was preserved; an earlier isolated attempt to remove the fade did not measurably improve LCP and was reverted. The `h2-960-v1.webp` request seen before LCP is also used by a below-the-fold story image, so that request alone does not show that the carousel loaded its next slide early. The observer-based carousel preloader remains gated on the first hero LCP candidate, with a timeout fallback.

### Hero image size audit

The four original PNGs remain intact. The already-existing 1672px WebP variants have the following on-disk sizes:

| Original | Dimensions | Original size | 1672px WebP | WebP size | Saved |
| --- | ---: | ---: | --- | ---: | ---: |
| `h1.png` | 1672 × 941 | 1,984,137 bytes | `h1-1672-v1.webp` | 109,232 bytes | 94.5% |
| `h2.png` | 1672 × 941 | 3,056,141 bytes | `h2-1672-v1.webp` | 357,632 bytes | 88.3% |
| `h3.png` | 1672 × 941 | 3,239,955 bytes | `h3-1672-v1.webp` | 408,416 bytes | 87.4% |
| `h4.png` | 1672 × 941 | 2,077,888 bytes | `h4-1672-v1.webp` | 178,248 bytes | 91.4% |
| **Total** | | **10,358,121 bytes** | | **1,053,528 bytes** | **89.8%** |

These conversions predate this follow-up; no new image files were encoded. The latest Lighthouse image audit still estimates 236 KiB (mobile) and 335 KiB (desktop) of additional savings. Latest transfer size was 1,012 KiB mobile and 1,097 KiB desktop; an earlier nearby local run measured about 1,180 KiB and 1,110 KiB, respectively. These runs are variable and do not establish a controlled payload reduction.

The latest build already splits route and below-the-fold homepage code. Its entry JavaScript chunk is about 490.12 kB (149.19 kB gzip) and the homepage chunk about 46.5 kB (9.81 kB gzip). The latest trace does not establish which code accounts for the long tasks, so these bundle sizes alone are not evidence that a specific dependency caused the observed LCP delay.

## Changes and validation

- Deferred the homepage video and category sections until near the viewport, while keeping the first hero image eager and high priority.
- Deferred next-slide carousel preloading until the first hero image is observed as the LCP candidate, with a timeout fallback.
- Lazy-loaded the booking journey and admin layout; removed the extra three-second wait after the intro video ends.
- Batched hero pointer updates with animation frames and used `ResizeObserverEntry.contentRect` for carousel sizing.
- Added image dimensions, corrected two accessibility labels, and reused existing optimized image assets.
- Configured immutable caching for hashed build assets.
- Updated the homepage metadata and static AI discovery documents; verified local `robots.txt`, sitemap, `llms.txt`, AI catalog, and ARD manifest responses and content types.

Validation completed: production build passed; focused tests passed (4/4); targeted lint passed; the homepage and lazy booking modal were checked in a browser. The full `npm test` run stalled after 15 reported tests for more than 30 minutes and was stopped, so the full suite has no verified result. The local backend is unavailable and its events/settings APIs returned 502; event-backed booking, payment completion, QR scanning, and all routes/buttons were not fully verified. No production deployment was made.

The latest local preview results do not meet the requested performance or LCP targets. TBT remains high and long-task source attribution is unresolved; the trace establishes main-thread blocking but not the responsible code. Additional image savings remain. Lighthouse reported Best Practices 100 in the latest run; earlier local runs reported 96, another sign that results vary across runs. Do not treat these local results as production scores.

## Site-wide route optimization follow-up

Captured 14 November 2026 on the local Vite preview at `http://127.0.0.1:4173`, after the route-level changes below. This was an integrated-browser check, not a Lighthouse run or a controlled before/after performance audit.

- The global hero-image preload is now injected only when the requested path is `/`. Browser DOM checks found zero hero-image preloads on `/about` and one responsive preload on `/`.
- Public event results are cached in memory for 30 seconds after a successful, validated response. Each caller gets a fresh array and event objects; aborted requests and failures are not served from cache. A browser test with a mocked events endpoint navigated `/events` → `/sing-along` → `/events` and observed one GET total.
- Suspense fallbacks now sit within the public and authenticated admin page shells, so route chunks can load without replacing the shared navigation/footer or admin shell. Lazy loading remains in place; no package dependencies were removed.
- Direct navigation covered 34 public, booking/payment, not-found, login, and admin URLs. All returned the SPA shell with HTTP 200; unauthenticated admin URLs redirected to `/admin/login`. One mobile sweep (390 × 844) checked 20 representative public, booking, payment, and login routes and found no horizontal overflow.
- A single local mobile route sweep measured direct-navigation completion from 377 ms to 1,773 ms (median 744 ms); the desktop sweep had a 756 ms median and 3,692 ms maximum. These include browser/cache and route-settling variation and are not FCP/LCP or comparable Lighthouse metrics.
- The mobile menu opened, navigated to About, closed, and retained the layout without horizontal overflow. The local browser could not exercise real event-backed booking/payment flows; test IDs were placeholders and no payment was initiated.

### Image inventory and delivery check

The local `public/assets` tree contains 35 image files totaling 9.68 MiB, excluding the preserved QR capture directory. The source references the optimized counterparts below; original files remain in place. These optimizations existed before this follow-up and were measured here for verification, not newly generated:

| Original image | Original dimensions / bytes | Existing optimized image | Optimized dimensions / bytes | Smaller |
| --- | ---: | --- | ---: | ---: |
| `assets/folder/sub.png` | 1122 × 1402 / 1,944,559 | `sub-480-v1.webp` | 480 × 600 / 43,826 | 97.7% |
| `assets/folder/footer.png` | 2048 × 768 / 1,577,339 | `footer-1536-v1.webp` | 1536 × 576 / 47,920 | 97.0% |
| `assets/folder/favicon.png` | 1254 × 1254 / 1,436,740 | `favicon-192-v1.png` | 192 × 192 / 52,683 | 96.3% |
| `assets/music-speakers.png` | 900 × 805 / 716,544 | `music-speakers-720-v1.webp` | 720 × 644 / 102,220 | 85.7% |
| `assets/dj-party.png` | 650 × 540 / 506,263 | `dj-party-650-v1.webp` | 650 × 540 / 71,470 | 85.9% |
| `assets/festival-crowd.png` | 470 × 576 / 403,920 | `festival-crowd-480-v1.webp` | 470 × 576 / 48,560 | 88.0% |
| `assets/outdoor-dj-festival.png` | 499 × 318 / 306,289 | `outdoor-dj-festival-480-v1.webp` | 480 × 306 / 33,828 | 89.0% |
| `assets/folder/image.png` | 728 × 554 / 275,372 | `image-480-v1.webp` | 480 × 365 / 26,206 | 90.5% |
| `assets/neon-masquerade-mask-1.png` | 503 × 276 / 263,533 | `neon-masquerade-mask-1-v1.webp` | 503 × 276 / 32,294 | 87.7% |
| `assets/crowd-silhouettes.png` | 728 × 265 / 230,761 | `crowd-silhouettes-v1.webp` | 728 × 265 / 30,384 | 86.8% |
| **Total for these pairs** | **7,661,320 bytes** | | **489,391 bytes** | **93.6%** |

This on-disk comparison is not a measurement of per-route transfer savings: the original files remain available and are not referenced by the scanned source paths. Several images use single optimized sizes rather than `srcset`; the hero and remote Unsplash photos retain responsive sources. The QR capture files were excluded and left unchanged.

No new image files were encoded or replaced in this follow-up. The previously documented WebP assets and lazy/responsive image behavior remain unchanged. During the local route sweep, API requests were aborted by full-page test navigations and protected admin requests returned 401; no repeatable backend/database bottleneck evidence was obtained, so no query changes were made.

Validation: the production build passed; the focused event-cache tests passed (2/2); and lint exited successfully with six existing warnings in unrelated files. The full `npm test` run did not complete within 120 seconds and was stopped; its partial output showed 13 passing tests, so the complete suite remains unverified. No fresh Lighthouse audit or production deployment was performed; Lighthouse scores and new payload reductions are therefore not claimed for this follow-up.
