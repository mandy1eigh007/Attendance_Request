# cohotrack (Attendance_Request) — Agent Hand-Me-Down Note

> **Read this whole file before touching anything.** It is the transferred working memory of the previous
> assistant. Detailed on purpose — no skimming.

## ⚠️ TWO HARD RULES — READ FIRST
1. **THIS IS A PUBLIC REPO.** **NEVER commit secret values** here — no admin password, no Supabase
   service/anon keys, no EmailJS private key, no GitHub tokens, no phone numbers, no server IPs. Secrets live
   in **Cloudflare Pages environment variables** and **Supabase secrets**, referenced here **by name only**.
   If you ever need a secret value, get it from the dashboards or from Mandy — do not paste it into a file.
2. **`main` AUTO-DEPLOYS TO PRODUCTION.** Every push to `main` immediately deploys to the live site
   **`cohotrack.pages.dev`** that real instructors use. Before pushing: `node --check` every Function you
   touched, reason through the logic, and **confirm with Mandy for anything risky.** No half-baked pushes.

---

## 0. Who & why (context that matters)

- **Owner:** Mandy Richardson — instructor at **ANEW**, a pre-apprenticeship building-trades program.
  GitHub `mandy1eigh007`, email `mandy@anewcareer.org`.
- **cohotrack** is the **cohort / attendance / case-management** app: students submit absence requests,
  instructors approve/deny in a dashboard, and instructors track attendance, demerits, case notes,
  grades, and behavior **contracts**.
- **Stakes are real** — this drives decisions about real students (who can be cut from the program).
- **House style with Mandy:** warm, direct, fine that she curses casually / uses voice-to-text. **Confirm
  before consequential or production actions.** **Don't mass-produce the wrong thing** (build one, confirm,
  scale). Own mistakes crisply.

Sister repo: **`TradeCalc`** (her math app) — separate app, shares the same Supabase project. It has its own
HANDOFF.md.

---

## 1. Architecture

```
browser ──> Cloudflare Pages Functions ──> Supabase (service-role; RLS on every table, NO anon policies)
```

- **Hosting:** Cloudflare Pages, live at **`cohotrack.pages.dev`**, auto-deploying from `main`.
- **Backend = Pages Functions** (they hold the secrets and do all privileged work):
  - `functions/_lib.js` — shared helpers (incl. `instructorOwnsClass(...)`).
  - `functions/submit.js` — student request submission.
  - `functions/respond.js` — handles the email-link GET. **IMPORTANT: it only ROUTES to the dashboard; it
    no longer DECIDES** (see the auto-deny fix in §3). Do not reintroduce decision-making here.
  - `functions/api/admin.js` — all admin/dashboard actions.
- **Frontend:** `admin/index.html` — the instructor dashboard.
- **Database:** Supabase project **`lfizcpaqolckemrvsooy`** (display name "2BlackFeathers"). **RLS is enabled
  on all tables with NO anon policies** — so the *only* way data is read/written is via the Functions using
  the service-role key (a Cloudflare env var). The browser never talks to Supabase directly.

### Auth model (important)
- The dashboard is gated by **ONE shared admin password** stored as the Cloudflare env var **`ADMIN_PASSWORD`**
  (value NOT in this repo). There is **no per-user login.**
- Every admin action checks `body.password === ADMIN_PASSWORD`.
- For **class-scoped** actions (case notes, contracts), it *also* checks
  **`instructorOwnsClass(instructorId, classId)`**, which verifies a row in the **`anew_class_instructors`**
  link table. (Note: case-note/contract *reads* are gated only by `instructorOwnsClass`, NOT by author — any
  instructor linked to the class sees ALL notes/contracts for that class. That's intended: it's their shared
  space.)

### Secret NAMES (values live in Cloudflare/Supabase, never here)
- Cloudflare Pages env: `ADMIN_PASSWORD`, the Supabase **service key**, `EMAILJS_PRIVATE_KEY`.
- EmailJS (these IDs are client-public, safe to note): SERVICE `service_w5fxqhb`,
  TEMPLATE `template_ad4tf59`, PUBLIC_KEY `jyNFKwUKoOYerQd9p`.

### Database tables
`anew_instructors`, `anew_classes`, `anew_class_instructors`, `anew_students`, `anew_requests`,
`anew_attendance`, `anew_demerits`, `anew_case_notes`, `anew_grades`, `anew_contracts`.

### Live operational records (non-secret; useful so you don't have to look them up)
- **Only active class:** "PACE 64", slug `pace-64`, `class_id 5ef3bc96-2d02-45fc-bbcf-01faf7befea8`.
- **Instructors (both linked to PACE 64):**
  - Mandy — id `27b2652b-7327-4ec8-b2dc-a71bac8ea126`, `mandy@anewcareer.org`.
  - Ashley — id `03038373-49a9-4ddc-a39a-51244b284f43`, `ashley@anewcareer.org`.

---

## 2. Branch state

- `main` is current on GitHub and is the production source.
- **Stale, already merged into main — safe to delete:** `contract-assignment`, `fix-form-redirect-loop`,
  `cloudflare/workers-autoconfig`.
- **`dashboard-requests` — DO NOT MERGE.** It is the *early prototype* of the "decisions live in the
  dashboard, not email links" change that already shipped to main as commit `cd79974`. Merging it would
  conflict with / regress the working version. Leave it (or delete it).
