# Phase 01: Mobile Baseline & Evidence Audit - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| Evidence File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `docs/performance-baseline.md` | documentation | file-I/O | `docs/performance-baseline.md` | exact |
| `index.html` | config | request-response | `index.html` | exact |
| `src/pages/Home.jsx` | component | request-response | `src/pages/Home.jsx` | exact |
| `src/pages/Home.css` | component | transform | `src/pages/Home.css` | exact |
| `src/App.jsx` | route | request-response | `src/App.jsx` | exact |
| `package.json` | config | build/preview | `package.json` | exact |
| `vite.config.js` | config | transform | `vite.config.js` | exact |

## Pattern Assignments

### `docs/performance-baseline.md` (documentation, file-I/O)

**Analog:** `docs/performance-baseline.md`

**Evidence separation pattern** (lines 1-20):
```md
# Vibe Together performance baseline

Captured 14 November 2026, before performance changes. No production deployment was made.

## Lighthouse results supplied for the baseline

| Metric | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 73 | 68 |
```

**Historical-vs-current measurement rule** (lines 20-31):
```md
## Independent mobile audit

An independent Lighthouse 13.6.0 mobile navigation audit of `https://www.vibetogether.show/` was run before changes. It reported ...

The result differs from the supplied baseline and should not be compared as if it were the same run configuration.
```

This is the canonical pattern for Phase 01: append a dated summary to the existing baseline, keep raw reports local, and explicitly label older runs as historical when the environment differs.

---

### `index.html` (config, request-response)

**Analog:** `index.html`

**Critical-resource bootstrap pattern** (lines 1-52):
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="preload"
  as="image"
  href="/assets/optimized/hero/h1-960-v1.webp"
  imagesrcset="/assets/optimized/hero/h1-480-v1.webp 480w, /assets/optimized/hero/h1-960-v1.webp 960w, /assets/optimized/hero/h1-1672-v1.webp 1672w"
  imagesizes="100vw"
  fetchpriority="high"
/>
```

**Document metadata and LCP candidate hints** (lines 8-40):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="Vibe Together brings people together through live music, social events, community meetups, games, and shared adventures. Discover your next experience." />
<link rel="canonical" href="https://www.vibetogether.show/" />
<meta property="og:image" content="https://www.vibetogether.show/assets/optimized/hero/h1-1672-v1.webp" />
<title>Vibe Together | Live Music & Social Experiences</title>
```

This is the exact resource/bootstrap layer to inspect before claiming the homepage LCP candidate. It shows the initial document hints and the actual preloaded hero asset.

---

### `src/pages/Home.jsx` (component, request-response)

**Analog:** `src/pages/Home.jsx`

**Hero slide source declarations** (lines 1-40 and 385-411 in the project file):
```jsx
const heroBackgroundSlides = [
  {
    src: '/assets/optimized/hero/h1-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h1-480-v1.webp 480w, /assets/optimized/hero/h1-960-v1.webp 960w, /assets/optimized/hero/h1-1672-v1.webp 1672w',
  },
  {
    src: '/assets/optimized/hero/h2-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h2-480-v1.webp 480w, /assets/optimized/hero/h2-960-v1.webp 960w, /assets/optimized/hero/h2-1672-v1.webp 1672w',
  },
  {
    src: '/assets/optimized/hero/h3-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h3-480-v1.webp 480w, /assets/optimized/hero/h3-960-v1.webp 960w, /assets/optimized/hero/h3-1672-v1.webp 1672w',
  },
  {
    src: '/assets/optimized/hero/h4-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h4-480-v1.webp 480w, /assets/optimized/hero/h4-960-v1.webp 960w, /assets/optimized/hero/h4-1672-v1.webp 1672w',
  },
]
```

**Image rendering and priority pattern** (Home source declarations):
```jsx
<img
  src={slide.src}
  srcSet={slide.srcSet}
  width="1672"
  height="941"
  loading={index === 0 ? 'eager' : 'lazy'}
  fetchPriority={index === 0 ? 'high' : 'auto'}
  decoding="async"
/>
```

**Carousel preload gate pattern** (component effect logic):
```jsx
const [activeHeroSlide, setActiveHeroSlide] = useState(0)
const [loadedHeroSlides, setLoadedHeroSlides] = useState([0])
const [prefersReducedMotion, setPrefersReducedMotion] = useState(
  () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
)

if (prefersReducedMotion) {
  return undefined
}

const preloadImage = new window.Image()
preloadImage.sizes = '100vw'
preloadImage.srcset = heroBackgroundSlides[nextSlide].srcSet
preloadImage.src = heroBackgroundSlides[nextSlide].src
```

This is the homepage evidence source for identifying the actual LCP resource, rendered dimensions, and whether the browser is preloading the correct next slide.

---

### `src/pages/Home.css` (component, transform)

**Analog:** `src/pages/Home.css`

**Hero stack and LCP styling pattern** (lines 1-145):
```css
.home-hero {
  position: relative;
  display: grid;
  min-height: min(58rem, calc(100svh - 5.25rem));
  align-items: center;
  isolation: isolate;
  overflow: hidden;
  background: var(--color-background);
}

