---
status: awaiting_human_verify
trigger: "booking datas was not storeing in mongodb data base fix it first"
created: 2026-11-18
updated: "2026-11-18T15:07:00+05:30"
---

## Symptoms

- Expected: Booking enquiry/record is persisted at booking submission and reflects the final payment outcome.
- Actual: User reports production booking data is not appearing in MongoDB; screenshot shows an empty `bookings-db` collection.
- Errors: The user supplied `bookings-db` as the error/request detail. A separate screenshot shows `{"message":"Booking enquiry was not found."}` for a request named `retry`; it is not confirmed to be the booking-create request.
- Timeline: Unknown.
- Reproduction: Unknown; no steps or booking attempt details supplied.

## Current Focus

bug_class: bohrbug (the route/result interpretation is deterministic; identity of the separate create request remains unverified)
hypothesis: The specific 404 shown in the supplied Network screenshot is attributable to the `retry` lookup, not the create POST: its row is named `retry` and its response says the booking enquiry was not found. The user's separate report that create returned 404 is not independently attributable without the create POST's retained response.
candidate_causes:
- code: retry lookup returns not-found when it cannot resolve an existing enquiry; this accounts for the screenshot response but does not explain whether create persisted.
- config/environment: the user reports Render DB name `main` and the Mongo view both show `main`, but cluster identity/effective runtime target is not independently verified; readiness proves connectivity only.
- data: `user-db` reportedly has no recent records; without an exact request/record timestamp, that cannot distinguish a failed create from an inspected target mismatch or expiration.
and_gate: no; these remain independent explanations and evidence does not establish simultaneous contributing causes.
test: Review of supplied evidence and already-retained project artifacts is complete; no local retained create-response capture/log was found. Do not make requests, access production DB, or create a booking/payment.
expecting: The screenshot's 404 is attributable to retry lookup. The separate create-POST result remains unverified unless its retained HTTP status and sanitized response are available.
next_action: Ask only whether the original create request's retained Network method and path are exactly POST /api/booking-enquiries or a different path. Do not request response bodies containing PII or IDs. If the user cannot identify the method/path, keep this session awaiting_human_verify and explain that no safe code fix can be inferred.

## Evidence
- timestamp: 2026-11-18T15:11:43+05:30
  checked: Narrowed retained-evidence update and scope check.
  found: The user reports the create request returned 404, but gave no original response body. The supplied screenshot names the request `retry` and shows `{"message":"Booking enquiry was not found."}`. Source inspection and a single safe empty-JSON probe confirm the create POST route exists and responds 400 for validation; no record was created.
  implication: The screenshot does not establish the create POST result. The only remaining safe identifier needed is whether the original create Network entry is exactly POST /api/booking-enquiries or a different path such as /api/booking-enquiries/<redacted-id>/... No body, PII, ID, database access, or additional request is needed.
- timestamp: 2026-11-18T15:01:00+05:30
  checked: Full create/save completion and error handling, plus Mongo connection wrapper.
  found: Save awaits the model's `create`; non-duplicate errors propagate to the route's 503 response. The app connects with `mongoose.connect(uri, { dbName: databaseName })`, where the server passes runtime config values. The model also declares a TTL index on `expiresAt`; newly created enquiry sessions are assigned a seven-day expiry. No POST response, correlated log, or exact booking age is available.
  implication: There is no observed silent-success/drop in this source path. A failed POST remains possible but unproven; a mismatched runtime database/cluster or an expired record remain environmental/data possibilities, also unproven. No valid source defect is established, and no application change is authorized or justified.

- timestamp: 2026-11-18T15:00:30+05:30
  checked: Active booking-enquiry route, service save implementation, model collection declaration, server repository wiring/route mount, and server connection call.
  found: `POST /api/booking-enquiries` validates, awaits `repository.save`, then returns 201 (or duplicate 200); errors in persistence are caught and return 503. Server wires this route to `saveBookingEnquiry`; that service creates through `BookingEnquiry`; the schema explicitly selects `user-db`. Server connects using config-provided URI and database name. This is the active payment-first route, distinct from legacy `/api/bookings`.
  implication: Checked-in source provides a persistence path to `user-db` and explicit failure response for a failed create/save. Without the booking POST status/body or server-side failure record, neither path is observed in production. Source does not establish a defect.

