# ANEW Attendance System — Handoff / Activity Log

This file is a “pick up where I left off” reference for the ANEW Attendance System (Cloudflare Pages + Pages Functions + Supabase).

## How to use this file
- Document **all actions taken** (code changes, config changes, deploy tweaks, data fixes, decisions) in this file so the next agent can read it and continue confidently.

## Quick start (local)
- Dev server: `wrangler pages dev . --ip 0.0.0.0 --port 8000 --env-file .dev.vars --compatibility-date=2026-06-02`
- Smoke (non-mutating): `node scripts/smoke-admin.mjs http://127.0.0.1:8000`
- Smoke (e2e, mutating but cleans up): `node scripts/smoke-admin.mjs --e2e http://127.0.0.1:8000`

## What this app is
- Static site at repo root (`index.html`, `form.html`, `app.css`, `admin/index.html`)
- Cloudflare Pages Functions in `functions/` (served at `/api/admin`, `/submit`, `/respond`)
- Supabase (Postgres) is already live; schema reference is in `supabase/01_schema.sql` (do not recreate tables)

## Local dev (Codespaces)
**Use Wrangler.** A static server (e.g. `python -m http.server`) cannot run the function endpoints.

1) Create `.dev.vars` (gitignored) with:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ADMIN_PASSWORD`
- `EMAILJS_PRIVATE_KEY`
- `SITE_URL` (optional)

2) Run local dev server:
- `wrangler pages dev . --ip 0.0.0.0 --port 8000 --env-file .dev.vars --compatibility-date=2026-06-02`

3) Open:
- Home: `/`
- Instructor dashboard (UI page): `/admin/` (served from `admin/index.html`)
- Instructor dashboard API (Cloudflare Function): `POST /api/admin`
- Student request form (class picker): `/form`

## Smoke tests
- Quick API smoke (non-mutating):
  - `node scripts/smoke-admin.mjs http://127.0.0.1:8000`
- End-to-end smoke (writes temp student + demerit, then cleans up):
  - `node scripts/smoke-admin.mjs --e2e http://127.0.0.1:8000`

## Student-facing flow (how requests work now)
Goal: students do **not** need a special link. They can pick their class from the homepage or the request page.

- Home page now shows **Open Classes**.
- Students can click their class to open `/form?class=<slug>`.
- `/form` (without `?class=...`) shows a class picker using `GET /submit`.
- Closing a class (sets `active=false`) removes it from the public list automatically.

Implementation notes:
- `GET /submit` (no params) returns `{ classes: [...] }` for active classes.
- `GET /submit?class=<slug>` returns the per-class config used by the request form.
- `POST /submit` stores the request and emails the instructor + student.
- Instructor email approve/deny links go to `/respond?...`.

## Instructor dashboard: student + demerit management
Key UX:
- Manage → Students: click a student name to open the Student modal.
- Student modal supports:
  - edit student fields (first/last/email)
  - view demerits including voided
  - open Slip + copy Case Note
  - edit demerit
  - remove (void) demerit

Backend actions (POST `/admin`):
- `updateStudent` (PATCH student fields)
- `updateDemerit` (PATCH demerit, recompute `pts_num` and running total)
- `demerits` supports `payload.includeVoided` to include voided rows

Note: the Class dropdown is now shown on Manage + History so you can switch classes while managing students.

## Class lifecycle wording
Manage → Classes uses **Close** (previously “Delete”).
- Closing a class sets `active=false` (records kept).
- Closed classes disappear from the student class picker.

## Recent commits (chronological)
- `048a901` Unzip and add project files
- `98d443a` Improve admin login errors for local dev
- `baf1ccc` Ignore Wrangler local state
- `f05e178` Improve roster paste parsing
- `8636371` Add per-student demerit management
- `7e9cffb` Add /admin smoke test script
- `9a74705` Extend smoke test with e2e mode
- `b6d6c33` Show class selector on Manage/History
- `4e11003` Add public class picker for requests
- `5a43aaf` Rename Delete Class to Close Class
- `83217dc` Add HANDOFF activity log
- `2f12d23` Docs: add handoff pointer; remove uploaded zip
- `4563a78` Docs: clarify handoff logging + quick start

## Routing
- `_redirects` only rewrites `/form` → `/form.html` (so `/form?class=<slug>` works without the `.html`).
- `/admin/` is served from `admin/index.html` (a directory index — Cloudflare Pages handles this natively; no rewrite needed).
- `/api/admin`, `/submit`, `/respond` are Cloudflare Pages Functions (`functions/api/admin.js`, `functions/submit.js`, `functions/respond.js`), auto-routed by filename. Do not move or rename these files.
- IMPORTANT: the admin **page** and the admin **API** used to share the path `/admin`, which Cloudflare's html-handling redirect (`.html` → clean URL) turned into a 405 loop on the API. Keeping them on different paths (`/admin/` vs `/api/admin`) is what makes this work.

