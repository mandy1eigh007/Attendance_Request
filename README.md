# ANEW Attendance System — Cloudflare Pages

A student attendance-request form + instructor dashboard (attendance, demerits,
requests, history) for ANEW, a pre-apprenticeship construction program. Static
front-end + Cloudflare Pages Functions + a Supabase (Postgres) backend.

---

## 📋 FOR THE DEPLOYING AGENT — READ THIS FIRST

This repo is **ready to deploy to Cloudflare Pages as-is.** Do not rewrite the
app. Your job is only to get it live and set the environment variables. Specific
instructions:

### What this is
- **Static files** at the repo root: `index.html`, `form.html`, `admin.html`, `app.css`.
- **Cloudflare Pages Functions** in `/functions`: `admin.js`, `submit.js`,
  `respond.js`, and a shared `_lib.js`. Cloudflare auto-serves these at
  `/admin`, `/submit`, `/respond`. **Do not move or rename them.**
- `_redirects` rewrites `/form?class=…` → `/form.html`.
- The database is **already built and live** in Supabase (project ref
  `lfizcpaqolckemrvsooy`). **Do not create tables or touch the schema** — it
  exists, with row-level security on. Schema is in `/supabase/01_schema.sql`
  for reference only.

### Deploy steps
1. Connect this repo to **Cloudflare Pages** (Workers & Pages → Create → Pages →
   Connect to Git).
2. **Build settings:** Framework preset = **None**. Build command = **(leave
   empty)**. Build output directory = **`/`** (the root). There is no build step;
   it's static files + functions.
3. **Set the environment variables** (Settings → Environment variables →
   Production). All four are required. See `.env.example` for the list:
   - `SUPABASE_URL` = `https://lfizcpaqolckemrvsooy.supabase.co`
   - `SUPABASE_SERVICE_KEY` = the Supabase **service_role** secret key (get it
     from Supabase → project `lfizcpaqolckemrvsooy` → Project Settings → API →
     service_role). This is a secret — set it in Cloudflare, never commit it.
   - `ADMIN_PASSWORD` = the dashboard login password (the site owner chooses
     this; ask them, or set a placeholder and tell them to change it).
   - `EMAILJS_PRIVATE_KEY` = the EmailJS account private key.
   - `SITE_URL` *(optional)* = the deployed URL, e.g.
     `https://anew-attendance.pages.dev`. If unset, the code uses the request
     origin, which is fine.
4. **Redeploy after setting the variables** (Functions only read them at
   runtime, but a fresh deploy guarantees they're attached). On Cloudflare,
   redeploys are free and unmetered.

### How to verify it works (do this after deploy)
- Visit `/admin.html` → enter `ADMIN_PASSWORD` → should reach the dashboard.
- If login is rejected: the function isn't seeing `ADMIN_PASSWORD`. Re-check the
  env var name (exact, all caps) and redeploy.
- A quick function probe (browser console on the site):
  ```js
  fetch('/admin',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'login',password:'WRONG'})}).then(r=>r.text()).then(console.log)
  ```
  - `{"error":"Unauthorized"}` → function is live & has its password (good; type
    the real one to get in).
  - `{"error":"Server missing ADMIN_PASSWORD"}` → env var not set/attached.
  - `{"error":"Server missing SUPABASE_URL..."}` → Supabase vars not set.
  - 404 / HTML → functions aren't routing; check that `/functions` is at repo
    root and build output dir is `/`.

### What NOT to do
- Don't add a build framework, bundler, or `package.json` build step — there
  isn't one and it isn't needed.
- Don't modify the Supabase schema or create tables — the DB is live.
- Don't put any secret in the committed files. Secrets go in Cloudflare env vars
  only. (The EmailJS *public* key and template/service IDs in the function files
  are public by design — that's fine.)
- Don't change the `/functions` file names or the fetch paths in the HTML.

---

## Architecture (for humans)
- **Public flow:** student opens `/form?class=<slug>` → form POSTs to `/submit`
  → request stored in Supabase, emails sent to instructor (with approve/deny
  links) and student.
- **Decision:** instructor clicks Approve/Deny in email → `/respond` records the
  decision; an approved absence that's matched to a roster student auto-writes an
  excused-absence (`AE`) attendance row (no demerit points, no double entry).
- **Dashboard:** `/admin.html` → all data via POST `/admin` (auth'd by
  `ADMIN_PASSWORD`, checked server-side). Sections: Attendance, Demerit,
  Requests, History, Manage.
- **Security:** the browser holds no Supabase key and no password. All DB access
  is server-side via the service-role key; RLS is on with no anon policies, so
  the public key can read nothing.

## Demerit points (enforced server-side)
Codes 1–6 = 1 · 8,9 = 2 · 7,10,11,12 = 3 · 13,14 = 5 · 15–18 = 10.
Excused = 0 points regardless of code (Code 7 = 0 if excused, 3 if not).
Every demerit — even a 0-point excused one — generates a signable slip + a
Salesforce case note. Totals flag at 7 (contract) and 10 (dismissal).

## Files
```
index.html          Landing page
form.html           Public student request form  → /submit
admin.html          Instructor dashboard         → /admin
app.css             Shared teal/native design system
_redirects          /form → /form.html rewrite
functions/
  _lib.js           Supabase service-role wrapper + helpers (CF module)
  admin.js          Auth'd dashboard endpoint (17 actions)
  submit.js         Public submit (GET lookup + POST store/email)
  respond.js        Approve/Deny handler + auto-excused-attendance
supabase/
  01_schema.sql     Reference only — DB already built & live
email-templates/    Paste into EmailJS (teal-themed)
```