- timestamp: 2026-11-18T15:00:00+05:30
  checked: Safe source/config only: backend `config/env.js`, readiness route, and checked-in `render.yaml`.
  found: Runtime config takes the DB name from `MONGODB_DB_NAME` (default `main`) and URI from `MONGODB_URI`; the readiness route reports only `mongoose.connection.readyState`, returning `database: connected` when ready. Render blueprint declares DB name `main` and an externally supplied URI, but cannot establish dashboard overrides or which deployment the user's Mongo view targets. No secret values were read or emitted.
  implication: New readiness result proves connection liveness only; it cannot distinguish a failed booking POST from the API writing to another effective DB/collection. Checked-in defaults alone do not prove the live target.

- timestamp: 2026-11-18T14:59:28+05:30
  checked: New user-provided production observations: `user-db` in the same MongoDB view has no recent records; the configured production API readiness GET returned `{"status":"ready","database":"connected"}`; checked-in `render.yaml` sets `MONGODB_DB_NAME=main`; dashboard overrides remain unknown; no timeline or reproduction steps are available.
  found: The readiness response establishes a connected database but does not reveal the live database name, cluster, collection contents, or outcome of a booking POST. The user's empty `user-db` view is not yet shown to be the exact effective database selected by the API. No booking POST response/log or reproducible attempt was supplied.
  implication: Neither a failed POST nor a production API writing to another DB/collection is established. Source/config inspection must remain read-only and limited; production DB access, new booking/payment attempts, secret disclosure, deployment/config changes, and application edits are prohibited. Preserve `awaiting_human_verify` pending exact-target non-secret verification.

- timestamp: 2026-11-18T14:50:00+05:30
  checked: Cashfree and Razorpay order/finalization/webhook implementations and booking API/payment tests.
  found: Cashfree order creation calls `await enquiry.save()`, successful verification/webhook paths persist paid status/reference/timestamps with `save()`, and failed attempts persist failed status; Razorpay captures/webhooks use `findOneAndUpdate` against BookingEnquiry. Existing tests explicitly cover initial saved enquiries, persisted state reload, final paid state, failed/retry state, duplicate callbacks, and missing request IDs.
  implication: Source shows write operations for initial submission and payment outcome, with regression coverage; there is no code-based evidence yet to justify altering schema/collection or payment logic. This does not establish that the deployed runtime connects to the expected production database.

- timestamp: 2026-11-18T14:50:30+05:30
  checked: Initial attempt to run focused npm tests, build, and lint from PowerShell.
  found: All four commands failed before invocation because PowerShell execution policy blocks the npm.ps1 shim; no test/build/lint code ran.
  implication: This is an environment invocation issue, not application evidence. Re-run via npm.cmd without changing execution policy.

- timestamp: 2026-11-18T14:51:00+05:30
  checked: Frontend booking API test, production build, lint, and first backend-test command.
  found: `test/bookingEnquiryPayment.test.js` passed (1/1); `npm.cmd run build` passed with a large-chunk warning; `npm.cmd run lint` exited 0 with warnings including existing issues in booking files. The backend test command ran from repo root and Node could not find backend-relative test paths, so it did not execute those tests.
  implication: Frontend request contract/build/lint passed; backend persistence assertions remain to be run from the backend package.

- timestamp: 2026-11-18T14:52:00+05:30
  checked: Repository inventory and project-skill discovery.
  found: Separate Vite frontend and Express/Mongoose backend packages are present; booking-specific tests exist. No project skill directories/configured debugger skills were found. Existing unrelated worktree changes were identified and preserved.
  implication: Local source and safe tests can be examined without production credentials.

- timestamp: 2026-11-18T14:52:00+05:30
  checked: Active frontend flow, route registration, backend route/service/model, Mongo connection config, Render blueprint, and older booking endpoint.
  found: `BookingJourney` posts `/api/booking-enquiries` and navigates to payment after success. The route awaits `repository.save`; server maps that to `saveBookingEnquiry`, which calls `BookingEnquiry.create`; the model sets collection `user-db`. `MONGODB_DB_NAME` defaults to `main` and Render blueprint sets `main`. The old `/api/bookings` route writes model `Booking` to `bookings-db`; the payment-first flow uses a separate model.
  implication: The active flow is intentionally stored in `main.user-db` by the checked-in defaults, not `bookings-db`; the empty legacy collection alone does not demonstrate missing persistence.

- timestamp: 2026-11-18T14:52:00+05:30
  checked: Payment order, verification, webhook persistence and regression coverage.
  found: Cashfree saves initial order changes and payment success/failure updates via Mongoose document `save()`. Razorpay captured/webhook results update BookingEnquiry with `findOneAndUpdate`. Focused tests cover session creation, reload, paid/failed outcomes, retries, idempotency, and callbacks.
  implication: No source-level absence of persistence found for payment outcomes.

