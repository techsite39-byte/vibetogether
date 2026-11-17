# Phase 02: Evidence-Backed Performance Changes - Pattern Map

**Mapped:** 2026-11-17
**Files analyzed:** 7 planned or evidence-gated paths
**Analogs found:** 7 / 7 (6 exact; 1 role match)

> Scope note: `STATE.md` records Phase 1 complete and Phase 2 UI-SPEC approved; this mapping supports the Phase 2 planning handoff. This file is planning documentation only. Phase 1 did not establish a code-level performance cause, so homepage and document edits below are candidates only until new evidence supports them. No implementation is authorized.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/pages/BookingPayment.jsx` | component | request-response | `src/pages/BookingPayment.jsx` | exact |
| `src/pages/BookingPayment.css` | component | transform | `src/pages/BookingPayment.css` | exact |
| `src/styles/theme.css` (only if shared tokens need editing) | config | transform | `src/styles/theme.css` | exact |
| `src/pages/Home.jsx` (only if current trace/profile justifies a homepage code edit) | component | request-response | `src/pages/Home.jsx` | exact |
| `src/pages/Home.css` (only if measured rendering/animation cause justifies a style edit) | component | transform | `src/pages/Home.css` | exact |
| `index.html` (only if measured resource discovery justifies a document-hint edit) | config | request-response | `index.html` | exact |
| `test/bookingPayment.test.js` (candidate; only if a focused test is added) | test | request-response | `test/bookingEnquiryPayment.test.js` | role-match |

### Inventory boundaries

- The likely Cashfree UI implementation files are the existing payment page and its stylesheet. The approved UI-SPEC also names `src/styles/theme.css`, but its existing global typography/color tokens may be reused without modification.
- The Phase 1 baseline is the homepage, so `Home.jsx`, `Home.css`, and `index.html` are evidence-gated candidates, not an instruction to optimize a specific asset, animation, CSS request, or JavaScript task. The hero was already eager/high-priority/discoverable; element-render delay was largest, but no code-level cause was confirmed.
- No new payment service or backend file is indicated. `src/services/bookingEnquiryPayment.js` and the backend Cashfree service/routes/webhook/model/tests are existing contracts to reuse and preserve, not planned edits.
- `test/bookingPayment.test.js` is an inferred placeholder path, not a confirmed requirement or existing file. If tests are added, select the path and scope based on the implementation plan; the repository has no established React component-render test harness.

## Pattern Assignments

### `src/pages/BookingPayment.jsx` (component, request-response)

**Analog:** `src/pages/BookingPayment.jsx` (same-file extension; tracked)

**Imports and project conventions** (lines 1-47):

```jsx
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import './BookingPayment.css'
```

The page also imports icons from `lucide-react` and existing Cashfree/Razorpay wrappers from `../services/bookingEnquiryPayment.js` in lines 2-46. Keep the page-local React state/ref approach and relative imports. Do not remove the independent Razorpay imports/fallback.

**On-demand provider SDK load** (lines 134-153):

```jsx
function loadCashfreeSdk() {
  if (typeof window.Cashfree === 'function') {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${cashfreeScriptUrl}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(typeof window.Cashfree === 'function'), { once: true })
      existing.addEventListener('error', () => resolve(false), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = cashfreeScriptUrl
    script.async = true
    script.onload = () => resolve(typeof window.Cashfree === 'function')
    script.onerror = () => resolve(false)
    document.head.append(script)
  })
}
```

This is the existing lazy-loader pattern: invoke it from the payment flow, not public-page startup. Handle a failed script load inline and retain the existing CDN URL unless separately authorized and verified.

**Selection state and refs** (lines 233-270):

```jsx
const [bookingState, setBookingState] = useState({
  requestId,
  status: 'loading',
  booking: null,
  error: '',
})
const [isPaying, setIsPaying] = useState(false)
const [paymentError, setPaymentError] = useState('')
const [paymentUncertain, setPaymentUncertain] = useState(false)

