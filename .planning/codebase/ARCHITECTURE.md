---
last_mapped_commit: dfd13358e4048e76e43d14d8b409d3eec824b005
last_mapped_at: 2026-11-16
---
﻿<!-- refreshed: 2026-11-16 -->
# Architecture

**Analysis Date:** 2026-11-16

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                        │
│  `E:\club\src\main.jsx`                                     │
│  `E:\club\src\App.jsx`                                      │
├──────────────────────────────────────────────────────────────┤
│  UI shell + route composition                                │
│  `E:\club\src\components\layout\MainLayout.jsx`            │
│  `E:\club\src\admin\components\AdminLayout.jsx`            │
│  `E:\club\src\context\BookingEnquiryContext.jsx`           │
└───────────────┬───────────────────────────────┬────────────────┘
                │                               │
                ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ Public website routes         │   │ Admin routes                  │
│ `E:\club\src\pages\`        │   │ `E:\club\src\admin\pages\` │
│ components + hooks            │   │ context + services             │
└───────────────┬───────────────┘   └───────────────┬───────────────┘
                │                                   │
                └────────────────────┬──────────────┘
                                         ▼
                              HTTP API / JSON
                       `E:\club\backend\src\app.js`
                                         │
                                         ▼
                 ┌────────────────────────────────────┐
                 │ Express application + routers      │
                 │ `E:\club\backend\src\routes\`     │
                 │ `E:\club\backend\src\auth\`       │
                 └───────────────┬────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────────┐
                    │ Services + domain logic      │
                    │ `E:\club\backend\src\services\` │
                    │ `E:\club\backend\src\models\`   │
                    └───────────────┬──────────────┘
                                    │
                                    ▼
                     MongoDB via Mongoose
                    `E:\club\backend\src\db\connect.js`
                    `E:\club\backend\src\models\`
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

**Overall:** Hybrid SPA + API server with a shared domain model split across frontend and backend.

**Key Characteristics:**
- Frontend is a Vite React single-page application using client-side routing and lazy loaded page chunks.
- Backend is an Express server in `E:\club\backend\src\` with route modules, services, and Mongoose models.
- The public website and administrative console share the same repository but are separated by route namespaces and different layouts.
- Booking and payment data are orchestrated through the backend before being surfaced back to the frontend.

## Layers

**Client presentation layer:**
- Purpose: Render public pages and admin screens, handle client-side navigation, and assemble reusable UI components.
- Location: `E:\club\src\`
- Contains: page components, reusable component primitives, hooks, context providers, and styling.
- Depends on: `react`, `react-router-dom`, browser APIs, and backend APIs through service modules.
- Used by: browser users via route navigation.

**Feature/data access layer:**
- Purpose: Call backend endpoints for bookings, events, admin operations, and public settings.
- Location: `E:\club\src\services\`, `E:\club\src\admin\services\`, `E:\club\src\config\`
- Contains: API wrappers and small data helpers such as booking validation and storage.
- Depends on: backend HTTP contracts and local app configuration.
- Used by: page components and admin screens.

**Backend application layer:**
- Purpose: Safe API composition, request validation, CORS, and route wiring.
- Location: `E:\club\backend\src\app.js`
- Contains: middleware setup, route mounting, and centralized error response handling.
- Depends on: Express, route factories, config, and service abstractions.
- Used by: `E:\club\backend\src\server.js` when the server boots.

**Service/domain layer:**
- Purpose: Execute concrete payment, notification, admin-session, and event logic.
- Location: `E:\club\backend\src\services\`
- Contains: email, WhatsApp, payment, offer, booking-enquiry, and admin setup logic.
- Depends on: models and environment config.
- Used by: route modules and startup initialization.

**Persistence layer:**
- Purpose: Store runtime data for events, admin auth records, bookings, and payment state.
- Location: `E:\club\backend\src\models\`, `E:\club\backend\src\db\connect.js`
- Contains: Mongoose schemas and the MongoDB connection manager.
- Depends on: MongoDB connection URI and backend service logic.
- Used by: admin and public routes.

## Data Flow

### Primary request path: public booking flow

1. The user reaches a page such as `E:\club\src\pages\Booking.jsx` or a nested booking route defined in `E:\club\src\App.jsx`.
2. The page uses shared context and API service modules to submit booking data to the backend route `E:\club\backend\src\routes\bookingEnquiries.js`.
3. The router validates the request, computes pricing, saves the enquiry, and returns a serialized booking object.
4. The frontend updates local state and resolves payment/confirmation flows based on `paymentStatus` and `paymentProvider` fields.
5. Notifications and webhook events are dispatched through backend services such as `E:\club\backend\src\services\whatsappNotifications.js` and payment-specific services.

### Secondary flow: admin session and management

1. `E:\club\src\admin\components\AdminLayout.jsx` loads the admin configuration and session at mount.
2. A nested route under `E:\club\src\App.jsx` dispatches to one of the admin pages in `E:\club\src\admin\pages\`.
3. The browser calls server endpoints under `/api/admin`, assembled in `E:\club\backend\src\auth\adminAuth.js` and `E:\club\backend\src\routes\admin.js`.
4. Mongoose-backed admin records and booking/event metadata are read and mutated behind the authenticated session.

**State management:**
- Frontend uses React state and context (`E:\club\src\context\BookingEnquiryContext.jsx`, `E:\club\src\admin\context\`) for transient flow state and admin session state.
- Backend state is persisted in MongoDB through Mongoose models and is reconstructed at server startup via initialization routines in `E:\club\backend\src\server.js`.

## Key Abstractions

**Booking enquiry:**
- Purpose: Represents a public booking request before or during payment and confirmation.
- Examples: `E:\club\backend\src\routes\bookingEnquiries.js`, `E:\club\backend\src\models\bookingEnquiry.js`
- Pattern: Validation -> persistence -> payment orchestration -> status serialization.

**Admin session:**
- Purpose: Protects backend admin actions and supports a role-aware dashboard shell.
- Examples: `E:\club\backend\src\auth\adminAuth.js`, `E:\club\src\admin\components\AdminLayout.jsx`
- Pattern: Session restoration, navigation guard, and role-filtered route access.

**Event catalog:**
- Purpose: Maintains the list of public experiences and serves them to both the public website and booking flow.
- Examples: `E:\club\src\data\events.js`, `E:\club\backend\src\services\events.js`, `E:\club\backend\src\routes\events.js`
- Pattern: Shared event metadata with a backend repository fallback and public sanitization.

## Entry Points

**Frontend entry point:**
- Location: `E:\club\src\main.jsx`
- Triggers: Browser startup after the Vite bundle loads.
- Responsibilities: Creates the root app container and mounts the React tree.

**Router entry point:**
- Location: `E:\club\src\App.jsx`
- Triggers: Route resolution in the browser.
- Responsibilities: Defines route sets for the public site and admin workspace, lazy loads view modules, and applies the shared booking provider.

**Backend entry point:**
- Location: `E:\club\backend\src\server.js`
- Triggers: `npm run server` or `npm run server:dev`.
- Responsibilities: Loads env variables, connects MongoDB, initializes admin/event state, and starts Express.

**API composition entry point:**
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

**What happens:** The public app uses front-end event data from `E:\club\src\data\events.js`, while backend routes also reference the same source as a fallback for the event catalog.
**Why it's wrong:** This creates a duplicated source of truth and makes frontend/public content drift away from the database-backed data model.
**Do this instead:** Prefer a single canonical event source in the backend and let the frontend consume API responses rather than embedded static data.

### Large route factory function with multi-domain responsibilities

**What happens:** `E:\club\backend\src\routes\bookingEnquiries.js` handles validation, workflow state, payment provider selection, notifications, and serialization in one module.
**Why it's wrong:** A single file becomes difficult to reason about and change safely when new payment providers or validation rules are added.
**Do this instead:** Split booking request lifecycle procedures into smaller service modules and leave route code focused on HTTP translation.

## Error Handling

**Strategy:** The backend uses `try/catch` around service calls and passes typed, route-specific failures back to the client as JSON. `E:\club\backend\src\app.js` centralizes the final 404 and error-response transformation.

**Patterns:**
- Validation failures return HTTP 400 with a message string.
- External dependency issues return 503/502 for services like MongoDB, payment gateways, or WhatsApp.
- Payment verification endpoints distinguish pending states from terminal success/failure states.

## Cross-Cutting Concerns

**Logging:** Server logs are emitted with `console.info` and `console.error` in startup and route/service flows; there is no dedicated structured logger or tracing infrastructure.
**Validation:** Request validation is embedded in route functions such as `validateBookingEnquiry` in `E:\club\backend\src\routes\bookingEnquiries.js` plus env validation in `E:\club\backend\src\config\env.js`.
**Authentication:** Admin auth uses dedicated session and OAuth pathways from `E:\club\backend\src\auth\adminAuth.js`; public app features do not use a shared JWT layer.

---

*Architecture analysis: 2026-11-16*
