# VIBE TOGETHER backend

This folder contains the Node.js API for the public site and the admin
workspace. It uses MongoDB, security headers, an explicit CORS allowlist,
bounded JSON requests, validated public submissions, and signed, server-checked
admin sessions.

## Setup

1. Install dependencies with `npm install` in this folder.
2. Create `.env` in this folder and set `MONGODB_URI`.
3. Set `MONGODB_DB_NAME=main`. The current server explicitly requires the
   `main` database; it fails startup if connected to a different database.
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
  `SMTP_PASSWORD`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, and optionally
  `SMTP_FROM_EMAIL`.
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

Configure `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` as server-only Render
variables. Never expose payment credentials to Vite. In non-production
environments, the explicit demo simulator is available only when Cashfree is
not configured; it does not charge money.

Select the active payment method on the API with `PAYMENT_PROVIDER=cashfree` or
`PAYMENT_PROVIDER=upi`. The Render Blueprint selects Cashfree
(`PAYMENT_PROVIDER=cashfree`); changing this server variable requires an API
restart/redeploy, not a frontend rebuild.

In Cashfree mode (`PAYMENT_PROVIDER=cashfree`), Cashfree is the active payment gateway.
Customers choose their preferred payment methods directly inside Cashfree's checkout modal,
including UPI payment methods (Google Pay, PhonePe, Paytm), dynamic QR codes, cards, and
netbanking. When Cashfree is active, manual UTR reference submission through
`/api/booking-enquiries/:requestId/upi-payment` is intentionally disabled (`409 Conflict`)
because UPI transactions are handled and verified automatically within Cashfree.

In direct UPI mode (`PAYMENT_PROVIDER=upi`), `UPI_ID` and `UPI_PAYEE_NAME` are public
receiving-account details (defaults are the UPI details supplied for this integration).
UPI payments reuse the saved booking enquiry. Customers submit only their UTR; the API
calculates and records the amount from the saved server-side pricing. The booking remains
pending and no permanent reference/ticket is issued until an authenticated admin verifies
the actual credit in the receiving bank account under **Admin → Booking management →
UPI payments awaiting verification**; rejection requires a reason. Keep all payment-provider
secrets server-only.

Cashfree webhook endpoints:
- Primary: `https://vibetogether-ahgy.onrender.com/api/payments/cashfree/webhook`
- Alternate alias: `https://vibetogether-ahgy.onrender.com/api/cashfree/webhook`

Configure the webhook URL in the Cashfree Merchant Dashboard under **Developers → Webhooks**.
Cashfree signs webhook notifications with HMAC-SHA256 Base64 using your active merchant
Cashfree API Secret Key. Verify that `CASHFREE_SECRET_KEY` in Render matches the Cashfree
API Secret Key generated under **Developers → API Keys**. The endpoint validates Cashfree's
HMAC-SHA256 signature against the unparsed raw request body and verifies a recent timestamp
window (10 minutes) to prevent replay attacks. It does not require customer authentication
or browser CORS access. A signed event with order and payment identifiers that cannot be
matched to a booking is stored in `main.cashfree-unmatched-payments` using only provider
order/payment IDs, amount, currency, status, event type, and timestamps. The provider payload
and customer details are not retained.

WhatsApp booking notifications use the official Meta Cloud API and are sent to
the customer's consented, validated mobile number (not the business number).
Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_SUCCESS_TEMPLATE_NAME`, and
`WHATSAPP_FAILURE_TEMPLATE_NAME` in Render. Set `WHATSAPP_APP_SECRET` to verify
Meta webhook signatures. The configured phone number ID must be the Vibe
Together sender in Meta; the recipient is always the customer's consented
number from the booking form.
Payment notifications require the approved templates
`vibetogether_payment_success` and `vibetogether_payment_failed` with language
code `en`. The application rejects other template names or locales rather than
sending a potentially unapproved template.
Templates must be submitted and approved in Meta WhatsApp Manager. The success
template parameters are customer/attendee name, booking reference, ticket
quantity, numeric amount, and ticket type or confirmation URL. The failure
template parameters are customer name, booking/request reference, numeric
amount, and retry URL. Keep the approved positional placeholders aligned with
these mappings; do not create or send a replacement template from this
documentation.

The Meta webhook endpoint is
`https://vibetogether-ahgy.onrender.com/api/whatsapp/webhook`. Configure that
callback URL and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Meta. API acceptance is
reported as **Sent**, not **Delivered**; delivery, read, and failure statuses
are recorded only from signed status webhooks. Missing consent is recorded as
**Skipped**, and notification errors never undo a finalized payment or booking.
The authenticated admin endpoint
`GET /api/admin/integrations/diagnostics` reports configured-variable names,
whether Meta accepts the configured phone number ID and access token, and
WhatsApp notification readiness. It never returns credentials. Template
approval and recipient test allowlisting must still be confirmed in WhatsApp
Manager.

