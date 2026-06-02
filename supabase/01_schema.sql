-- ════════════════════════════════════════════════════════════════════════
-- ANEW Attendance + Demerit + Request System — unified schema
-- Run this in Supabase → SQL Editor (one time). Safe to re-run: uses IF NOT EXISTS.
--
-- SECURITY MODEL (the "most secure" option you chose):
--   • All reads/writes go through Netlify Functions that use the SERVICE ROLE key.
--   • The service role BYPASSES row-level security, so the functions can do their job.
--   • RLS is turned ON for every table, and we deliberately create NO anon policies.
--     => the public anon key can read/write NOTHING. Student data is never exposed
--        to the browser. The public student form talks to a function, not to the DB.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ── INSTRUCTORS ─────────────────────────────────────────────────────────
create table if not exists anew_instructors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── CLASSES ─────────────────────────────────────────────────────────────
-- Reconciles both apps: program_name + slug (request form) and cohort list +
-- start_date (pace64). cohorts is the dropdown the student picks from.
create table if not exists anew_classes (
  id               uuid primary key default gen_random_uuid(),
  program_name     text not null,                 -- "PACE 64"
  slug             text unique not null,          -- "pace-64"  (public form link)
  cohorts          text[] not null default '{}',  -- {"AM CREW","PM CREW"}
  start_date       date,
  instructor_name  text,                           -- denormalized for the form header
  instructor_email text,                           -- denormalized comma list (kept in sync)
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── CLASS ↔ INSTRUCTOR (many-to-many) ───────────────────────────────────
create table if not exists anew_class_instructors (
  class_id      uuid not null references anew_classes(id) on delete cascade,
  instructor_id uuid not null references anew_instructors(id) on delete cascade,
  primary key (class_id, instructor_id)
);

-- ── STUDENTS (the roster — this is what fuses the two apps) ───────────────
-- email is nullable: pace64 students were roster-only; request students have email.
create table if not exists anew_students (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references anew_classes(id) on delete cascade,
  first       text not null,
  last        text not null,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_students_class on anew_students(class_id);

-- ── REQUESTS (student-initiated absence / appointment / leave-early) ──────
-- student_id is nullable: a public submission may not be matched to a roster
-- student yet. The instructor links/confirms it; on approval we can write an
-- excused-absence attendance row (the payoff integration).
create table if not exists anew_requests (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid references anew_classes(id) on delete set null,
  student_id     uuid references anew_students(id) on delete set null,
  student_first  text not null,
  student_last   text not null,
  student_email  text not null,
  cohort         text,
  request_type   text not null,        -- 'Full Absence' | 'Leave Early' | 'Appointment'
  request_date   date not null,
  leave_time     text,
  appt_start     text,
  appt_return    text,
  appt_type      text,
  reason         text,
  makeup         text,
  status         text not null default 'pending',  -- 'pending'|'approved'|'denied'
  token          text unique not null,             -- REQ-XXXX (decision link id)
  decided_at     timestamptz,
  decided_by     text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_requests_class  on anew_requests(class_id);
create index if not exists idx_requests_status on anew_requests(status);

-- ── ATTENDANCE (instructor-logged, one row per student per day) ───────────
-- status: OT=on time, L=late, AE=absent-excused, AU=absent-unexcused
-- source: 'manual' or 'request' (an approved absence request auto-writes AE)
create table if not exists anew_attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references anew_students(id) on delete cascade,
  class_id    uuid not null references anew_classes(id) on delete cascade,
  date        date not null,
  status      text not null,                        -- OT | L | AE | AU
  notes       text,
  source      text not null default 'manual',       -- manual | request
  request_id  uuid references anew_requests(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, date)                          -- one record per student per day
);
create index if not exists idx_attendance_class_date on anew_attendance(class_id, date);

-- ── DEMERITS ──────────────────────────────────────────────────────────────
-- pts_num is the ACTUAL points applied (0 when excused). code/description are
-- snapshotted so historical records survive if the code list ever changes.
create table if not exists anew_demerits (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references anew_students(id) on delete cascade,
  class_id       uuid not null references anew_classes(id) on delete cascade,
  date           date not null,
  staff          text not null,
  code           int not null,
  description    text not null,
  pts_num        int not null default 0,            -- effective points (0 if excused)
  excused        boolean not null default false,
  excuse_reason  text,
  incident       text,
  signed         boolean not null default false,    -- acknowledgment captured
  created_at     timestamptz not null default now()
);
create index if not exists idx_demerits_student on anew_demerits(student_id);
create index if not exists idx_demerits_class   on anew_demerits(class_id);

-- ════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — lock every table. No anon policies = no public access.
-- The Netlify functions use the service-role key, which bypasses all of this.
-- ════════════════════════════════════════════════════════════════════════
alter table anew_instructors        enable row level security;
alter table anew_classes            enable row level security;
alter table anew_class_instructors  enable row level security;
alter table anew_students           enable row level security;
alter table anew_requests           enable row level security;
alter table anew_attendance         enable row level security;
alter table anew_demerits           enable row level security;

-- (Intentionally no CREATE POLICY statements. With RLS enabled and no policies,
--  the anon/auth roles are denied everything; only the service role gets through.)

-- ── Optional: if you previously had anon policies from the old app, drop them ──
-- Uncomment and run if migrating an existing project that had public access:
-- do $$ declare r record; begin
--   for r in (select schemaname, tablename, policyname from pg_policies
--             where tablename like 'anew_%') loop
--     execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
--   end loop;
-- end $$;
