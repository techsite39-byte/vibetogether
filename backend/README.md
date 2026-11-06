# VIBE TOGETHER backend

This folder contains the Node.js API for the public site and the admin
workspace. It uses MongoDB, security headers, an explicit CORS allowlist,
bounded JSON requests, validated public submissions, and signed, server-checked
admin sessions.

## Setup

1. Install dependencies with `npm install` in this folder.
2. Copy `.env.example` to `.env` for development and set `MONGODB_URI`.
3. Set `MONGODB_DB_NAME` to the intended database (the current deployment
   configuration uses `main`).
4. Configure `CORS_ORIGIN` with the exact frontend origin(s); replace the
   placeholder in `.env.production` before production startup.
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
6. Run `npm run dev`, or use `npm start` for production.

For local production-mode startup, use `npm run start:production` (Node.js
20.6+). Deployed environments should provide `NODE_ENV=production` and the
required variables through their secret manager. Never add real environment
files to source control or expose the MongoDB URI in frontend `VITE_*` variables.

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
