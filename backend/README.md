# VIBE TOGETHER backend

This folder contains the Node.js API for the public site and the admin
workspace. It uses MongoDB, security headers, an explicit CORS allowlist,
bounded JSON requests, validated public submissions, and signed, server-checked
admin sessions.

## Setup

1. Install dependencies with `npm install` in this folder.
2. Create `.env` in this folder and set `MONGODB_URI`.
3. Set `MONGODB_DB_NAME` to the intended database (the current deployment
   configuration uses `main`).
4. Configure `CORS_ORIGIN` with the exact frontend origin(s).
5. Configure `ADMIN_EMAIL` and `ADMIN_SESSION_SECRET` through the local
   environment or secret manager. In an interactive terminal, run
   `npm run admin:provision` (or `npm run admin:provision:production`) and
   enter the password at the hidden prompt. The password is bcrypt-hashed into
   the existing `admin-cred` collection; duplicate email accounts are not
   created, and an existing account's password is never silently replaced.
   Never commit generated credentials or expose them through frontend variables.
   `ADMIN_PASSWORD_HASH` is optional and is only used to bootstrap a missing
   account for automated deployments. The older `ADMIN_USERNAME` setting and
   scrypt hashes remain supported for compatibility.
   To change an existing super-admin email and password, run
   `npm run admin:set-password -- new-admin@example.com` in an interactive
   terminal. The command prompts for the new password twice without echoing it,
   enforces the 12-character minimum, updates the matching super-admin record
   and backend `.env`, and revokes that account's existing sessions.
6. Run `npm run dev`, or use `npm start` for production. Development watch
   mode monitors `backend/src` only, so dependency updates under `node_modules`
   do not restart the API and interrupt Vite proxy requests.

Google sign-in is available for existing, active admin accounts only. It never
creates an admin account or assigns an admin role based on a Google identity.
Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`
in the backend environment. The callback URL must exactly match the Google
Cloud Console's Authorized redirect URI and use
`/api/admin/auth/google/callback` (for this production deployment:
`https://vibetogether-ahgy.onrender.com/api/admin/auth/google/callback`). The
redirect-based server flow does not expose the client secret to the browser.
Confirm each deployed frontend origin is in `CORS_ORIGIN`; OAuth client origins
and redirect URIs must also match the actual deployment in Google Cloud Console.
In development, `GET /api/admin/auth/google/debug` reports the configured
client ID, callback URL, backend port, frontend origin, and configuration
status without exposing the client secret; it is unavailable in production.
The login flow passes its frontend origin through a validated local-development
parameter so the callback returns to the page's actual Vite port.

Password reset requires working SMTP credentials. When SMTP or Google OAuth is
not configured, the API reports that configuration is missing and does not
simulate successful authentication or email delivery.

For local production-mode startup, use `npm run start:production` (Node.js
20.6+); this uses the same `.env` file and sets `NODE_ENV=production`.
Deployed environments should provide `NODE_ENV=production` and the required
variables through their secret manager, overriding local `.env` values when
needed. Never add real environment files to source control or expose the
MongoDB URI in frontend `VITE_*` variables.

## Render deployment

The repository root contains a Render Blueprint for the API and Vite static
site. In Render, create a Blueprint from this repository and configure the
prompted secret values. The API service uses `backend/`, `npm ci --omit=dev`,
and `npm start`; its readiness health check is `/api/health/ready`. The Vite
site builds from the repository root with `npm ci --include=dev && npm run build`
and publishes `dist`.

Configure secrets in Render, not in frontend code:

- API: `MONGODB_URI`, `MONGODB_DB_NAME=main`, `CORS_ORIGIN`, `ADMIN_EMAIL`,
  `ADMIN_SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_CALLBACK_URL`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`,
  `SMTP_PASSWORD`, and optionally `SMTP_FROM_EMAIL`.
- API account bootstrap: generate a bcrypt password hash locally with
  `npm run admin:credentials` from `backend/` and set `ADMIN_PASSWORD_HASH` if
  the target database does not already contain the admin account. Never put
  the plaintext password or hash in a frontend variable.
- Frontend: set `VITE_API_URL` to
  `https://vibetogether-ahgy.onrender.com/api`. This is a build-time setting;
  redeploy the frontend after changing it.

Set the API's `CORS_ORIGIN` to `https://www.vibetogether.show` and
`GOOGLE_CALLBACK_URL` to
`https://vibetogether-ahgy.onrender.com/api/admin/auth/google/callback`. Add
that exact callback to Google Cloud Console under **Authorized redirect URIs**.
Set `VITE_API_URL` in the Vercel frontend project to
`https://vibetogether-ahgy.onrender.com/api`, then redeploy the frontend after
changing it. Add the frontend origin under **Authorized JavaScript origins**
only if using a browser-based Google credential flow. Production admin session
cookies use `SameSite=None; Secure` so credentialed API calls work across the
Vercel and Render origins; CORS remains restricted to the configured frontend.

The booking enquiry payment screen currently runs in demo mode. A demo payment
updates the original booking enquiry with one idempotent demo payment status;
it does not call Razorpay Checkout or collect money. The server-side provider
boundary is deliberately separate so real order creation, Checkout,
signature verification, and webhook verification can be added later.

Use `/api/health` for a process liveness check and `/api/health/ready` to
confirm MongoDB connectivity. The API now waits for MongoDB and startup
initialization before listening, so a failed database connection fails the
deployment instead of appearing healthy with unavailable data APIs.

## Health endpoints

- `GET /api/health` reports whether the API process is alive.
- `GET /api/health/ready` reports whether MongoDB is connected; it returns
  `503` until the database is ready.
- `GET /api/events` returns published records from MongoDB's `events-db`
  collection. Startup adds the existing event catalog only when the collection
  is empty and fills fields missing from matching legacy records without
  replacing existing values.
- `POST /api/booking-enquiries` validates and stores enquiries in the
  `user-db` collection under `MONGODB_DB_NAME`. The request uses `name`,
  `mobile`, `eventId`, `gender`, and a UUID `requestId`. Event names,
  timestamps, source (`Website booking journey`), and pending status are resolved
  by the server.
- `GET /api/booking-enquiries/:requestId` returns the saved enquiry summary for
  the payment page. `POST /api/booking-enquiries/:requestId/demo-payment`
  atomically records one fixed ₹299 demo payment on that same record.
- `POST /api/newsletter` stores subscriptions in `newsletter-db`.
- `POST /api/enquiries/contact` and `POST /api/enquiries/host-event` store
  contact and event-hosting requests in `enquiry-db`.
- `/api/admin/auth` provides environment-bootstrapped sign-in and signed,
  HttpOnly, SameSite session cookies. All `/api/admin` data routes require a
  valid active MongoDB admin record and CSRF verification for writes.
- `/api/admin` supports paginated record endpoints and CRUD for events,
  bookings, users, organizers, categories, testimonials, subscribers,
  enquiries, gallery media, admins, platform settings, and activity records.
  Existing collection names are retained for `events-db`, `user-db`,
  `admin-cred`, `testimonial-db`, and `gallery-db`; other missing domains use
  separate collections.

Booking requests are limited to five per IP per 15 minutes per server process.
Public submission and sign-in rate limits are process-local. For multi-instance
deployments, replace them with shared rate-limit storage. Automated API tests
use in-memory repositories and do not write to MongoDB.
