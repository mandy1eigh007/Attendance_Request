# ANEW Attendance System — Handoff / Activity Log

This file is a “pick up where I left off” reference for the ANEW Attendance System (Cloudflare Pages + Pages Functions + Supabase).

## How to use this file
- Document **all actions taken** (code changes, config changes, deploy tweaks, data fixes, decisions) in this file so the next agent can read it and continue confidently.

## Quick start (local)
- Dev server: `wrangler pages dev . --ip 0.0.0.0 --port 8000 --env-file .dev.vars --compatibility-date=2026-06-02`
- Smoke (non-mutating): `node scripts/smoke-admin.mjs http://127.0.0.1:8000`
- Smoke (e2e, mutating but cleans up): `node scripts/smoke-admin.mjs --e2e http://127.0.0.1:8000`

## What this app is
- Static site at repo root (`index.html`, `form.html`, `admin.html`, `app.css`)
- Cloudflare Pages Functions in `functions/` (served at `/admin`, `/submit`, `/respond`)
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
- Instructor dashboard (UI page): `/admin` (same content as `/admin.html`)
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

## Common gotchas
- If `/admin` returns HTML or 404 in local dev: you’re not running Wrangler.
- If login fails: check `ADMIN_PASSWORD` is set in `.dev.vars` (local) or Cloudflare Pages env vars (prod), then restart/redeploy.
- If you don’t see latest UI in browser: hard refresh (`Ctrl+Shift+R`) or add `?v=1` to the URL.
