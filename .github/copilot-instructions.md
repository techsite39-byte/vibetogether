<!-- GSD:project-start source:PROJECT.md -->

## Project

**VibeTogether Mobile Performance Optimization**

VibeTogether is a customer-facing website for discovering and booking live music, social events, community meetups, and related experiences. This project improves the existing website's mobile performance through an audit-first workflow, without redesigning the site or changing its product behavior.

**Core Value:** Make the mobile experience measurably faster while preserving the existing design and reliable event discovery, booking, payment, ticket, notification, and account flows.

### Constraints

- **Compatibility**: Preserve all existing routes, APIs, responsive behavior, booking/ticket flows, payment integrations and verification, webhooks, WhatsApp notifications, login, and admin authentication.
- **Performance**: Optimize only issues confirmed by current evidence; preserve image quality and the existing design.
- **Validation**: Do not claim a target was met without a new comparable Lighthouse run. Distinguish user-supplied, repository-observed, and newly measured results.
- **Data integrity**: Do not change payment logic or database schemas.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- JavaScript (ES modules) - used throughout the frontend in `src\` and the backend in `backend\src\`, with JSX in `src\App.jsx`, `src\main.jsx`, and API routes in `backend\src\routes\`.
- HTML/CSS - used for the Vite app shell in `index.html`, `src\index.css`, and `src\App.css`.
- YAML - deployment configuration in `render.yaml` and `vercel.json`.
- JSON - manifest and test data settings in `package.json`, `backend\package.json`, and lockfiles.

## Runtime

- Node.js >= 20.6 - enforced in `backend\package.json` and used to run the Express server via `backend\src\server.js`.
- Vite dev server - configured in `vite.config.js` to serve the React app on port 5173 and proxy `/api` to `http://127.0.0.1:4000`.
- npm - root project package manager, with `package-lock.json` present.
- Lockfile: present

## Frameworks