.home-hero__image,
.home-hero__backdrop,
.home-hero__particles,
.home-hero__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.home-hero__image {
  z-index: -3;
  width: 100%;
  height: 100%;
  background-color: var(--color-background);
  opacity: 0;
  transform: translate3d(0, var(--hero-scroll-y, 0px), 0)
    scale(var(--hero-scroll-scale, 1));
  transition: opacity 1200ms ease-in-out;
  will-change: transform;
}
```

**Active-image visibility and object-fit pattern** (lines 90-150):
```css
.home-hero__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 52%;
}

.home-hero__image.is-active {
  opacity: 1;
}
```

Use this CSS to correlate hero layering, image size, and transition behavior with the observed LCP element and render delay in the trace.

---

### `src/App.jsx` (route, request-response)

**Analog:** `src/App.jsx`

**Route shell and lazy-load pattern** (lines 1-100):
```jsx
const Dashboard = lazy(() => import('./admin/pages/Dashboard.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const BookingPayment = lazy(() => import('./pages/BookingPayment.jsx'))
const EventDetails = lazy(() => import('./pages/EventDetails.jsx'))
const Events = lazy(() => import('./pages/Events.jsx'))

<Route element={<MainLayout />}>
  <Route index element={<Home />} />
  <Route path="about" element={<About />} />
  <Route path="events" element={<Events />} />
  <Route path="events/:id" element={<EventDetails />} />
  <Route path="booking/payment/:requestId" element={<BookingPayment />} />
</Route>
```

This is the existing route boundary pattern for understanding the homepage-first audit scope and for confirming that the homepage is the right page for the primary LCP baseline, without changing application behavior or route composition.

---

### `package.json` (config, build/preview)

**Analog:** `package.json`

**Production build and preview commands** (lines 1-24):
```json
"scripts": {
  "dev": "node scripts/start-dev.js",
  "build": "vite build",
  "lint": "oxlint",
  "test": "node --test",
  "preview": "vite preview"
}
```

**Tools used for the local baseline** (lines 9-25):
```json
"dependencies": {
  "react": "^19.3.1",
  "react-dom": "^19.3.1",
  "react-router-dom": "^7.18.5"
},
"devDependencies": {
  "@vitejs/plugin-react": "^6.1.2",
  "vite": "^8.3.6"
}
```

This is the source of truth for generating a local production preview baseline without modifying app code or adding dependency tooling.

---

### `vite.config.js` (config, transform)

**Analog:** `vite.config.js`

**Build output and chunking pattern** (lines 1-24):
```js
export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: 'build-assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }
        },
      },
    },
  },
})
```

**Local preview proxy** (lines 22-30):
```js
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:4000',
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  },
}
```

This is the current build and preview configuration to preserve for the local same-environment baseline. It also explains why the homepage performance audit must keep network dependencies visible and separate from the legacy historical baselines.

## Shared Patterns

### Evidence separation and not-a-current-measurement rule
**Source:** `docs/performance-baseline.md`
**Apply to:** every audit entry and any later local comparison.
```md
These are the user-provided Lighthouse 13.6 results; they are retained separately from the audit below because scores vary with the run environment.

The result differs from the supplied baseline and should not be compared as if it were the same run configuration.
```

### Homepage LCP resource declaration
**Source:** `index.html` + `src/pages/Home.jsx`
**Apply to:** the homepage audit for candidate selection and request-path inspection.
```html
<link rel="preload" as="image" href="/assets/optimized/hero/h1-960-v1.webp" imagesrcset="/assets/optimized/hero/h1-480-v1.webp 480w, /assets/optimized/hero/h1-960-v1.webp 960w, /assets/optimized/hero/h1-1672-v1.webp 1672w" imagesizes="100vw" fetchpriority="high" />
```

```jsx
loading={index === 0 ? 'eager' : 'lazy'}
fetchPriority={index === 0 ? 'high' : 'auto'}
decoding="async"
```

### Route shell + lazy loading boundary
**Source:** `src/App.jsx`
**Apply to:** audit-only scope; no route code changes in this phase.
```jsx
const BookingPayment = lazy(() => import('./pages/BookingPayment.jsx'))
const EventDetails = lazy(() => import('./pages/EventDetails.jsx'))
const Events = lazy(() => import('./pages/Events.jsx'))
...
<Route element={<MainLayout />}>
  <Route index element={<Home />} />
  ...
</Route>
```

### Production-preview build and measurement hygiene
**Source:** `package.json` + `vite.config.js`
**Apply to:** all local baseline evidence capture.
```json
"build": "vite build",
"preview": "vite preview"
```

```js
build: {
  assetsDir: 'build-assets',
  rollupOptions: {
    output: {
      manualChunks(id) {
```

## No Analog Found

None for this phase: the relevant audit evidence is represented in the repository by the historical baseline file, the homepage HTML, the homepage component, the matching CSS, the route map, and the existing build configuration.

## Metadata

**Analog search scope:** `docs/`, `index.html`, `src/App.jsx`, `src/pages/Home.jsx`, `src/pages/Home.css`, `package.json`, `vite.config.js`
**Files scanned:** 7
**Pattern extraction date:** 2026-11-16
