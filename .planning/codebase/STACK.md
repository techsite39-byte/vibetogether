---
last_mapped_commit: dfd13358e4048e76e43d14d8b409d3eec824b005
last_mapped_at: 2026-11-16
---
﻿# Technology Stack

**Analysis Date:** 2026-11-16

## Languages

**Primary:**
- JavaScript (ES modules) - used throughout the frontend in `src\` and the backend in `backend\src\`, with JSX in `src\App.jsx`, `src\main.jsx`, and API routes in `backend\src\routes\`.
- HTML/CSS - used for the Vite app shell in `index.html`, `src\index.css`, and `src\App.css`.

**Secondary:**
- YAML - deployment configuration in `render.yaml` and `vercel.json`.
- JSON - manifest and test data settings in `package.json`, `backend\package.json`, and lockfiles.

## Runtime

**Environment:**
- Node.js >= 20.6 - enforced in `backend\package.json` and used to run the Express server via `backend\src\server.js`.
- Vite dev server - configured in `vite.config.js` to serve the React app on port 5173 and proxy `/api` to `http://127.0.0.1:4000`.

**Package Manager:**
- npm - root project package manager, with `package-lock.json` present.
- Lockfile: present

## Frameworks

**Core:**
- React 19.3.1 - frontend framework; declared in `package.json` and mounted from `src\main.jsx`.
- React Router 7.18.5 - client-side route handling in app code under `src\pages\` and `src\components\`.
- Express 5.1.0 - backend HTTP server used by `backend\src\app.js` and `backend\src\server.js`.
- Mongoose 8.12.1 - MongoDB ODM used by `backend\src\db\connect.js` and models in `backend\src\models\`.

**Testing:**
- Node.js built-in test runner - configured via `"test": "node --test"` in both `package.json` and `backend\package.json`.
- Test files are present under `backend\test\` and `test\` with WhatsApp/payment integration tests.

**Build/Dev:**
- Vite 8.3.6 - build and dev tooling in `vite.config.js`; frontend build script is `npm run build`.
- Oxlint 1.90.0 - linting configured via `.oxlintrc.json` and `npm run lint` in `package.json`.

## Key Dependencies

**Critical:**
- `@vitejs/plugin-react` 6.1.2 - React support for Vite in `vite.config.js`.
- `lucide-react` 1.69.0 - iconographic UI library used across `src\components\`.
- `react` 19.3.1 and `react-dom` 19.3.1 - core frontend runtime.
- `express` 5.1.0 - API server runtime used in `backend\src\app.js`.
- `mongoose` 8.12.1 - MongoDB access used by backend data access.
- `bcryptjs` 3.0.3 - password hashing for admin auth in `backend\src\auth\adminAuth.js`.
- `nodemailer` 10.3.1 - outbound email service in `backend\src\services\emailService.js`.
- `razorpay` 2.9.8 - Razorpay SDK for payment verification and webhooks.

**Infrastructure:**
- `cors` 2.8.5 - configured in `backend\src\app.js` to restrict allowed origins.
- `dotenv` 16.4.7 - environment loading in `backend\src\config\env.js`.
- `helmet` 8.1.0 - HTTP security headers in `backend\src\app.js`.
- `libphonenumber-js` 1.13.15 - phone validation/normalization used by booking and WhatsApp features.
- `qrcode` 1.5.4 - QR code generation in frontend/client flows (`src\services\` and related UI).
- `@lottiefiles/dotlottie-react` 0.21.1 - animated media support in the frontend.

## Configuration

**Environment:**
- Local and deployment configuration is primarily environment-variable based via `.env` and deployment services; the repository does not expose those values in source files.
- Backend validation of required env keys happens in `backend\src\config\env.js` for MongoDB, payment providers, admin auth, Google OAuth, SMTP, and WhatsApp.
- Frontend API base URL is resolved in `src\config\api.js` with `VITE_API_URL` or `VITE_API_BASE_URL` overriding the default production endpoint.

**Build:**
- Root build config is in `vite.config.js` with React plugin setup, custom chunk splitting, and `/api` proxy rules.
- Deployment manifest is in `render.yaml` for backend deployment and `vercel.json` for static frontend routing.

## Platform Requirements

**Development:**
- Node.js runtime and npm install in the repo root; backend also has its own `backend\package.json` and separate execution context.
- Frontend runs via `npm run dev` or `node scripts\start-dev.js`; backend runs via `npm run server` or `npm run server:dev` from the root project.

**Production:**
- Render serves the Node backend from `backend\` with `render.yaml` and a static frontend on Vercel or Render as configured in `render.yaml` and `vercel.json`.
- Static asset caching and SPA rewrite rules are defined in `render.yaml` and `vercel.json`.

---

*Stack analysis: 2026-11-16*
