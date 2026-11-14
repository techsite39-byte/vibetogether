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

## Changes and validation

- Deferred the homepage video and category sections until near the viewport, while keeping the first hero image eager and high priority.
- Lazy-loaded the booking journey and admin layout; removed the extra three-second wait after the intro video ends.
- Batched hero pointer updates with animation frames and used `ResizeObserverEntry.contentRect` for carousel sizing.
- Added image dimensions, corrected two accessibility labels, and reused existing optimized image assets.
- Configured immutable caching for hashed build assets.
- Updated the homepage metadata and static AI discovery documents; verified local `robots.txt`, sitemap, `llms.txt`, AI catalog, and ARD manifest responses and content types.

Validation completed: production build passed; focused tests passed (4/4); targeted lint passed and full lint exited successfully with pre-existing warnings; the homepage and lazy booking modal were checked in a browser. The full `npm test` run stalled after 15 reported tests for more than 30 minutes and was stopped, so the full suite has no verified result. The local backend is unavailable and its events/settings APIs returned 502; event-backed booking, payment completion, QR scanning, and all routes/buttons were not fully verified. No production deployment was made.

The local preview scores do not meet the requested performance targets. TBT is the largest remaining issue; Lighthouse attributes the mobile long task to the initial JavaScript entry bundle. Non-composited CSS animations and additional image savings also remain. Best Practices scored 96 rather than 100 in these local audits.
