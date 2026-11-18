# Quick Task 261118-gmu Summary

**Objective:** Fix the Events poster round trip, prove built-in event deletion persistence and safeguards, and set the Home hero's first image to `/h0.png`.

**Status:** Complete

## Root Causes

- Uploaded media could be returned as a host-derived absolute URL, including local `http://` origins, even though event PATCH media validation accepts HTTPS or safe local paths. Returning only a relative path also fails in production because the frontend is on Vercel, the API is on Render, and Vercel rewrites `/api/media/...` to the SPA. The admin client now resolves only `/api/media/...` paths through the configured HTTPS API host for new uploads and existing poster previews; stored legacy paths are not rewritten.
- Event poster update state already differentiated changed, cleared, and unchanged legacy values, but that behavior lacked a focused pure helper/test seam. It now uses a small shared payload helper and regression coverage.
- The deletion route and catalog seeding already contained the tombstone contract. The route deletion decision was made testable through a narrow helper so booking/enquiry conflicts and custom-event behavior can be proven without a database or external calls.
- The Home hero assets were inline in `Home.jsx`; the existing plain-JavaScript homepage data module now owns the carousel assets, with the first source set to `/h0.png` and no optimized `srcSet`.
- The carousel preloader previously assigned an absent `srcSet` when wrapping back to the new first slide; it now removes that attribute for `/h0.png`, preserving the full loop.

## Changed Files

- `src/admin/data/adminEventOperations.js`
- `src/admin/services/adminApi.js`
- `src/admin/pages/ManageEvents.jsx`
- `backend/src/routes/admin.js`
- `src/data/homepage.js`
- `src/pages/Home.jsx`
- `tests/adminEventManagement.test.js`
- `backend/test/admin-event-deletion.test.js`
- `tests/homepage.test.js`

## Verification

- Focused tests: 12 passed, 0 failed.
- Root test suite: 175 passed, 0 failed; backend test suite: 143 passed, 0 failed.
- `npm.cmd run lint`: passed with existing repository warnings; no lint errors.
- `npm.cmd run build`: passed.
- Frontend-only browser check: the initial image loaded from `/h0.png` (natural width 1672); the carousel advanced through the later slides and wrapped back to `/h0.png`.
- Manual authenticated browser upload/save/reload/removal check: unavailable in this session.
- Supplementary startup note: `npm run dev` briefly started the backend, which connected to its configured database and ran startup initialization. The database target was not inspected. No admin event deletion/upload, booking/payment, or WhatsApp operation was executed; normal catalog seeding may have run. The server was stopped, and subsequent carousel checks used Vite only.

## Asset and Repository Safety

- `public/h0.png` remains untracked and was not edited, copied, moved, renamed, staged, or regenerated.
- No files were staged or committed during implementation validation; a later user request authorized the Git commit and push.
- No push, merge, or deployment occurred. No payment or WhatsApp provider call was made.
- No payment, WhatsApp, configuration/deployment, or unrelated source files were changed.
