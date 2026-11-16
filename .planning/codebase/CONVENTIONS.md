---
last_mapped_commit: dfd13358e4048e76e43d14d8b409d3eec824b005
last_mapped_at: 2026-11-16
---
﻿# Coding Conventions

**Analysis Date:** 2026-11-16

## Naming Patterns

**Files:**
- JavaScript modules and React components use a flat, feature-oriented layout under `E:\club\src` and `E:\club\backend\src`. Files are named with descriptive lower-case names for utilities and camelCase names for domain logic, for example `E:\club\src\utils\bookingValidation.js`, `E:\club\src\utils\contactValidation.js`, and `E:\club\src\hooks\usePublicEvents.js`.
- React UI files are PascalCase component names with a directory by feature or shared component, such as `E:\club\src\components\common\Button.jsx` and `E:\club\src\components\layout\MainLayout.jsx`.

**Functions:**
- Utility and service functions use camelCase verbs and action-oriented naming: `validateBookingForm`, `filterEvents`, `sortEvents`, `isValidEmail`, and `createApp` in `E:\club\src\utils\bookingValidation.js`, `E:\club\src\utils\eventDiscovery.js`, and `E:\club\backend\src\app.js`.
- React hooks follow the hook naming pattern `useX` as seen in `E:\club\src\hooks\usePublicEvents.js`.

**Variables:**
- Local variables and object keys use camelCase (`validBooking`, `attendeeCount`, `normalizedQuery`, `adminPasswordHash`) and avoid Hungarian notation.
- Configuration constants are named in camelCase at module scope, e.g. `const variantClasses = { ... }` in `E:\club\src\components\common\Button.jsx` and `const emailPattern = ...` in `E:\club\src\utils\contactValidation.js`.

**Types:**
- This repository is JavaScript-based, not TypeScript. The codebase relies on plain JS objects and JSDoc-like inline data contracts rather than explicit type declarations; the only type-like structure is runtime validation and object property checks.

## Code Style

**Formatting:**
- The codebase uses semicolonless JavaScript and single-quote imports, visible in `E:\club\src\App.jsx` and `E:\club\backend\src\server.js`.
- JSX attributes are written with a consistent multi-line layout when props are long, and nested route definitions are grouped by parent/child relation, e.g. the `Route` tree in `E:\club\src\App.jsx`.
- The project favors trailing commas in multi-line object/array literals, as shown in `E:\club\src\utils\contactValidation.js` and `E:\club\backend\src\app.js`.

**Linting:**
- Linting is configured via `E:\club\.oxlintrc.json` and runs through `oxlint` (`"lint": "oxlint"` in `E:\club\package.json`).
- The active rules are specifically React-specific and enforce hook correctness (`react/rules-of-hooks`) and a warning around exporting too many top-level React components (`react/only-export-components`).

## Import Organization

**Order:**
1. Third-party modules such as `react`, `react-router-dom`, `express`, and `cors` are imported first.
2. Local project files follow immediately afterward using relative paths with explicit `.js` or `.jsx` extensions in ESM.
3. Cross-file utility or route imports are grouped by domain area, e.g. `E:\club\backend\src\server.js` imports route constructors, models, and services in a clear dependency order.

**Path Aliases:**
- No path aliasing is configured in the project manifests. Imports use relative paths such as `./components/common/AppErrorBoundary.jsx` and `../src/utils/bookingTotals.js`.

## Error Handling

**Patterns:**
- Input validation is handled by returning an object of field errors rather than throwing validation exceptions in the UI layer; `validateBookingForm` and `validateContactForm` in `E:\club\src\utils\bookingValidation.js` and `E:\club\src\utils\contactValidation.js` return dictionaries keyed by field name.
- Server-side API errors are normalized in the Express error middleware in `E:\club\backend\src\app.js`: it maps `error.status`, `ValidationError`, duplicate-key collisions, database connectivity issues, and generic 500 conditions into JSON responses.
- Application startup failures in `E:\club\backend\src\server.js` are caught with `try/catch`, log a message to `console.error`, and set `process.exitCode = 1`.

## Logging

**Framework:**
- The repository does not use a dedicated structured logger library. It relies on `console.info`, `console.error`, and occasionally `console.warn` patterns.

**Patterns:**
- Startup and service lifecycle messages are logged with `console.info`, such as the backend startup banner in `E:\club\backend\src\server.js`.
- Request and error logging for 5xx conditions is handled in `E:\club\backend\src\app.js` via `console.error('API request failed:', error.message)`.
- Several payment and WhatsApp flows log operational failures with contextual labels such as `'[Cashfree Order Error]'`, `'[Razorpay custom checkout initialization failed.]'`, and `'[WhatsApp] Failed to dispatch attendee confirmation:'` across `E:\club\src\pages\BookingPayment.jsx` and `E:\club\backend\src\services\whatsappService.js`.

## Comments

**When to Comment:**
- Inline comments are sparse and used only where behavior is not obvious from the code itself. `E:\club\backend\src\routes\health.js` has short route-level comments above the health endpoints.
- The codebase favors self-documenting function names and test names over dense documentation comments.

**JSDoc/TSDoc:**
- Not detected in the current scan. The project does not appear to use formal JSDoc/TSDoc blocks as a standard pattern.

## Function Design

**Size:**
- Functions are usually modular and focused on one responsibility. `E:\club\src\utils\eventDiscovery.js` is a good example of a pure utility set: `sortEvents` and `filterEvents` each manage a single part of a search/filter pipeline.
- Large UI pages adopt component-local state and helper functions, but keep orchestration and data transforms readable rather than deeply nested.

**Parameters:**
- Many utility functions accept an options object as the final argument, e.g. `filterEvents(items, { query, category, pricing, upcomingOnly, sortBy, now } = {})` in `E:\club\src\utils\eventDiscovery.js`.
- Validation helpers are explicit and simple: they accept a form object and return an errors object with keys for the failing fields.

**Return Values:**
- Functions generally return plain objects or booleans, not complex wrapper types. Validation returns error maps; hooks return `{ events, loading, error }` (`E:\club\src\hooks\usePublicEvents.js`); utilities return transformed values or arrays.

## Module Design

**Exports:**
- Modules expose named functions and default exports for React components. For example, `E:\club\src\utils\bookingValidation.js` exports `validateBookingForm`, while `E:\club\src\components\common\Button.jsx` defaults to a component export.
- The backend uses a factory pattern for routers and app creation (`createApp`, `createRazorpayPaymentService`, `createWhatsAppNotificationService`) in files under `E:\club\backend\src`.

**Barrel Files:**
- Not detected. The codebase generally imports directly from file paths rather than through index barrel files.

---

*Convention analysis: 2026-11-16*
