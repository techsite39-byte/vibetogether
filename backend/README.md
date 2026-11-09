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

The booking flow uses a database-backed Diwali offer, initially activated once
when the offer record is first created. Its activation and expiry are persisted;
the expiry is exactly 72 hours after activation and is never reset on page
refresh or server restart. Super-admins can edit the activation, expiry, enable
flag, and prices in **Admin → Settings**. Backend order creation independently
calculates the active price: ₹249 (24,900 paise) during the offer, otherwise
₹299 (29,900 paise). An existing order retains its original price; a new order
after a failed attempt uses the then-current server price.

Configure these server-only Render variables for Razorpay:
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
The webhook secret is the separate secret configured in the Razorpay dashboard.
The signed checkout callback and payment-status fetch verify the order, amount,
currency, signature, and captured status before atomically assigning a permanent
booking reference. Failed payment sessions remain retryable without a
permanent reference. Never prefix or expose any Razorpay secret to Vite.
Without the key ID and key secret, the page uses the explicit demo simulator;
it does not charge money.

Razorpay webhook endpoint:
`https://vibetogether-ahgy.onrender.com/api/razorpay/webhook`

Configure the same `RAZORPAY_WEBHOOK_SECRET` value in Render and in the
Razorpay Test Mode webhook settings. Subscribe to `payment.captured`,
`payment.failed`, and `order.paid`. A failed payment attempt is not treated as
a terminal booking failure by itself; the checkout dismissal/status check
reconciles all attempts before sending assistance, so a later successful retry
is not preceded by a false failure message.

WhatsApp booking notifications use the official Meta Cloud API and are sent to
the customer's consented, validated mobile number (not the business number).
Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_SUCCESS_TEMPLATE_NAME`, and
`WHATSAPP_FAILURE_TEMPLATE_NAME` in Render. Set `WHATSAPP_APP_SECRET` to verify
Meta webhook signatures. The configured phone number ID must be the Vibe
Together sender in Meta; the recipient is always the customer's consented
number from the booking form.
Templates must be submitted and approved in Meta WhatsApp Manager, use
`en_US`, and match the following body text and placeholder order.

Success template:

```text
✨ VIBE TOGETHER – BOOKING CONFIRMATION ✨
Hello {{1}}! 👋
Thank you for choosing Vibe Together! 💜
Your payment has been successfully completed and your booking has been registered.
🎟️ YOUR BOOKING REFERENCE:
{{2}}
📋 BOOKING DETAILS
Name: {{3}}
Mobile: {{4}}
Email: {{5}}
Category: {{6}}
Gender: {{7}}
Booking Date: {{8}}
💳 PAYMENT DETAILS
{{9}}
Payment Status: {{10}}
📌 BOOKING STATUS: {{11}}
Thank you for being part of Vibe Together!
Your next story starts here! ✨
🌐 https://www.vibetogether.show/
VIBE TOGETHER
Connect. Celebrate. Experience. 💜
```

`{{9}}` is populated from the finalized booking with regular price and amount
paid, plus the Diwali offer price only when the booking actually received it.
`{{11}}` is `Approved` or `Pending Approval`.

Failure/payment-assistance template:

```text
✨ VIBE TOGETHER – PAYMENT ASSISTANCE ✨
Hello {{1}}! 👋
We noticed that your Vibe Together booking payment was not completed.
Don't worry! You can try again.
📋 YOUR BOOKING DETAILS
Name: {{1}}
Mobile: {{2}}
Category: {{3}}
💳 Payment Amount: {{4}}
Payment Status: {{5}}
Your booking has not yet been confirmed.
Please return to Vibe Together and retry your payment to complete your booking.
Need assistance? Contact our team.
🌐 https://www.vibetogether.show/
VIBE TOGETHER
Your next story starts here! 💜
```

For the failure template, `{{1}}` is the customer name, `{{2}}` mobile,
`{{3}}` category, `{{4}}` applicable amount, and `{{5}}` failed/cancelled
payment status. Do not include a permanent booking reference.

The Meta webhook endpoint is
`https://vibetogether-ahgy.onrender.com/api/whatsapp/webhook`. Configure that
callback URL and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Meta. API acceptance is
reported as **Sent**, not **Delivered**; delivery, read, and failure statuses
are recorded only from signed status webhooks. Missing consent is recorded as
**Skipped**, and notification errors never undo a finalized payment or booking.
The authenticated admin endpoint
`GET /api/admin/integrations/diagnostics` reports configured-variable names,
Razorpay mode/webhook readiness, and whether Meta accepts the configured phone
number ID and access token. It never returns credentials. Template approval and
recipient test allowlisting must still be confirmed in WhatsApp Manager.

## Payment-first category bookings

Category booking submissions are saved as seven-day temporary payment sessions
with no permanent booking reference. In demo mode, the explicit simulator records
`Demo Paid` and does not charge money. The atomic reference counter preserves the
first reference `10812026501` and advances beyond all saved references.

Run `npm run bookings:reconcile` in the backend directory for a read-only summary
of referenced unpaid records, demo/actual paid records, failed payment records,
temporary sessions, legacy WhatsApp failures, the maximum assigned reference,
and the saved counter value. To backfill expiry only for unreferenced temporary
sessions missing it, explicitly run
`npm run bookings:reconcile -- --backfill-temporary-expiry`; this sets their
expiry to seven days after creation and never deletes or changes payment/reference
data.

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
- `POST /api/booking-enquiries` validates and stores a temporary payment session
  in the `user-db` collection under `MONGODB_DB_NAME`. The request uses `name`,
  optional `email`, `mobile`, `categoryId` or `eventId`, `gender`, and a UUID
  `requestId`. Temporary sessions have no reference and expire after seven days.
- `GET /api/booking-enquiries/:requestId` returns the saved enquiry summary for
  the payment page. `POST /api/booking-enquiries/:requestId/razorpay-order`
  creates or reuses a server-priced order; `POST
  /api/booking-enquiries/:requestId/verify-payment` verifies checkout
  signatures and captured status before finalizing. When Razorpay is not
  configured, `POST /api/booking-enquiries/:requestId/demo-payment` is an
  explicit simulator; it records `Demo Paid` and finalizes that same record.
  `POST /api/booking-enquiries/:requestId/demo-payment-failure` records a
  failed/cancelled demo attempt without assigning a reference.
- `POST /api/booking-enquiries/:requestId/whatsapp-opt-out` revokes the
  customer's WhatsApp notification consent for the saved enquiry.
- `POST /api/whatsapp/webhook` verifies Meta webhook signatures and records
  delivery statuses; `/api/razorpay/webhook` verifies Razorpay signatures and
  processes payment updates idempotently. Authenticated
  `/api/admin/bookings/:reference/whatsapp` returns notification history.
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