const [selectedMethod, setSelectedMethod] = useState('upi_qr')
const [cashfreeOrder, setCashfreeOrder] = useState(null)
const [isOrderLoading, setIsOrderLoading] = useState(false)
const [isElementReady, setIsElementReady] = useState(false)
const [elementLoadError, setElementLoadError] = useState('')
const cashfreeInstanceRef = useRef(null)
const activeComponentRef = useRef(null)
const paying = useRef(false)
```

Extend the established busy/error/uncertain and provider-instance state rather than putting card field values in React state.

**Element lifecycle, readiness, and cleanup** (lines 532-575):

```jsx
useEffect(() => {
  if (!cashfreeOrder?.payment_session_id || !isCashfreeActive || selectedMethod !== 'upi_qr') return

  let active = true
  setIsElementReady(false)
  setElementLoadError('')

  if (activeComponentRef.current?.unmount) {
    try { activeComponentRef.current.unmount() } catch {}
    activeComponentRef.current = null
  }

  loadCashfreeSdk().then((loaded) => {
    if (!active || !loaded || typeof window.Cashfree !== 'function') {
      if (active) setElementLoadError('Payment interface could not connect. Check internet access.')
      return
    }
    try {
      const mode = cashfreeOrder.environment === 'production' ? 'production' : 'sandbox'
      const cf = window.Cashfree({ mode })
      cashfreeInstanceRef.current = cf
      const qrSlot = document.getElementById('vibetogether-cf-upi-qr')
      if (qrSlot) {
        const qr = cf.create('upiQr', { values: { size: '200px' } })
        qr.on('ready', () => active && setIsElementReady(true))
        qr.on('loaderror', (e) => active && setElementLoadError(e?.error?.message || 'Failed to load QR. Use the Pay Now button instead.'))
        qr.mount('#vibetogether-cf-upi-qr')
        activeComponentRef.current = qr
      }
    } catch (err) {
      if (active) {
        console.error('[Cashfree QR Mount Exception]', err)
        setElementLoadError(err instanceof Error ? err.message : 'Could not load QR code.')
      }
    }
  })

  return () => {
    active = false
    if (activeComponentRef.current?.unmount) {
      try { activeComponentRef.current.unmount() } catch {}
    }
  }
}, [cashfreeOrder?.payment_session_id, isCashfreeActive, selectedMethod])
```

Copy the async stale-effect guard, `ready`/`loaderror` handling, unmount-before-replacement, and cleanup when mounting a selected Element. Adapt the guard and mount target to the selected method; the present code only mounts QR.

**Selected method controls and inline states** (lines 1447-1500):

```jsx
<div className="booking-payment__custom-method-selector" role="tablist" aria-label="Payment Methods">
  {customPaymentMethods.map((method) => {
    const isSelected = selectedMethod === method.id
    const MethodIcon = method.icon
    return (
      <button
        key={method.id}
        type="button"
        role="tab"
        aria-selected={isSelected}
        className={`booking-payment__custom-method-pill${isSelected ? ' is-active' : ''}`}
        onClick={() => {
          setSelectedMethod(method.id)
          setPaymentError('')
        }}
      >
        <span className="booking-payment__custom-pill-icon">
          <MethodIcon size={16} aria-hidden="true" />
        </span>
        <span className="booking-payment__custom-pill-title">{method.name}</span>
      </button>
    )
  })}
</div>
<div className="booking-payment__custom-method-details">
  {isOrderLoading && (
    <div className="booking-payment__cf-loading-box" role="status">
      <LoaderCircle className="booking-payment__btn-spinner" size={20} aria-hidden="true" />
      <span>Preparing secure payment elements…</span>
    </div>
  )}
  {elementLoadError && (
    <div className="booking-payment__alert-box" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <span>{elementLoadError}</span>
    </div>
  )}
  {selectedMethod === 'upi_qr' && (
    <div className="booking-payment__cf-panel" role="tabpanel" aria-label="UPI and QR">
      <div id="vibetogether-cf-upi-qr" className="booking-payment__cf-qr-mount" />
    </div>
  )}
</div>
```

Use the existing in-page selector, accessible selection state, loading box, alert, and conditional panel as structural patterns. Important limitation: the current non-QR handler still calls `cf.checkout({ redirectTarget: '_modal' })` (lines 585-677); it does not bind the selected visual label to its own Element. Do **not** copy the hosted modal path, the generic “all methods” tab, desktop UPI collect fields, or infer support from the current labels. The new flow must submit only the selected, verified-supported Element and keep server verification authoritative.

**Server-authoritative status/error handling** (lines 597-677; service wrappers lines 69-124):

```jsx
if (selectedMethod === 'upi_qr') {
  const res = await checkCashfreePaymentStatus(requestId)
  if (res?.booking?.paymentStatus === 'paid') {
    setBookingState({ requestId, status: 'ready', booking: res.booking, error: '' })
  } else {
    setPaymentError('Payment is awaiting confirmation from your UPI app. Please scan the QR code and approve on your phone.')
  }
  return
}

