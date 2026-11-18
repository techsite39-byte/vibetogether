---
quick_id: 261118-dsc
status: planned
---

# Allow event edits when an unchanged legacy image is stored

## Objective

Let admins save unrelated event edits when the existing poster URL is legacy or broken, without weakening backend media validation.

## Context

`EditEventDialog` currently submits the trimmed `image` on every update. The backend validates submitted image references and rejects this unchanged legacy value. Current `.planning/STATE.md` requires separate explicit authorization before application edits; this plan does not authorize implementation. `src/admin/pages/ManageEvents.jsx` already has uncommitted changes: preserve them and make only the focused payload adjustment.

## Task

### Conditionally include the image in event updates

- **Files:** `src/admin/pages/ManageEvents.jsx`
- **Action:** In the edit submit payload, compare `form.image.trim()` with the trimmed existing `event.image` value (treat a missing existing value as empty). Omit the `image` property entirely when equal; include the trimmed form value when different, including an intentional empty value to remove the image. Keep `imageAlt` and every other event field in the update payload unchanged. Do not change create-event behavior, backend validation, or unrelated existing edits.
- **Verify:**
  - `<automated>npm run lint -- src/admin/pages/ManageEvents.jsx</automated>`
  - `<automated>npm run build</automated>`
- **Done:** Unchanged legacy image values are not submitted during event PATCH updates; changed and cleared values are still submitted for existing backend validation; alternative text and all other event fields remain editable. Targeted lint and production build pass.

## Guardrails

- Do not create real event data or call production APIs.
- Do not modify other files unless a directly necessary focused test is identified.
- No commit, push, deployment, staging writes, or payment activity. Preserve all existing uncommitted changes.
