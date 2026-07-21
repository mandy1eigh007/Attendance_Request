# cohotrack (Attendance_Request) — Agent Hand-Me-Down Note

> **Read this whole file before touching anything.** It is the transferred working memory of the previous
> assistant. Detailed on purpose — no skimming.

## ⚠️ TWO HARD RULES — READ FIRST
1. **THIS IS A PUBLIC REPO.** **NEVER commit secret values** here — no admin password, no Supabase
   service/anon keys, no EmailJS private key, no GitHub tokens, no phone numbers, no server IPs. Secrets live
   in **Cloudflare Pages environment variables** and **Supabase secrets**, referenced here **by name only**.
2. **`main` AUTO-DEPLOYS TO PRODUCTION.** Every push to `main` immediately deploys to the live site
   **`cohotrack.pages.dev`** that real instructors use. Before pushing: reason through logic, confirm with
   Mandy for anything risky. No half-baked pushes.

---

## 0. Who & why

- **Owner:** Mandy Richardson — instructor at **ANEW**, a pre-apprenticeship building-trades program.
  GitHub `mandy1eigh007`.
- **cohotrack** is the **cohort management** app: attendance tracking, demerits, case notes, behavior
  contracts, test results, and an instructor dashboard. Stakes are real — this drives decisions about
  real students who can be cut from the program.
- **House style:** warm, direct, voice-to-text user (read for intent not typos). Confirm before
  consequential actions. Build one thing, confirm, then scale.

---

## 1. Architecture

```
browser ──> Cloudflare Pages Functions ──> Supabase (service-role; RLS on, NO anon policies)
```

- **Hosting:** Cloudflare Pages, live at `cohotrack.pages.dev`, auto-deploying from `main`.
- **All DB access through Functions** — browser never hits Supabase directly.
- **Auth:** one shared `ADMIN_PASSWORD` env var. Every admin action verifies it. No per-user login.

### Files
- `functions/_lib.js` — shared helpers (`makeSb`, `ok`, `bad`, `instructorOwnsClass`)
- `functions/submit.js` — student absence-request submission
- `functions/respond.js` — email-link GET handler; **ONLY ROUTES, never decides** (auto-deny fix `cd79974`)
- `functions/api/admin.js` — all dashboard actions
- `functions/api/tests.js` — student test submission (`POST /api/tests`)
- `functions/api/verify-test-access.js` — validates class PIN + Google/guest auth for the test page
- `functions/api/scan-attendance.js` — AI scan of paper attendance sheets/demerit slips
- `functions/api/gradebook.js` — gradebook data
- `admin/index.html` — instructor dashboard (single-file SPA, ~2700 lines)
- `tests/index.html` — student-facing digital test (single-file SPA)
- `form.html` — student absence-request form
- `index.html` — landing page

### Secret NAMES (values never in this repo)
Cloudflare Pages env: `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `EMAILJS_PRIVATE_KEY`,
`TESTS_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `INSTRUCTOR_PIN`, `GUEST_PIN`.

### Database tables (Supabase project `lfizcpaqolckemrvsooy`)
- `anew_instructors` — instructor records
- `anew_classes` — classes (slug, program_name, class_pin, cohorts)
- `anew_class_instructors` — many-to-many link
- `anew_students` — students (first, last, email, active, status: active/dropped/early_grad)
- `anew_requests` — absence requests
- `anew_attendance` — daily attendance (student_id, date, status: OT/L/AE/AU, notes)
- `anew_demerits` — demerit records (code, pts_num, excused, voided, staff, incident, etc.)
- `anew_case_notes` — case notes with file attachments
- `anew_contracts` — behavior contracts (12 ANEW templates)
- `anew_test_results` — test scores: `student_name`, `test_name`, `score`, `total`, `pct`, `class_id`,
  `taken_at`, `auth_mode`, `answers` (JSONB — per-question breakdown, see below), `id`
- `anew_grades` — gradebook grades

### The `answers` JSONB column in `anew_test_results`
When students take the **digital test** (`/tests`), every question answer is stored:
```json
[{ "num": 1, "question": "...", "correct": true, "studentAnswer": "3/4\"", "correctAnswer": "3/4\"" }, ...]
```
Manually-entered scores (via Enter Score in the dashboard) have `answers: null`. The admin dashboard
shows a **View** button for digital results and "paper" for manual ones.

### Live operational records (non-secret)
- **Active class:** "PACE 64", slug `pace-64`, class_id `5ef3bc96-2d02-45fc-bbcf-01faf7befea8`
- **Instructors (both linked to PACE 64):**
  - Mandy — id `27b2652b-7327-4ec8-b2dc-a71bac8ea126`
  - Ashley — id `03038373-49a9-4ddc-a39a-51244b284f43`

---

## 2. The digital test system (`tests/index.html`)

**We built this together.** Students go to `/tests`, authenticate with Google OR guest name + `GUEST_PIN`,
enter their `class_pin`, pick a test, answer every question, review, then submit. The system:

- Three tests: **Tape Measure Final** (50 q), **Hand Tool Final**, **Power Tool Final**
- Question types: multiple choice, true/false, measurement (number + fraction + unit)
- Auth: Google Sign-In (`GOOGLE_CLIENT_ID` in the HTML, client-public) or guest name + `GUEST_PIN`
- `TESTS_WRITE_TOKEN` is issued by `/api/verify-test-access` on sign-in; required by `/api/tests` to
  save results. Without it, nobody can POST fake scores.