const verifyResult = await verifyCashfreePayment(requestId, { order_id: currentOrder.order_id })
setBookingState({ requestId, status: 'ready', booking: verifyResult.booking, error: '' })
```

Retain the service API for create/verify/status/failure, payment-uncertain lockout, and inline error recovery. Browser SDK callbacks are not proof of payment; show paid-ticket state only from backend-confirmed booking status.

### `src/pages/BookingPayment.css` (component, transform)

**Analog:** `src/pages/BookingPayment.css` (same-file extension; tracked)

**Local token and shell pattern** (lines 5-35):

```css
:root {
  --bp-bg-deep: #07040f;
  --bp-bg-card: rgba(19, 10, 36, 0.78);
  --bp-bg-card-subtle: rgba(28, 14, 54, 0.55);
  --bp-border-glow: rgba(191, 113, 255, 0.28);
  --bp-border-subtle: rgba(255, 255, 255, 0.08);
  --bp-accent-purple: #9d4edd;
  --bp-accent-violet: #c77dff;
  --bp-accent-gold: #ffc857;
  --bp-accent-emerald: #10b981;
  --bp-text-white: #ffffff;
  --bp-text-muted: #cbbad9;
  --bp-text-dim: #8e7a9e;
}
```

**Selector, active state, panel, and loading pattern** (lines 826-916):

```css
.booking-payment__custom-cashfree-shell {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  animation: bp-fade-up 350ms ease both;
}

.booking-payment__custom-method-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.booking-payment__custom-method-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.95rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--bp-text-muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 180ms ease;
  min-height: 44px;
}

.booking-payment__custom-method-pill.is-active {
  background: linear-gradient(135deg, rgba(123, 44, 191, 0.35), rgba(45, 18, 77, 0.75));
  border-color: #c77dff;
  color: #ffffff;
  box-shadow: 0 0 20px rgba(199, 125, 255, 0.35);
}

.booking-payment__cf-loading-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 1.5rem;
  color: var(--bp-accent-violet);
  font-size: 0.88rem;
  font-weight: 600;
}

