---
last_mapped_commit: dfd13358e4048e76e43d14d8b409d3eec824b005
last_mapped_at: 2026-11-16
---
﻿# Codebase Structure

**Analysis Date:** 2026-11-16

## Directory Layout

```text
E:\club\
├── backend\              # Express API server and MongoDB-backed domain logic
│   └── src\
│       ├── app.js        # API composition root
│       ├── server.js     # startup, DB init, and process lifecycle
│       ├── auth\         # admin auth and session flows
│       ├── config\       # environment validation and settings
│       ├── db\           # database connection setup
│       ├── models\       # Mongoose schemas
│       ├── routes\       # HTTP route factories
│       └── services\     # payment, notifications, event, admin services
├── src\                 # Vite React frontend
│   ├── admin\           # admin portal pages, layout, utilities, and data providers
│   ├── components\      # shared UI; grouped by feature area
│   ├── context\         # React context providers
│   ├── data\            # static content and event metadata
│   ├── hooks\           # shared client hooks
│   ├── pages\           # public site routes
│   ├── services\        # frontend API wrappers and local helpers
│   ├── styles\          # global design tokens and CSS
│   ├── App.jsx          # top-level route tree
│   ├── main.jsx         # React root bootstrap
│   └── index.css        # app-wide styling entry
├── public\              # static assets served by Vite
├── test\                # test files and fixtures in this repo
├── tests\               # additional test coverage area
├── scripts\             # dev startup scripts
├── docs\                # project docs
├── dist\                # build artifact output
├── package.json         # app scripts and package metadata
├── vite.config.js       # Vite config with proxy and chunking rules
├── render.yaml          # deployment config
├── vercel.json          # frontend deployment config
├── README.md            # project overview template text
├── index.html           # HTML entry shell
└── .env                 # local environment file (not read for secrets)
```

## Directory Purposes

**`E:\club\src\`:**
- Purpose: Frontend application code for the public site and admin workspace.
- Contains: route pages, reusable components, hooks, context, static data, and CSS.
- Key files: `E:\club\src\App.jsx`, `E:\club\src\main.jsx`, `E:\club\src\pages\Home.jsx`, `E:\club\src\admin\components\AdminLayout.jsx`

**`E:\club\src\components\`:**
- Purpose: Shared UI sections used by the public site, grouped by domain (booking, contact, gallery, home, layout, testimonials).
- Contains: feature-specific React components and CSS files.
- Key files: `E:\club\src\components\layout\MainLayout.jsx`, `E:\club\src\components\booking\BookingJourney.jsx`, `E:\club\src\components\contact\ContactForm.jsx`

**`E:\club\src\pages\`:**
- Purpose: Page-level route components for the website.
- Contains: public experience pages such as events, booking, gallery, contact, testimonials, and not-found handling.
- Key files: `E:\club\src\pages\Booking.jsx`, `E:\club\src\pages\Events.jsx`, `E:\club\src\pages\Contact.jsx`

**`E:\club\src\admin\`:**
- Purpose: Admin-only experience with its own pages, data provider, UI, and domain operations.
- Contains: pages, routes, style sheets, and service calls for management workflows.
- Key files: `E:\club\src\admin\components\AdminLayout.jsx`, `E:\club\src\admin\pages\Dashboard.jsx`, `E:\club\src\admin\services\adminApi.js`

**`E:\club\backend\src\`:**
- Purpose: Express server and domain backend for bookings, payments, admin auth, and event data.
- Contains: route factories, services, models, and environment wiring.
- Key files: `E:\club\backend\src\server.js`, `E:\club\backend\src\app.js`, `E:\club\backend\src\routes\bookingEnquiries.js`

**`E:\club\backend\src\routes\`:**
- Purpose: HTTP endpoints grouped by concern; public and admin endpoints are mounted separately.
- Contains: `bookings`, `events`, `bookingEnquiries`, `whatsappWebhook`, `cashfreeWebhook`, `admin`, and health routes.
- Key files: `E:\club\backend\src\routes\events.js`, `E:\club\backend\src\routes\admin.js`, `E:\club\backend\src\routes\health.js`

**`E:\club\backend\src\services\`:**
- Purpose: Business logic for notifications, payment gateways, admin initialization, and booking orchestration.
- Contains: payment provider integrations and domain functions.
- Key files: `E:\club\backend\src\services\razorpayPayments.js`, `E:\club\backend\src\services\cashfreePayments.js`, `E:\club\backend\src\services\whatsappNotifications.js`

**`E:\club\backend\src\models\`:**
- Purpose: Database schema definitions that represent admin records, events, and booking enquiries.
- Contains: Mongoose models and persisted record structures.
- Key files: `E:\club\backend\src\models\bookingEnquiry.js`, `E:\club\backend\src\models\adminRecords.js`, `E:\club\backend\src\models\event.js`

## Key File Locations

**Entry Points:**
- `E:\club\src\main.jsx`: React bootstraps the app in the browser.
- `E:\club\src\App.jsx`: Defines the route tree and lazy-loaded route modules.
- `E:\club\backend\src\server.js`: Initializes DB and starts the backend HTTP server.

**Configuration:**
- `E:\club\package.json`: Project scripts and dependency metadata.
- `E:\club\vite.config.js`: Vite server config, proxying `/api` to the backend, and bundle chunking.
- `E:\club\backend\src\config\env.js`: Validates env vars and config for MongoDB, CORS, payments, and WhatsApp.

**Core Logic:**
- `E:\club\backend\src\app.js`: Global API assembly and error handling.
- `E:\club\backend\src\routes\bookingEnquiries.js`: Booking lifecycle and payment processing gate.
- `E:\club\src\context\BookingEnquiryContext.jsx`: Booking workflow modal orchestration on the client.

**Testing:**
- `E:\club\test\`: Contains repository test files.
- `E:\club\tests\`: Contains additional test coverage area.

## Naming Conventions

**Files:**
- React components use PascalCase filenames such as `E:\club\src\pages\Booking.jsx` and `E:\club\src\components\layout\Navbar.jsx`.
- Route modules and utility modules use lowercase names or descriptive camelCase such as `E:\club\backend\src\routes\bookingEnquiries.js` and `E:\club\src\utils\bookingStorage.js`.

**Directories:**
- Feature directories are grouped by domain (`booking`, `contact`, `gallery`, `layout`, `admin`, `services`) rather than by technical layer alone.
- Backend directories are organized by responsibility (`routes`, `services`, `models`, `auth`, `config`, `db`).

## Where to Add New Code

**New Feature:**
- Primary code: `E:\club\src\pages\` for public pages; `E:\club\src\admin\pages\` for admin pages.
- Tests: `E:\club\test\` or `E:\club\tests\` depending on the project's current test layout.

**New Component/Module:**
- Implementation: Add to the nearest feature directory under `E:\club\src\components\` or `E:\club\backend\src\services\`.
- Prefer keeping the public UI and admin UI separated by their route trees and layout wrappers.

**Utilities:**
- Shared helpers: `E:\club\src\utils\` for frontend utility functions and `E:\club\backend\src\services\` for backend domain logic.

## Special Directories

**`E:\club\backend\src\routes\`:**
- Purpose: HTTP endpoint factories and request/response translation.
- Generated: No.
- Committed: Yes.

**`E:\club\dist\`:**
- Purpose: Production build output generated by Vite.
- Generated: Yes.
- Committed: Usually no, but present in the working tree as a build artifact.

**`E:\club\node_modules\`:**
- Purpose: installed dependencies for frontend and backend libraries.
- Generated: Yes.
- Committed: No.

---

*Structure analysis: 2026-11-16*