## Common gotchas
- If `/admin/` returns HTML or 404 in local dev: you’re not running Wrangler.
- If `/admin` returns 405: you sent a `GET`. The endpoint only accepts `POST` JSON.
- If login fails: check `ADMIN_PASSWORD` is set in `.dev.vars` (local) or Cloudflare Pages env vars (prod), then restart/redeploy.
- If you don’t see latest UI in browser: hard refresh (`Ctrl+Shift+R`) or add `?v=1` to the URL.

## 2026-06-03 (hotfix) — admin page/API route collision
Symptom reported: opening `/admin` in the browser, every button showed an "error" toast.

Root cause: `/admin` was BOTH the static page (`admin.html`) AND the API function (`functions/admin.js`). Cloudflare Pages auto-redirects `.html` URLs to the clean form (`/admin.html` → 308 → `/admin`), which hit the POST-only Function and returned 405. The same was true in prod.

Fix (this commit):
- Moved the page to **`admin/index.html`** so it's served natively at `/admin/` (directory index, no html-handling redirect).
- Moved the function to **`functions/api/admin.js`** so it's served at **`/api/admin`**.
- Updated all fetch calls in the dashboard (`admin/index.html`), the homepage links (`index.html`), and the smoke test (`scripts/smoke-admin.mjs`).
- `_redirects` is back to just `/form  /form.html  200`.

If you bookmarked `/admin.html` or `/admin` directly, both still work: `/admin.html` → 308 → `/admin/` → 200, and `/admin` → 308 → `/admin/` → 200.

## 2026-06 — Optimization pass + Case Notes
Big batch of fixes and a new feature. Highlights:

**Required DB migration (run once in Supabase SQL Editor):**
The bottom of `supabase/01_schema.sql` now has an idempotent migration block. Re-run that file in Supabase to:
- Ensure `anew_demerits` has `voided / voided_at / voided_by` columns (most prod DBs already do — safe re-run).
- Create the new `anew_case_notes` table (required for the case-notes feature).
- Create a placeholder `anew_grades` table for the next phase.
- Add a partial index speeding up per-student demerit totals.

**New: Case Notes (per-student case-management documentation).**
- Open a student → new **Case Notes** section above Demerits.
- Click **+ Add Note** to log subject, body, optional category + follow-up date.
- Each note has a **Copy for Salesforce** button that emits a standard who/what/when block.
- Visibility is enforced server-side: only an instructor linked to the student's class via `anew_class_instructors` can read/write.

**New: Instructor identity at sign-in.**
- After entering the password, the dashboard now asks **“Who are you signing in as?”** and stores the choice in `sessionStorage`.
- The chosen instructor is sent with every admin API call as `payload.instructorId` and is required for any case-notes action.
- A **Switch** button in the header lets you change identities without re-entering the password.

**Backend cleanup (functions/):**
- New shared helpers in `_lib.js`: `EMAILJS`, `sendEmail`, `DEMERIT_PTS`, `decideRequest`, `instructorOwnsClass`, `rateLimit`, `clientIp`.
- `/admin` (`functions/admin.js`): rejects non-POST with 405; bug fix → `studentDemeritTotal` and `issueDemerit` now exclude voided rows; `addRoster` now persists `email`; `saveClass` validates instructor IDs and uses one bulk insert for class↔instructor links; `decideRequest` reuses the same idempotent-flip + auto-AE logic as `/respond`. New actions: `caseNotes`, `addCaseNote`, `updateCaseNote`, `voidCaseNote`.
- `/submit` (`functions/submit.js`): splits `instructor_email` on `,` and emails each instructor (`Promise.allSettled`); per-IP and per-(email+date+type) rate limits via Cloudflare edge cache; structured `console.error` on email failures.
- `/respond` (`functions/respond.js`): prefers DB values from `anew_requests` over URL params for the outgoing email; uses the shared `decideRequest` helper; logs caught errors.

**Smoke test (`scripts/smoke-admin.mjs`):** added quick checks for `caseNotes`, `addCaseNote`, and the new 405 contract. Run with `node scripts/smoke-admin.mjs http://127.0.0.1:8000`.

## Roadmap
- Per-instructor class filtering on the main dashboard (today the picker is informational + drives case-note auth; class dropdowns still show all classes).
- Wire the `anew_grades` table into the UI (Grades tab; case-note-style copy for Salesforce).
- Replace `localStorage`/`sessionStorage` password with a short-lived signed cookie issued by `/admin login`.