- **`update_worker_name_to_cohotrack` — PARKED, do not merge blind.** It's a 1-line `wrangler.jsonc` rename
  `studentracker` → `cohotrack`. The live site **already deploys fine** with `name: "studentracker"`, so the
  rename is cosmetic and renaming deploy config on an auto-deploying prod branch is risky. Only do it while
  watching the Cloudflare deploy, and confirm with Mandy.

---

## 3. What's already shipped to main (recent work)

- **Contracts feature:** `anew_contracts` table + admin actions (`contracts`, `assignContract`,
  `updateContract`, `voidContract`) in `admin.js` + ~426-line contracts UI in `admin/index.html` +
  printable contract forms + the **12 ANEW contract templates**. Contracts are class-scoped like case notes.
- **Printables:** case-note **Print** + **Incident Report** form.
- **Home button** in the admin dashboard.
- **Auto-deny fix (`cd79974`): decisions are dashboard-only.** `respond.js` (the email-link GET) **no longer
  decides** approve/deny from a link click — it only routes to the dashboard "manage" page where the
  instructor decides. **Preserve this. Do not let email links make decisions again.**
- **Student form redirect-loop fix.**

### Data fixes applied directly in Supabase (not in code) — know about these
- **Ashley was linked to PACE 64** in `anew_class_instructors` (so she can see case notes/contracts). BUT the
  **denormalized** fields `anew_classes.instructor_name` / `instructor_email` were **NOT** updated — so Ashley
  sees notes/contracts but is **not** on the absence-request notification emails or the form header.
  - **To add Ashley to emails/header:** Mandy re-saves the PACE 64 class in the dashboard with **both**
    instructors checked — `saveClass` syncs those denormalized fields. (Optional / pending.)
- **MVCC gotcha learned:** a data-modifying CTE's concurrent `SELECT` reads the *pre-insert* snapshot — always
  verify writes with a **separate** `SELECT`.

---

## 4. PENDING / NEXT STEPS for cohotrack

1. **Verify** the dashboard shows contracts / printables / Home (hard-refresh: Cmd/Ctrl+Shift+R) and that
   Ashley can see case notes.
2. *(Optional)* Re-save PACE 64 with both instructors to add Ashley to request emails (see §3).
3. *(Optional)* Tidy the now-inert Approve/Deny buttons out of the hosted EmailJS instructor template (they
   currently just open the dashboard; harmless but messy).
4. **Signal integration (future — mostly lives on a separate server, not in this repo).** See §5.

---

## 5. Signal integration (in progress, BLOCKED — context for later)

**Goal:** cohotrack notifies the cohort via **Signal** (students live in the "Pace 64" Signal group, ~33
members). The program **deliberately does not collect student phone numbers** — privacy is the whole reason
they use Signal — so:

- **Delivery is GROUP-ONLY.** The bot posts to the Pace 64 group by its internal group ID; it never needs
  any student's number. (Private per-student notices over a shared group would leak to everyone, so those are
  not viable. Instructor DMs are possible since instructors can give their own numbers.)
- **Architecture = PULL model.** A small poller on a **DigitalOcean droplet** reads cohotrack's Supabase for
  rows needing a Signal message and sends them via a **localhost-only** `signal-cli-rest-api` container
  (`/v2/send`). The droplet only makes outbound calls — no public endpoint, no domain, no inbound port.
- **Status: droplet up, container healthy and bound to localhost. Bot registration is BLOCKED:** Signal
  **rejects VoIP / "Burner app" numbers** (returns `[403] AuthorizationFailedException` after the captcha is
  accepted). **Resolution: register the bot on a cheap prepaid SIM** that can receive one SMS, then the
  account lives on the droplet.
- **Scope is UNDECIDED** (which events notify the group — e.g. announcements; whether to DM instructors on new
  requests). Mandy is deferring this.
- **Sensitive specifics (droplet IP, the burner number, server creds) are intentionally NOT in this public
  repo** — they're with Mandy / in the prior chat transcript. Do not add them here.

**When ready to build the poller (after registration succeeds):**
- Add a Supabase migration giving the relevant table (e.g. `anew_requests`) a `signal_notified_at timestamptz`
  column.
- Build the poller on the droplet: read Supabase via the **service key held as a droplet env var** (never in
  this repo), send to the group via the localhost API, then stamp `signal_notified_at` so rows aren't
  re-sent.

---

## 6. Auth / how to push

- Previous GitHub tokens are being **revoked**. **Ask Mandy for a fresh fine-grained PAT** scoped to this
  repo with **Contents: read/write**. **Never commit a token.**
- Git identity per clone: `git config user.email "mandy@anewcareer.org"; git config user.name "mandy1eigh007"`.
- Push pattern used before:
  `git -c credential.helper= push "https://x-access-token:TOKEN@github.com/mandy1eigh007/Attendance_Request.git" HEAD:main`
- **Remember:** pushing `main` = instant production deploy. `node --check` the Functions first.

---

## 7. Gotchas
- **PUBLIC repo — no secret values, ever.** (Restating because it's the easiest mistake to make.)
- **`main` auto-deploys** — treat every push as a production release.
- **RLS, no anon policies** — all DB access flows through Functions with the service-role key. The browser
  never hits Supabase directly.
- `respond.js` GET **only routes**, never decides — keep the auto-deny fix intact.
- Don't re-add email-link approve/deny logic.
