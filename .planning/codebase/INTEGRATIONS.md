---
last_mapped_commit: dfd13358e4048e76e43d14d8b409d3eec824b005
last_mapped_at: 2026-11-16
---
﻿# External Integrations

**Analysis Date:** 2026-11-16

## APIs & External Services

**Payments:**
- Cashfree - used for payment intent creation, verification, and webhooks in `backend\src\services\cashfreePayments.js` and `backend\src\app.js`.
  - SDK/Client: `cashfree`/custom service wrapper, configured via env keys such as `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, and `CASHFREE_ENV`.
  - Auth: environment variables for app ID, secret, and environment.
- Razorpay - used for payment order creation, signatures, and webhook validation in `backend\src\services\razorpayPayments.js` and `backend\src\routes\razorpayWebhook.js`.
  - SDK/Client: `razorpay` package from `backend\package.json`.
  - Auth: environment variables such as `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
- UPI - public payment flow fallback using `UPI_ID` and `UPI_PAYEE_NAME` in `backend\src\config\env.js`.

**Communication:**
- WhatsApp Business API - used for booking notifications and webhook-driven inbound/outbound messaging via `backend\src\services\whatsappNotifications.js` and `backend\src\routes\whatsappWebhook.js`.
  - SDK/Client: native fetch-based integration; no direct external SDK declared.
  - Auth: environment variables such as `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET`.
- SMTP email - used for admin and transactional notifications through `backend\src\services\emailService.js`.
  - SDK/Client: `nodemailer` package.
  - Auth: environment variables such as `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL`.

**Identity / Access:**
- Google OAuth - used for admin authentication in `backend\src\auth\adminAuth.js`.
  - SDK/Client: Google OAuth token exchange implemented directly from the backend.
  - Auth: environment variables such as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`.

## Data Storage

**Databases:**
- MongoDB - primary application database, validated in `backend\src\config\env.js` and connected in `backend\src\db\connect.js`.
  - Connection: `MONGODB_URI` and `MONGODB_DB_NAME`
  - Client: `mongoose` ODM

**File Storage:**
- Local filesystem only; no cloud object storage or uploaded-file service is configured in the repo evidence.

**Caching:**
- None detected in repository evidence; no Redis or CDN cache service is configured in the app code.

## Authentication & Identity

**Auth Provider:**
- Custom admin session auth plus Google OAuth integration.
  - Implementation: session-based authentication and Google identity verification in `backend\src\auth\adminAuth.js`, with session secret and password hash env settings in `backend\src\config\env.js`.

## Monitoring & Observability

**Error Tracking:**
- Not detected as a dedicated external provider; backend uses `console.info` and `console.error` in `backend\src\server.js` and `backend\src\app.js`.

**Logs:**
- Node process logs and Express request error handling in `backend\src\app.js`; no external log aggregator is configured in repository evidence.

## CI/CD & Deployment

**Hosting:**
- Render is configured for the backend service in `render.yaml`.
- Vercel static deployment settings are configured in `vercel.json` for the frontend SPA.

**CI Pipeline:**
- Not detected in the repository; no GitHub Actions or equivalent pipeline file was identified in the project root scan.

## Environment Configuration

**Required env vars:**
- MongoDB: `MONGODB_URI`, `MONGODB_DB_NAME`
- App/runtime: `NODE_ENV`, `PORT`, `FRONTEND_URL`, `CORS_ORIGIN`, `PAYMENT_PROVIDER`
- Admin/auth: `ADMIN_EMAIL`, `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
- Payment: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `UPI_ID`, `UPI_PAYEE_NAME`
- WhatsApp: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_SUCCESS_TEMPLATE_NAME`, `WHATSAPP_FAILURE_TEMPLATE_NAME`

**Secrets location:**
- Environment variables are loaded from `.env` files for local runtime and from deployment service secret stores for Render/Vercel; no secret values are read or copied from source files.

## Webhooks & Callbacks

**Incoming:**
- `/api/payments/cashfree/webhook` and `/api/cashfree/webhook` in `backend\src\app.js`
- `/api/whatsapp/webhook` in `backend\src\app.js`
- `/api/razorpay/webhook` in `backend\src\app.js`
- Google OAuth callback at `/api/admin/auth/google/callback` in `backend\src\config\env.js` and `backend\src\auth\adminAuth.js`

**Outgoing:**
- Frontend API calls are routed through `src\config\api.js` to the configured backend URL.
- Payment and WhatsApp notifications are initiated from backend services in `backend\src\services\` and sent to Cashfree, Razorpay, and WhatsApp endpoints at runtime.

---

*Integration audit: 2026-11-16*