WhatsApp diagnostic records use the `[WhatsApp Notification]` event and include
a safe correlation ID, notification source/type, and outcome. Outcomes include
`SKIPPED` (with a reason), `ATTEMPTED` (immediately before the Meta request),
`ACCEPTED` (with Meta's message ID, but not a delivery claim), and `REJECTED`
(HTTP status, numeric Meta error code/subcode when present, a controlled internal
reason, and retryability). Provider error messages and details are never logged;
diagnostics omit recipient values and customer or booking data. `DELIVERED`,
`READ`, and `DELIVERY_FAILED` are emitted only for
matching signed status callbacks. Text-based admin alerts use `text` as the
template and `not_applicable` as the language.

Example:

```text
[WhatsApp Notification] {
  event: 'whatsapp_notification',
  outcome: 'ATTEMPTED',
  source: 'cashfree_verification',
  notificationType: 'booking_confirmation',
  correlationId: '4f3a8c219d0e7b61',
  template: 'vibe_booking_confirmation',
  language: 'en'
}
```

These logs never include provider error details, access tokens, authorization
headers, customer names, phone numbers, email addresses, event names, booking
references, message contents, or payment identifiers.

## Payment-first category bookings

Category booking submissions are saved as seven-day temporary payment sessions
with no permanent booking reference. In demo mode, the explicit simulator records
`Demo Paid` and does not charge money. The atomic reference counter preserves the
first reference `10812026501` and advances beyond all saved references.
Legacy `SUCCESS` and `verified` payment statuses are normalized to `paid`;
`demo_paid` remains distinct but terminal, and none of these completed statuses
can create another Cashfree order. Migration removes `expiresAt` from completed
bookings while leaving unpaid and pending expiry behavior unchanged.

Provider-verified successes and provider-confirmed terminal failures are
idempotently upserted by `requestId` into MongoDB `main.bookings-db`. Pending and
cancelled attempts are not stored as failed results. Startup verifies the
configured database and that the `bookings-db` collection already exists before
initializing its unique request index.

## Booking database cutover and migration

The API connects to the MongoDB database named by `MONGODB_DB_NAME`; the current
server requires this to be `main`. New booking enquiries and payment results use
the `main.bookings-db` collection. Legacy booking enquiries are read from
`main.user-db` by the admin compatibility path. The migration reads from
`user-db` and writes to `bookings-db` within the configured database; it does
not copy between database names.
The legacy admin model intentionally declares no TTL or uniqueness indexes so
application startup will not create the `bookings-db` indexes on `user-db`.
This does not remove any index already present in MongoDB: before deployment,
an authorized database operator must verify the live `user-db` TTL index and
confirm paid legacy records are preserved. Do not change production indexes
without separate approval.

The server checks that `main.bookings-db` exists before it starts listening.
It then initializes the booking enquiry and payment-result indexes. A missing
target collection or an index creation failure prevents startup.

Run both commands from `backend/` with the intended environment loaded. The
migration script is not exposed as an npm script:

```powershell
node scripts/migrateBookingsToBookingsDb.js
node scripts/migrateBookingsToBookingsDb.js --execute
```

The first command is a dry run by default and performs no writes, but it still
connects to the configured MongoDB deployment. The second explicitly enables
writes. Supplying `--dry-run` also keeps the script in read-only mode, even if
`--execute` is present. Never run either command until the configured URI is
confirmed to target an approved non-production environment.

Before any execution, verify that `MONGODB_URI` points to the intended MongoDB
deployment and `MONGODB_DB_NAME` is `main`. Confirm the source collection exists
and its record count is expected. Take and test a restorable backup of both
`main.user-db` and `main.bookings-db`, including their index definitions, and
record pre-migration counts. Review the dry-run totals. The CLI reports counts
for state conflicts and unmigrated records but does not print their individual
identities; if either count is nonzero, stop and inspect those records with
read-only queries before proceeding. After an approved execution, compare
source and target counts and reconcile records by `requestId`, reference, and
`_id`; the CLI's target count alone is not proof of completeness.

Review the target index catalog before migration and startup. `BookingEnquiry`
declares a unique sparse `reference` index, while the legacy `Booking` model
also uses `bookings-db` and now declares the same unique sparse `reference`
index. This aligns the model definitions, but does not change an index already
stored in MongoDB. Inspect the deployed target's actual index catalog and
reconcile any existing non-sparse `reference_1` index before relying on startup
or migration. Review duplicate and null/empty reference values before changing
the catalog. The migration removes blank references from inserted records, but
does not reconcile existing index definitions or all pre-existing target data.
The models also declare unique sparse `requestId` indexes, so verify existing
identifiers and references do not violate the active unique constraints.

The migration uses unordered bulk writes, has no transaction or rollback
command, and can leave partial target writes if a non-duplicate-key error occurs.
It retries once when all bulk write errors are duplicate-key races; other
failures are reported and exit nonzero, but may follow successful writes in the
same batch. The source collection is not modified. Keep the backup until
post-migration reconciliation is complete; recovery from partial or incorrect
target writes requires restoring the backup or a separately planned manual
reconciliation. No production migration is implied by these instructions.

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
  in the `bookings-db` collection under `MONGODB_DB_NAME`. The request uses `name`,
  optional `email`, `mobile`, `categoryId` or `eventId`, `gender`, and a UUID
  `requestId`. Temporary sessions have no reference and expire after seven days.
- `GET /api/booking-enquiries/:requestId` returns the saved enquiry summary for
  the payment page.
- `POST /api/booking-enquiries/:requestId/cashfree-order` creates or retrieves a
  Cashfree payment order using server-side pricing; accepts optional `{ returnUrl, notifyUrl }`
  and returns `payment_session_id`, `order_id`, and session details.
- `POST /api/booking-enquiries/:requestId/cashfree-verify` verifies checkout completion
  by querying Cashfree PG API with `{ order_id, cf_payment_id }`; validates payment amount
  against server pricing and atomically allocates the booking reference and confirmation
  only upon verified success (`200 OK`).
- `POST /api/booking-enquiries/:requestId/cashfree-status` queries Cashfree payment
  status and reconciles the booking session, returning `{ pending, duplicate, booking }`.
- `POST /api/booking-enquiries/:requestId/cashfree-failure` records checkout dismissal,
  user cancellation, or gateway failure with `{ orderId, outcome, reason }` without
  allocating a reference, enabling retry.
- In UPI mode, `POST /api/booking-enquiries/:requestId/upi-payment` accepts a transaction
  reference only and records a pending verification against that same enquiry (disabled with 409
  when `PAYMENT_PROVIDER=cashfree`). Authenticated `POST /api/admin/upi-payments/:requestId/decision`
  verifies or rejects a UPI submission; approval is the only UPI path that confirms the booking
  and allocates its ticket reference.
- In non-production environments with Cashfree unconfigured, `POST
  /api/booking-enquiries/:requestId/demo-payment` is an explicit simulator; it records `Demo Paid`
  and finalizes that same record. `POST /api/booking-enquiries/:requestId/demo-payment-failure`
  records a failed/cancelled demo attempt without assigning a reference.
- `POST /api/booking-enquiries/:requestId/whatsapp-opt-out` revokes the
  customer's WhatsApp notification consent for the saved enquiry.
- Webhook endpoints:
  - `POST /api/payments/cashfree/webhook` (and alias `/api/cashfree/webhook`) verifies Cashfree
    HMAC-SHA256 signatures over raw request body and processes payment success/failure asynchronously.
  - `POST /api/whatsapp/webhook` verifies Meta webhook signatures and records delivery statuses.
  - Authenticated `GET /api/admin/bookings/:reference/whatsapp` returns notification history.
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
- Super Admins can review unmatched Cashfree events at
  `GET /api/admin/cashfree/unmatched-payments` and inspect one at
  `GET /api/admin/cashfree/unmatched-payments/:eventId`. Reconciliation uses
  `POST /api/admin/cashfree/unmatched-payments/:eventId/reconcile` with
  `{ "requestId": "...", "caseReference": "CASE-1234", "reasonCode": "unmatched_webhook" }`.
  Supported reason codes are `unmatched_webhook`, `late_payment`, and
  `identity_confirmed`. The action independently checks the exact Cashfree order
  and payment IDs, successful status, amount, INR currency, and refund/reversal
  indicators before matching one existing booking. It never creates a booking or
  sends a WhatsApp message. Booking, result, unmatched-event, and admin-audit
  updates run in one MongoDB transaction; MongoDB must support transactions
  (replica set or sharded cluster). The endpoint fails closed if a transaction
  cannot be used.

Before enabling reconciliation, verify that the production MongoDB deployment
supports transactions and review existing non-empty `cfPaymentId` and Cashfree
`providerPaymentId` values for duplicates. Startup creates unique partial indexes
for those identifiers and will fail if existing duplicate data prevents index
creation. The unmatched event collection and its unique payment-ID index are
initialized at startup. A Super Admin should use the provider's verified payment
evidence and the exact existing booking `requestId`, open a support case, and
submit the case reference and controlled reason code. If identity is missing or
ambiguous, leave the event for manual investigation; do not create a booking or
mark one paid manually. Reconciliation requires live Cashfree verification and
does not imply that any production event has been recovered.

Booking requests are limited to five per IP per 15 minutes per server process.
Public submission and sign-in rate limits are process-local. For multi-instance
deployments, replace them with shared rate-limit storage. Automated API tests
use in-memory repositories and do not write to MongoDB.