- After submission, student sees their score, pass/fail, and per-question breakdown
- Instructor preview mode (unlocked with `INSTRUCTOR_PIN`) shows correct answers during the test

**Supabase setup we did:** added `answers JSONB`, `auth_mode`, `class_id` columns to `anew_test_results`.

---

## 3. Admin dashboard (`admin/index.html`) — what's built

Single-file SPA, login-gated by `ADMIN_PASSWORD`. All roles (instructor/coordinator) see the same nav.

### Tabs
- **Attendance** — daily attendance grid, status buttons auto-save, date picker, class selector
- **Demerit** — issue demerit form, 18 codes with point values, printable slip + Salesforce case note
- **Students** — roster with search, student profile pane (attendance history, demerits, contracts,
  case notes, photo), cross-links from other tabs via `navToStudent(id)`
- **Requests** — absence request approval/denial
- **History** — combined demerit + attendance log, CSV export
- **Results** — test scores table; Has Not Tested section per test; Enter Score, Median, Link Name
  buttons; View button opens answer sheet modal for digital submissions
- **Scan** — AI-powered scan of paper attendance sheets or demerit slips via Claude API
- **Manage** — class/instructor management
- **FAQ / Help** — built-in help, "?" toggle shows `.help-hint` contextual hints in each view

### Key features built
- **Student status** (active/dropped/early_grad): early grad students show in Has Not Tested with W note
- **Name aliasing** (`_nameAliases` in localStorage): link a misspelled test submission to the correct
  student. Persists across sessions. `saveNameAlias()`, `findStudentByResultName()`.
- **Enter Score modal**: enter score/total OR just a percentage (auto-sets X/100). Shows live % preview.
- **Median button**: computes median pct of existing scores for a test, pre-fills Enter Score.
- **Link Name**: when a student's test result name doesn't match roster, pick from unmatched results
  and link them permanently via alias.
- **Answer sheet modal**: click View on any digital result to see per-question breakdown — wrong answers
  first (student vs correct), expandable correct answers section.
- **Cross-links**: student names in Attendance, History, and Results are clickable → jump to profile
- **Help Mode**: "?" button toggles `body.help-mode`; `.help-hint` divs show contextual tips
- **navToStudent(id)**: `showView('students')` + `openStudentProfile(id)` — used throughout
- **Scan dedup fixed**: scan code existed in 4 script blocks due to copy-paste; blocks 2/3/4 deleted.
  Root cause: `let scanData` in separate `<script>` blocks had separate scopes — `renderDemeritReview()`
  read block-1's null while `runScan()` (last def) wrote block-4's. Fixed by keeping only block 1.
- **Parallel API fetches**: `onClassChange` fetches students + demerits simultaneously. History tab
  fetches demerits + attendance simultaneously.
- **Back button fix**: `pushState` on login, `popstate` listener re-pushes while `PW` is set.

### Performance notes
- DEMERIT_CODES and EXCUSE_REASONS dropdown HTML cached at module load as `_CODE_OPTS_HTML` / `_EXCUSE_OPTS_HTML`
- History tab pre-builds `studentMap` (Object.fromEntries) for O(1) name lookup instead of O(n) per row
- Class switch: students + demerits fetched in parallel (saves ~300-500ms per switch)

---

## 4. Scan feature (`functions/api/scan-attendance.js`)

Accepts a base64 image/PDF, sends to Claude API (`ANTHROPIC_API_KEY`), returns structured attendance
or demerit data. Admin reviews in a table before saving. Match status per student (green/yellow).

---

## 5. Important invariants — do not break

- `respond.js` GET **only routes to dashboard**, never decides approve/deny. Auto-deny fix `cd79974`.
- **RLS, no anon policies** — all DB access through Functions with service-role key.
- **PUBLIC repo** — no secret values ever committed.
- `admin/index.html` is a single-file SPA. Multiple `<script>` blocks have separate scopes for `let`.
  Do not add duplicate functions across blocks.
- `saveTestResult` admin action saves manual scores; `/api/tests` is for student-facing submissions.
- `TESTS_WRITE_TOKEN` is the anti-fake-score gate on `/api/tests`. Do not remove it.

---

## 6. Pending / known issues

- **Gradebook rubrics**: wrong/too many rubrics in gradebook. Mandy will provide correct ones manually.
- **QC ClassLingo**: translator app post-Codex buildout needs QC.
- **Signal integration**: blocked on Signal registration (VoIP number rejected). See original HANDOFF
  for full context. Do not build until Mandy unblocks.
- **Ashley email/header**: Mandy needs to re-save PACE 64 with both instructors checked to add Ashley
  to notification emails. Optional/pending.

---

## 7. Recent commit history (as of July 2026)
- `87f1b70` Results: answer sheet drill-down (View button + modal)
- `7d200bf` Results: % input + Median button in Enter Score modal
- `1af197f` Fix back button navigating away from admin app
- `1e4c9fc` Fix Link Name onclick escaping + add help hint content
- `0d9cc1c` Perf: parallel API fetches + O(1) student lookups
- `6364b68` Fix scan variable scoping bug + wire nav cross-links + audit cleanup
- `fe364c2` Unified nav, help mode, test result name linking + manual score entry
- `e173655` feat: Early Grad W/Test status
- `ab824b8` feat: student status (Active / Dropped / Early Grad)
- `9f05432` fix: auto-save scores + fuzzy name matching for Has Not Tested
- `5ccbe56` feat: Results tab shows who has not tested

---

## 8. How to push

Claude Code pushes directly via `git push origin main`. Mandy does not push — don't ask her to.