- React 19.3.1 - frontend framework; declared in `package.json` and mounted from `src\main.jsx`.
- React Router 7.18.5 - client-side route handling in app code under `src\pages\` and `src\components\`.
- Express 5.1.0 - backend HTTP server used by `backend\src\app.js` and `backend\src\server.js`.
- Mongoose 8.12.1 - MongoDB ODM used by `backend\src\db\connect.js` and models in `backend\src\models\`.
- Node.js built-in test runner - configured via `"test": "node --test"` in both `package.json` and `backend\package.json`.
- Test files are present under `backend\test\` and `test\` with WhatsApp/payment integration tests.
- Vite 8.3.6 - build and dev tooling in `vite.config.js`; frontend build script is `npm run build`.
- Oxlint 1.90.0 - linting configured via `.oxlintrc.json` and `npm run lint` in `package.json`.

## Key Dependencies

- `@vitejs/plugin-react` 6.1.2 - React support for Vite in `vite.config.js`.
- `lucide-react` 1.69.0 - iconographic UI library used across `src\components\`.
- `react` 19.3.1 and `react-dom` 19.3.1 - core frontend runtime.
- `express` 5.1.0 - API server runtime used in `backend\src\app.js`.
- `mongoose` 8.12.1 - MongoDB access used by backend data access.
- `bcryptjs` 3.0.3 - password hashing for admin auth in `backend\src\auth\adminAuth.js`.
- `nodemailer` 10.3.1 - outbound email service in `backend\src\services\emailService.js`.
- `cors` 2.8.5 - configured in `backend\src\app.js` to restrict allowed origins.
- `dotenv` 16.4.7 - environment loading in `backend\src\config\env.js`.
- `helmet` 8.1.0 - HTTP security headers in `backend\src\app.js`.
- `libphonenumber-js` 1.13.15 - phone validation/normalization used by booking and WhatsApp features.
- `qrcode` 1.5.4 - QR code generation in frontend/client flows (`src\services\` and related UI).
- `@lottiefiles/dotlottie-react` 0.21.1 - animated media support in the frontend.

## Configuration

- Local and deployment configuration is primarily environment-variable based via `.env` and deployment services; the repository does not expose those values in source files.
- Backend validation of required env keys happens in `backend\src\config\env.js` for MongoDB, payment providers, admin auth, Google OAuth, SMTP, and WhatsApp.
- Frontend API base URL is resolved in `src\config\api.js` with `VITE_API_URL` or `VITE_API_BASE_URL` overriding the default production endpoint.
- Root build config is in `vite.config.js` with React plugin setup, custom chunk splitting, and `/api` proxy rules.
- Deployment manifest is in `render.yaml` for backend deployment and `vercel.json` for static frontend routing.

## Platform Requirements

- Node.js runtime and npm install in the repo root; backend also has its own `backend\package.json` and separate execution context.
- Frontend runs via `npm run dev` or `node scripts\start-dev.js`; backend runs via `npm run server` or `npm run server:dev` from the root project.
- Render serves the Node backend from `backend\` with `render.yaml` and a static frontend on Vercel or Render as configured in `render.yaml` and `vercel.json`.
- Static asset caching and SPA rewrite rules are defined in `render.yaml` and `vercel.json`.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- JavaScript modules and React components use a flat, feature-oriented layout under `E:\club\src` and `E:\club\backend\src`. Files are named with descriptive lower-case names for utilities and camelCase names for domain logic, for example `E:\club\src\utils\bookingValidation.js`, `E:\club\src\utils\contactValidation.js`, and `E:\club\src\hooks\usePublicEvents.js`.
- React UI files are PascalCase component names with a directory by feature or shared component, such as `E:\club\src\components\common\Button.jsx` and `E:\club\src\components\layout\MainLayout.jsx`.
- Utility and service functions use camelCase verbs and action-oriented naming: `validateBookingForm`, `filterEvents`, `sortEvents`, `isValidEmail`, and `createApp` in `E:\club\src\utils\bookingValidation.js`, `E:\club\src\utils\eventDiscovery.js`, and `E:\club\backend\src\app.js`.
- React hooks follow the hook naming pattern `useX` as seen in `E:\club\src\hooks\usePublicEvents.js`.
- Local variables and object keys use camelCase (`validBooking`, `attendeeCount`, `normalizedQuery`, `adminPasswordHash`) and avoid Hungarian notation.
- Configuration constants are named in camelCase at module scope, e.g. `const variantClasses = { ... }` in `E:\club\src\components\common\Button.jsx` and `const emailPattern = ...` in `E:\club\src\utils\contactValidation.js`.
- This repository is JavaScript-based, not TypeScript. The codebase relies on plain JS objects and JSDoc-like inline data contracts rather than explicit type declarations; the only type-like structure is runtime validation and object property checks.

## Code Style

- The codebase uses semicolonless JavaScript and single-quote imports, visible in `E:\club\src\App.jsx` and `E:\club\backend\src\server.js`.
- JSX attributes are written with a consistent multi-line layout when props are long, and nested route definitions are grouped by parent/child relation, e.g. the `Route` tree in `E:\club\src\App.jsx`.
- The project favors trailing commas in multi-line object/array literals, as shown in `E:\club\src\utils\contactValidation.js` and `E:\club\backend\src\app.js`.
- Linting is configured via `E:\club\.oxlintrc.json` and runs through `oxlint` (`"lint": "oxlint"` in `E:\club\package.json`).
- The active rules are specifically React-specific and enforce hook correctness (`react/rules-of-hooks`) and a warning around exporting too many top-level React components (`react/only-export-components`).

## Import Organization

- No path aliasing is configured in the project manifests. Imports use relative paths such as `./components/common/AppErrorBoundary.jsx` and `../src/utils/bookingTotals.js`.

## Error Handling

- Input validation is handled by returning an object of field errors rather than throwing validation exceptions in the UI layer; `validateBookingForm` and `validateContactForm` in `E:\club\src\utils\bookingValidation.js` and `E:\club\src\utils\contactValidation.js` return dictionaries keyed by field name.
- Server-side API errors are normalized in the Express error middleware in `E:\club\backend\src\app.js`: it maps `error.status`, `ValidationError`, duplicate-key collisions, database connectivity issues, and generic 500 conditions into JSON responses.
- Application startup failures in `E:\club\backend\src\server.js` are caught with `try/catch`, log a message to `console.error`, and set `process.exitCode = 1`.

## Logging

- The repository does not use a dedicated structured logger library. It relies on `console.info`, `console.error`, and occasionally `console.warn` patterns.
- Startup and service lifecycle messages are logged with `console.info`, such as the backend startup banner in `E:\club\backend\src\server.js`.
- Request and error logging for 5xx conditions is handled in `E:\club\backend\src\app.js` via `console.error('API request failed:', error.message)`.
- Payment and WhatsApp flows log operational failures with contextual labels such as `'[Cashfree Order Error]'` and `'[WhatsApp] Failed to dispatch attendee confirmation:'` across `E:\club\src\pages\BookingPayment.jsx` and `E:\club\backend\src\services\whatsappService.js`.

## Comments

- Inline comments are sparse and used only where behavior is not obvious from the code itself. `E:\club\backend\src\routes\health.js` has short route-level comments above the health endpoints.
- The codebase favors self-documenting function names and test names over dense documentation comments.
- Not detected in the current scan. The project does not appear to use formal JSDoc/TSDoc blocks as a standard pattern.

## Function Design

- Functions are usually modular and focused on one responsibility. `E:\club\src\utils\eventDiscovery.js` is a good example of a pure utility set: `sortEvents` and `filterEvents` each manage a single part of a search/filter pipeline.
- Large UI pages adopt component-local state and helper functions, but keep orchestration and data transforms readable rather than deeply nested.
- Many utility functions accept an options object as the final argument, e.g. `filterEvents(items, { query, category, pricing, upcomingOnly, sortBy, now } = {})` in `E:\club\src\utils\eventDiscovery.js`.
- Validation helpers are explicit and simple: they accept a form object and return an errors object with keys for the failing fields.
- Functions generally return plain objects or booleans, not complex wrapper types. Validation returns error maps; hooks return `{ events, loading, error }` (`E:\club\src\hooks\usePublicEvents.js`); utilities return transformed values or arrays.

## Module Design

- Modules expose named functions and default exports for React components. For example, `E:\club\src\utils\bookingValidation.js` exports `validateBookingForm`, while `E:\club\src\components\common\Button.jsx` defaults to a component export.
- The backend uses a factory pattern for routers and app creation (`createApp`, `createCashfreePaymentService`, `createWhatsAppNotificationService`) in files under `E:\club\backend\src`.
- Not detected. The codebase generally imports directly from file paths rather than through index barrel files.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App bootstrap | Creates the root React tree and mounts `App` | `E:\club\src\main.jsx` |
| App router | Defines public routes, nested admin routes, and lazy loading | `E:\club\src\App.jsx` |
| MainLayout | Shared public layout with navbar, main content, footer, and WhatsApp widget | `E:\club\src\components\layout\MainLayout.jsx` |
| AdminLayout | Session-aware admin shell with role gating, navigation, and account actions | `E:\club\src\admin\components\AdminLayout.jsx` |
| BookingEnquiryProvider | Tracks the active booking journey and injects the booking modal in the app shell | `E:\club\src\context\BookingEnquiryContext.jsx` |
| createApp | Composes Express middleware, route registrations, and shared API error handling | `E:\club\backend\src\app.js` |
| server bootstrap | Loads env config, initializes MongoDB, seeds admin/event data, then starts the HTTP server | `E:\club\backend\src\server.js` |
| createEventsRouter | Exposes public event listings from the app data or repository-backed data | `E:\club\backend\src\routes\events.js` |
| createBookingEnquiriesRouter | Validates booking requests, persists enquiries, handles payment flows, and sends notification triggers | `E:\club\backend\src\routes\bookingEnquiries.js` |
| config | Validates environment variables, CORS origin configuration, and payment/WhatsApp settings | `E:\club\backend\src\config\env.js` |

## Pattern Overview

- Frontend is a Vite React single-page application using client-side routing and lazy loaded page chunks.
- Backend is an Express server in `E:\club\backend\src\` with route modules, services, and Mongoose models.
- The public website and administrative console share the same repository but are separated by route namespaces and different layouts.
- Booking and payment data are orchestrated through the backend before being surfaced back to the frontend.

## Layers

- Purpose: Render public pages and admin screens, handle client-side navigation, and assemble reusable UI components.
- Location: `E:\club\src\`
- Contains: page components, reusable component primitives, hooks, context providers, and styling.
- Depends on: `react`, `react-router-dom`, browser APIs, and backend APIs through service modules.
- Used by: browser users via route navigation.
- Purpose: Call backend endpoints for bookings, events, admin operations, and public settings.
- Location: `E:\club\src\services\`, `E:\club\src\admin\services\`, `E:\club\src\config\`
- Contains: API wrappers and small data helpers such as booking validation and storage.
- Depends on: backend HTTP contracts and local app configuration.
- Used by: page components and admin screens.
- Purpose: Safe API composition, request validation, CORS, and route wiring.
- Location: `E:\club\backend\src\app.js`
- Contains: middleware setup, route mounting, and centralized error response handling.
- Depends on: Express, route factories, config, and service abstractions.
- Used by: `E:\club\backend\src\server.js` when the server boots.
- Purpose: Execute concrete payment, notification, admin-session, and event logic.
- Location: `E:\club\backend\src\services\`
- Contains: email, WhatsApp, payment, offer, booking-enquiry, and admin setup logic.
- Depends on: models and environment config.
- Used by: route modules and startup initialization.
- Purpose: Store runtime data for events, admin auth records, bookings, and payment state.
- Location: `E:\club\backend\src\models\`, `E:\club\backend\src\db\connect.js`
- Contains: Mongoose schemas and the MongoDB connection manager.
- Depends on: MongoDB connection URI and backend service logic.
- Used by: admin and public routes.

## Data Flow

### Primary request path: public booking flow

### Secondary flow: admin session and management

- Frontend uses React state and context (`E:\club\src\context\BookingEnquiryContext.jsx`, `E:\club\src\admin\context\`) for transient flow state and admin session state.
- Backend state is persisted in MongoDB through Mongoose models and is reconstructed at server startup via initialization routines in `E:\club\backend\src\server.js`.

## Key Abstractions

- Purpose: Represents a public booking request before or during payment and confirmation.
- Examples: `E:\club\backend\src\routes\bookingEnquiries.js`, `E:\club\backend\src\models\bookingEnquiry.js`
- Pattern: Validation -> persistence -> payment orchestration -> status serialization.
- Purpose: Protects backend admin actions and supports a role-aware dashboard shell.
- Examples: `E:\club\backend\src\auth\adminAuth.js`, `E:\club\src\admin\components\AdminLayout.jsx`
- Pattern: Session restoration, navigation guard, and role-filtered route access.
- Purpose: Maintains the list of public experiences and serves them to both the public website and booking flow.
- Examples: `E:\club\src\data\events.js`, `E:\club\backend\src\services\events.js`, `E:\club\backend\src\routes\events.js`
- Pattern: Shared event metadata with a backend repository fallback and public sanitization.

## Entry Points

- Location: `E:\club\src\main.jsx`
- Triggers: Browser startup after the Vite bundle loads.
- Responsibilities: Creates the root app container and mounts the React tree.
- Location: `E:\club\src\App.jsx`
- Triggers: Route resolution in the browser.
- Responsibilities: Defines route sets for the public site and admin workspace, lazy loads view modules, and applies the shared booking provider.
- Location: `E:\club\backend\src\server.js`
- Triggers: `npm run server` or `npm run server:dev`.
- Responsibilities: Loads env variables, connects MongoDB, initializes admin/event state, and starts Express.
- Location: `E:\club\backend\src\app.js`
- Triggers: `createApp(...)` called from the server bootstrap.
- Responsibilities: Wires route modules, CORS middleware, JSON parsing, and the 404/error handling layer.

## Architectural Constraints

- **Threading:** The application is single-process Node.js on the backend with asynchronous I/O for MongoDB, email, and payment/webhook interactions; frontend rendering remains browser-driven and event-loop based.
- **Global state:** The admin and booking experience rely on module-level route factories and React context rather than a centralized global store. Runtime data is mostly persisted by MongoDB instead of kept in server RAM.
- **Circular imports:** No obvious circular dependency chain was detected in the route/service bootstrap path; route factories depend on service objects passed in as parameters rather than importing each other directly.
- **Configuration loading:** Environment validation is centralized in `E:\club\backend\src\config\env.js` and startup fails fast when required production variables are missing or malformed.

## Anti-Patterns

### Hidden coupling between frontend metadata and backend data

### Large route factory function with multi-domain responsibilities

## Error Handling

- Validation failures return HTTP 400 with a message string.
- External dependency issues return 503/502 for services like MongoDB, payment gateways, or WhatsApp.
- Payment verification endpoints distinguish pending states from terminal success/failure states.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.github/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