.booking-payment__cf-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: bp-fade-up 250ms ease both;
}
```

Preserve the payment page's local class naming, responsive wrapping, established purple/glass selected state, and 44px minimum control height. Apply the UI-SPEC's exact responsive/copy rules rather than expanding into a redesign.

**Responsive and reduced-motion behavior** (lines 1986-2085):

```css
@media (max-width: 1024px) {
  .booking-payment__layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

@media (max-width: 768px) {
  .booking-payment {
    padding: 1.25rem 0.75rem 3rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .booking-payment__container,
  .booking-payment__btn-shimmer,
  .booking-payment__radar-ring,
  .booking-payment__celebration-halo,
  .booking-payment__pulse-beacon {
    animation: none !important;
  }
}
```

New payment panels must fit this existing 1024px stack and mobile treatment and respect reduced motion.

### `src/styles/theme.css` (config, transform; conditional)

**Analog:** `src/styles/theme.css` (tracked; modify only if shared tokens truly need to change)

**Global typography/color token pattern** (lines 1-14, 54-55):

```css
:root {
  color-scheme: dark;
  --color-background: #050509;
  --color-background-secondary: #0d0918;
  --color-surface: #151021;
  --color-primary: #773bff;
  --color-primary-light: #a82bff;
  --font-display: 'Syne', 'Space Grotesk', sans-serif;
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

Keep shared tokens semantic and use the existing `--font-body`/heading tokens. Payment-specific `--bp-*` variables currently live in `BookingPayment.css`; do not move or duplicate them in the global theme without a concrete cross-page need.

### `src/pages/Home.jsx` (component, request-response; evidence-gated)

**Analog:** `src/pages/Home.jsx` (tracked; Phase 1 LCP audit source)

**Responsive hero sources and image priority** (lines 29-48, 402-414):

```jsx
const heroBackgroundSlides = [
  {
    src: '/assets/optimized/hero/h1-1672-v1.webp',
    srcSet:
      '/assets/optimized/hero/h1-480-v1.webp 480w, /assets/optimized/hero/h1-960-v1.webp 960w, /assets/optimized/hero/h1-1672-v1.webp 1672w',
  },
  // Other carousel slides use the corresponding h2-h4 responsive variants.
]

<img
  src={slide.src}
  srcSet={slide.srcSet}
  sizes="100vw"
  width="1672"
  height="941"
  alt=""
  loading={index === 0 ? 'eager' : 'lazy'}
  fetchPriority={index === 0 ? 'high' : 'auto'}
  decoding="async"
/>
```

This is the actual LCP-candidate source/priority pattern, not a recommendation to change it: Phase 1 found the hero candidate eager, high priority, and discoverable. Preserve intrinsic dimensions and responsive variants; any priority or image change must follow a new comparable trace.

**Subsequent-slide preload and observer gate** (lines 242-339):

```jsx
if (prefersReducedMotion) {
  return undefined
}

const nextSlide = (activeHeroSlide + 1) % heroBackgroundSlides.length
const preloadImage = new window.Image()
const timers = { preload: 0, fallback: 0, fade: 0, switch: 0 }

function loadNextSlide() {
  timers.preload = 0
  preloadImage.sizes = '100vw'
  preloadImage.srcset = heroBackgroundSlides[nextSlide].srcSet
  preloadImage.src = heroBackgroundSlides[nextSlide].src
}

preloadImage.decoding = 'async'
preloadImage.fetchPriority = 'low'
```

Respect the existing reduced-motion and LCP-observer timing logic. Do not preload all slides or treat Lighthouse opportunity estimates as a diagnosis.

### `src/pages/Home.css` (component, transform; evidence-gated)

**Analog:** `src/pages/Home.css` (tracked)

**Hero layering/image geometry** (lines 29-36, 111-130):

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

Use as a diagnostic analog for hero compositing, opacity/render delay, sizing and image fit; only alter measured causes and preserve the current crop and visual identity.

**Reduced motion** (lines 3410-3434):

```css
@media (prefers-reduced-motion: reduce) {
  .home-hero__image,
  .home-hero__ambient,
  .home-hero::after,
  .home-hero__particles span,
  .home-eyebrow__dot,
  .home-hero__content,
  .home-hero__scroll svg {
    animation: none;
  }

  .home-hero__image {
    --hero-scroll-scale: 1 !important;
    --hero-scroll-y: 0px !important;
    transform: none;
    transition: none;
  }
}
```

Any animation optimization must maintain this accessibility behavior and preserve important motion where possible.

### `index.html` (config, request-response; evidence-gated)

**Analog:** `index.html` (tracked; current initial-document resource hints)

**Existing responsive hero preload and font loading hints** (lines 38-64):

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

This already targets the hero candidate. Change preload/resource hints only if a fresh trace proves a mismatch or cost; keep the chosen resource and responsive `srcset` in sync. The render-blocking CSS/font hypothesis also requires request evidence before editing these links.

### `test/bookingPayment.test.js` (test, request-response; candidate only)

**Analog:** `test/bookingEnquiryPayment.test.js` (tracked; role match, not a UI-test match)

**Node test runner and fetch restoration pattern** (`test/bookingEnquiryPayment.test.js`, lines 1-9, 11-30):

```js
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createRazorpayOrder } from '../src/services/bookingEnquiryPayment.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('labels a missing Razorpay order route as a payment setup error, not a booking lookup error', async () => {
  let requestedUrl = ''
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return new Response('<html>Not Found</html>', {
      headers: { 'Content-Type': 'text/html' },
      status: 404,
    })
  }
  await assert.rejects(
    createRazorpayOrder('4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b'),
    (error) => {
      assert.match(error.message, /Razorpay order endpoint was not found/)
      assert.doesNotMatch(error.message, /Booking details/)
      return true
    },
  )
  assert.match(requestedUrl, /\/booking-enquiries\/4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b\/razorpay-order$/)
  assert.match(requestedUrl, /\/booking-enquiries\/4a9f7d8e-1ef2-4c0a-a62e-c1a73e756c4b\/razorpay-order$/)
})
```

The existing frontend test is an API-wrapper test, not a rendered React payment test. Do not assume it can validate method selection or Cashfree SDK mounting; there is no corresponding component-test harness evidenced in the repository. Add focused tests only where a supported test seam exists, and use the specified sandbox/manual checks for provider handoffs.

## Shared Patterns

### Lazy Cashfree SDK and component lifecycle

**Source:** `src/pages/BookingPayment.jsx` (lines 134-153, 532-575)  
**Apply to:** payment UI only.

- Keep script loading demand-driven, async, and error-aware.
- Mount the selected Element only after order/session and SDK readiness.
- Unmount prior Elements and clean up effects.
- Merchant method enablement and sandbox behavior are pre-implementation gates; never silently replace unavailable Elements with hosted checkout.

### Server-owned order and confirmation

**Source:** `src/pages/BookingPayment.jsx` (lines 597-677), `src/services/bookingEnquiryPayment.js` (lines 69-124)  
**Apply to:** every Cashfree payment result and status transition.

```js
export async function verifyCashfreePayment(requestId, paymentData) {
  const payload = await requestPayload(
    `${encodeURIComponent(requestId)}/cashfree-verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData || {}),
    },
    undefined,
    'Cashfree payment verification',
  )
  return {
    ...payload,
    booking: validateBooking(payload.booking),
  }
}
```

Reuse existing server order, verify, status, and failure APIs. Preserve server-calculated amount, booking association, uncertain/pending blocking, and paid-ticket gating. Do not edit the backend order/verification/webhook/idempotency logic, booking schema, or Razorpay path for this UI.

### Homepage image/performance evidence gate

**Sources:** `src/pages/Home.jsx`, `src/pages/Home.css`, `index.html`, Phase 1 baseline.  
**Apply to:** any proposed LCP, image, critical-path, animation, or JavaScript edit.

- Keep Lighthouse LCP and trace candidate timing separate.
- Phase 1 local runs: hero candidate in all three; element-render delay largest; long-task attribution inconclusive.
- Repeat the three sequential cold-cache local runs under the same settings/build provenance and report median/range before asserting an improvement.
- Opportunity savings are leads, not causes; no optimization target is assigned to these files without corroborating trace/profile evidence.

### Responsive styling and accessibility

**Sources:** `src/pages/BookingPayment.css` (lines 1986-2085), `src/pages/Home.css` (lines 3410-3434), `src/styles/theme.css`.  
**Apply to:** new payment controls and any homepage style edit.

- Preserve the payment two-column-to-single-column breakpoint at 1024px and test the UI-SPEC's mobile widths.
- Keep keyboard focus/selected state visible, touch controls at least 44px high, and content wrapping without horizontal overflow.
- Honor `prefers-reduced-motion`; retain existing global fonts/colors and payment-specific tokens.

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|---|---|---|---|
| React-rendered payment component test (if required) | test | request-response | Existing `test/` coverage shown here uses Node's built-in runner for service/API behavior; no React DOM/component testing pattern or dependency was found. Planner should avoid assuming one exists. |

## Protected Existing Files (Not Planned Modifications)

The context/research list these as canonical architecture and regression references, not new implementation targets: `src/services/bookingEnquiryPayment.js`, `backend/src/services/cashfreePayments.js`, `backend/src/routes/bookingEnquiries.js`, `backend/src/routes/cashfreeWebhook.js`, `backend/src/models/bookingEnquiry.js`, and `backend/test/cashfreePayments.test.js`, `backend/test/cashfreeWebhook.test.js`, `backend/test/booking-enquiries.test.js`. Preserve existing order creation, pricing, verification/status APIs, raw-body signature verification, idempotency, persistence/schema, and Razorpay behavior. Do not edit native Android or deployment configuration.

## Metadata

**Analog search scope:** `src/pages/BookingPayment.jsx`, `src/pages/BookingPayment.css`, `src/styles/theme.css`, `src/pages/Home.jsx`, `src/pages/Home.css`, `index.html`, `src/services/bookingEnquiryPayment.js`, `src/App.jsx`, `test/`, Phase 1 pattern/evidence docs.  
**Tracked-source gate:** every existing code analog named above was verified with `git ls-files`; all were tracked.  
**Project guidance:** read `.github/copilot-instructions.md`; no `.github/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.codex/skills/` directories were present. No separate installed mapper instruction file was found in the repository; the supplied mapper workflow was followed.  
**Source/worktree:** candidate source analogs were clean before writing this phase artifact; existing dirty documentation changes were left untouched.  
**Pattern extraction date:** 2026-11-17