- timestamp: 2026-11-18T14:52:00+05:30
  checked: Focused booking backend tests, frontend API contract test, production build, and lint.
  found: Backend booking/service/Cashfree/Razorpay/webhook tests passed 59/59. Frontend `bookingEnquiryPayment` test passed 1/1. Production build passed (large chunk warning); lint exited 0 with warnings, including existing warnings in booking UI/payment files. Initial invocations through `npm.ps1` were blocked by execution policy; `npm.cmd` succeeded.
  implication: Local flow contracts and adjacent payment paths pass. Tests use fakes/mocks and do not verify live MongoDB deployment state.

- timestamp: 2026-11-18T14:52:00+05:30
  checked: User-provided empty `bookings-db` screenshot and retry error context.
  found: The retry message is returned by a lookup/payment path when a requestId has no matching session; it is not confirmed as the original POST create response. Reproduction, timestamp, request ID, exact database, and effective production config are unknown.
  implication: Production write success remains unconfirmed and cannot safely be inferred from local tests or this screenshot.

- timestamp: 2026-11-18T15:07:00+05:30
  checked: New user-supplied production observations plus retained project artifacts only; no API/DB access or new transaction was performed.
  found: User reports `user-db` has no recent records and Render's configured database name is `main`, matching the database name shown in their Mongo view; this does not independently establish same cluster/effective runtime target. The supplied Network screenshot's row is named `retry` and its response body is `{"message":"Booking enquiry was not found."}`. User separately reports the original create request returned 404, but no original POST response or correlated log is available in retained project artifacts (searched `.planning`, `docs`, `test`, `tests`, and `backend/test`). The safe readiness GET returned 200 with `database: connected`, which establishes connectivity only. The invalid empty-JSON POST to the create endpoint returned 400 validation error, confirming route registration without creating a record. Built frontend JS points to `https://vibetogether-ahgy.onrender.com/api` and contains commit `8b488b0dcdbb787a690ea427ca4c4011a39e6bfb`.
  implication: The pictured 404 is attributable to the retry lookup, not the create POST. The separate user-reported create 404 cannot be classified from retained evidence; route registration, readiness, matching database-name text, and the deployed bundle do not prove the POST's outcome or exact Mongo target. No source fix is justified.
## Eliminated

- hypothesis: The active frontend never calls the persistence endpoint or does not await its result.
  evidence: BookingJourney awaits `submitBookingEnquiry`; it navigates only after success, and the backend route awaits `repository.save()` before returning 201.
  timestamp: 2026-11-18T14:52:00+05:30

- hypothesis: Payment success/failure only updates browser state and is not saved.
  evidence: Cashfree success/failure paths call `enquiry.save()`; Razorpay finalization/webhook paths call `findOneAndUpdate`; focused provider tests pass.
  timestamp: 2026-11-18T14:52:00+05:30

- hypothesis: The separate `Booking enquiry was not found` retry response proves the create request failed.
  evidence: User evidence does not tie that request to create; backend returns this when lookup cannot find an existing requestId.
  timestamp: 2026-11-18T14:52:00+05:30

## Resolution

root_cause: The specific screenshot 404 is from the `retry` lookup, not the create POST. No root cause for the reported missing persistence is established; although the user reports the original create POST returned 404, its retained response is unavailable, and the effective API Mongo target is not independently verified.
fix: No source fix applied. Application edits, payment/schema changes, deployment changes, production MongoDB access, and new booking/payment attempts are outside the authorized scope and unsupported by current evidence.
verification: Earlier focused local checks passed (59/59 backend tests, 1/1 frontend contract test, build passed with a large-chunk warning, lint exited 0 with warnings); they do not verify production. New evidence: readiness 200 confirms connection only; invalid empty-body create POST returned 400 and confirms route registration only; screenshot 404 is explicitly a `retry` row with not-found body. No retained original create POST response/log was found in the inspected project evidence directories. User reports `user-db` empty and database name `main` matches their view, but cluster/effective runtime target remains unverified. No source change, production DB access, or new transaction was made. Await only the original create POST HTTP status and sanitized response (if retained); otherwise the create-result-versus-runtime-target distinction remains unresolved.
files_changed: []
oracle_type: not applicable (no regression test added because no code fix was justified)
