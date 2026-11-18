---
quick_id: 261118-gmu
status: planned
depends_on: []
autonomous: true
files_modified:
  - src/admin/pages/ManageEvents.jsx
  - src/admin/services/adminApi.js
  - tests/adminEventManagement.test.js
  - backend/src/routes/admin.js
  - backend/src/services/events.js
  - backend/test/eventCatalog.test.js
  - backend/test/admin-event-deletion.test.js
  - src/pages/Home.jsx
  - src/data/homepage.js
  - tests/homepage.test.js
---

# Fix Events poster handling, deletion persistence, and the Home hero image

<objective>
Make existing admin event poster edits reliable, keep intentionally deleted built-in events deleted, and use `/h0.png` as the existing Home hero carousel's first image.

Purpose: Restore these narrow existing behaviors while preserving event booking/enquiry safeguards, carousel behavior, and unrelated work.
Output: Focused regression coverage and only the source changes required by those checks.
</objective>

<context>
- `.planning/STATE.md` places the project in Phase 2 and says source implementation requires separate explicit authorization. This plan is planning only and does not grant that authorization.
- `src/admin/pages/ManageEvents.jsx` already uploads via `uploadMediaImage`, previews the returned URL, omits unchanged legacy image values from edit payloads, and submits changed or cleared values. Preserve these behaviors while checking compatibility through save and reload.
- `backend/src/services/events.js` already stores deleted built-in IDs in `PlatformSetting` and excludes them from startup seeding; `backend/src/routes/admin.js` marks an ID only after successful hard deletion and blocks events linked to bookings or enquiries. Preserve this contract and cover the route-to-restart path.
- `src/pages/Home.jsx` currently defines the hero slide assets inline. The user-provided `public/h0.png` is untracked; reference it as `/h0.png` without editing, copying, moving, or renaming the asset.
- Preserve all unrelated and uncommitted changes. Do not inspect `.env`. No payment, WhatsApp, configuration/deployment, unrelated route, redesign, production test, external notification, commit, push, merge, or deployment work.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify and repair the existing-event poster roundtrip</name>
  <files>src/admin/pages/ManageEvents.jsx, src/admin/services/adminApi.js, tests/adminEventManagement.test.js</files>
  <action>Trace the existing event editor's file-upload response and direct URL through preview, PATCH, and workspace reload. Correct only a demonstrated incompatibility: uploaded URLs and safe HTTPS/local paths must remain editable and previewable; changed images must save; an intentional empty image must clear the poster; an unchanged legacy image must remain omitted from the update. Keep upload validation, alt text, error handling, and unrelated event fields intact. Add focused automated regression coverage for the payload/image-state behavior using the existing Node test conventions; do not add a UI/testing dependency.</action>
  <verify>
    <automated>node --test tests/adminEventManagement.test.js</automated>
    <manual-check>If an already-available local authenticated test workspace is usable, upload or enter a poster, confirm preview, save and reload, then remove it, save and reload to confirm the empty state. Do not use production or inspect credentials/configuration; if unavailable, record that and rely on automated checks.</manual-check>
  </verify>
  <done>Changed and cleared posters roundtrip correctly, unchanged legacy values remain omitted, and the focused regression test passes without weakening backend media validation.</done>
</task>

<task type="auto">
  <name>Task 2: Prove event deletion survives reload and startup seeding</name>
  <files>backend/src/routes/admin.js, backend/src/services/events.js, backend/test/eventCatalog.test.js, backend/test/admin-event-deletion.test.js</files>
  <action>Retain the existing tombstone setting and seed filter unless focused tests expose a defect. Add mocked route/service regression coverage proving a successful built-in hard delete persists its tombstone and a fresh catalog-service startup skips that ID while still seeding other missing built-ins. Also prove events with either booking records or booking enquiries still return the existing conflict and are neither deleted nor tombstoned; custom event deletion must not create a built-in tombstone. Introduce only the narrowest test seam needed, with production model defaults unchanged. Do not touch booking/payment behavior, schemas, notifications, or unrelated admin routes.</action>
  <verify>
    <automated>node --test backend/test/eventCatalog.test.js backend/test/admin-event-deletion.test.js</automated>
  </verify>
  <done>Mocked regression tests establish successful deletion-to-restart persistence, continued seeding of other entries, and unchanged booking/enquiry deletion protections without a real database or external calls.</done>
</task>

<task type="auto">
  <name>Task 3: Make the existing hero's first image exactly /h0.png</name>
  <files>src/pages/Home.jsx, src/data/homepage.js, tests/homepage.test.js</files>
  <action>Keep the current four-slide order and carousel state/timing/render behavior. Put the hero asset configuration in the existing plain-JavaScript homepage data module for direct Node testing, set only the first slide's source to `/h0.png`, and omit that slide's optimized `srcSet` so the requested file is actually selected. Preserve every later slide's existing source and responsive source set. Add a focused test asserting the first source and the unchanged subsequent slide asset configuration; reference the existing public file without altering it.</action>
  <verify>
    <automated>node --test tests/homepage.test.js</automated>
  </verify>
  <done>The first carousel image resolves to `/h0.png`, later slides retain their current assets and responsive behavior, and the asset remains unmodified in `public/`.</done>
</task>

</tasks>

<verification>
From the repository root, run `node --test tests/adminEventManagement.test.js backend/test/eventCatalog.test.js backend/test/admin-event-deletion.test.js tests/homepage.test.js`, `npm run lint`, and `npm run build`. Review the local diff to confirm `public/h0.png` and all unrelated/uncommitted files are unchanged. Where a local browser/test workspace is already available, verify the first slide and advance to a subsequent slide without production access.
</verification>

<success_criteria>
Poster upload/edit/preview/save/removal is compatible across reload; built-in event deletion persists across startup without weakening booking/enquiry guards or reseeding deleted built-ins; the first Home hero image is exactly `/h0.png` and later carousel behavior is preserved. Focused tests, lint, and build pass. No production testing, external notifications, git commits, pushes, merges, or deployments occur.
</success_criteria>

<output>
Implementation remains separately authorization-gated by current project state. No source changes, summary, staging, commit, push, merge, or deployment are part of this planning task.
</output>
