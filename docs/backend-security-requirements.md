# Backend security requirements

The current VIBE TOGETHER workspace is a frontend demo. Local demo data and
client-side role checks are not authorization, and this document does not
represent a completed backend security audit. Do not deploy real customer,
organizer, admin, or payment flows until the following controls exist and are
independently verified.

## Identity and authorization

- Authenticate users on the server and use secure, `HttpOnly`, `Secure`, and
  appropriate `SameSite` session cookies. Do not trust a role, user ID, or
  permission supplied by the browser or stored in `localStorage`.
- Authorize every API operation on the server, including reads and writes, by
  the authenticated principal, tenant/organizer ownership, and requested
  resource. Enforce least privilege for customer, organizer, admin, and
  super-admin roles; deny by default.
- Protect state-changing cookie-authenticated requests against CSRF, validate
  origins, and configure CORS with explicit trusted origins.
- Record security-sensitive changes in tamper-resistant audit logs without
  logging credentials, payment data, or unnecessary personal information.

## Bookings and payments

- Recalculate prices, fees, currency, ticket limits, availability, and booking
  ownership on the server. Never accept client totals as authoritative.
- Create checkout sessions only on the server using provider credentials kept
  in server-side secret storage. Do not expose private keys in `VITE_*` values
  or ship them in browser bundles.
- Confirm payment only after server-to-server verification with the payment
  provider or validation of a signed webhook. Verify signature, amount,
  currency, order/session, event, and idempotency before marking a booking
  paid; reject replayed, expired, mismatched, or unverified references.
- Treat the browser return URL as untrusted display/navigation data, never as
  evidence of payment. Do not fulfill tickets or show a paid confirmation
  until the server has persisted a verified payment state.
- Keep attendee details private. Return only the minimum fields needed for a
  user's own booking and prevent cross-account or cross-organizer access.

## Input, output, and service operations

- Validate and normalize all input on the server with allowlists, length and
  range limits, strict identifier and enum checks, and safe handling of
  Unicode. Do not rely on browser validation.
- Use parameterized database operations and context-aware output encoding;
  sanitize any intentionally supported rich text. Never render untrusted
  content as executable HTML.
- Apply rate limits and abuse controls to authentication, booking, checkout,
  contact, review, and organizer submission endpoints. Use explicit request
  size limits and secure error responses that do not disclose internals.
- Store secrets outside source control and frontend build-time environment
  variables, rotate them, restrict their access, and scan release artifacts
  for accidental exposure.
- Define retention, deletion, access, and breach-response procedures for
  personal information, and use encrypted transport and protected storage.

## Required verification before production

Test server-side authorization for every API route and role, cross-user and
cross-organizer access, validation and rate limits, CSRF/CORS behavior, payment
webhook signatures and replay handling, idempotency, privacy of booking
responses, and secret exposure in deployed assets. A frontend route test or
successful local build cannot establish these controls.
