#!/usr/bin/env node
/**
 * Smoke test for the Cloudflare Pages Function at POST /admin.
 *
 * Usage:
 *   node scripts/smoke-admin.mjs [baseUrl]
 *
 * Examples:
 *   node scripts/smoke-admin.mjs http://127.0.0.1:8000
 *   node scripts/smoke-admin.mjs https://<your-pages-domain>
 *
 * Secrets:
 *   Reads ADMIN_PASSWORD from env var first, else from .dev.vars if present.
 */

import fs from 'node:fs';
import path from 'node:path';

function usageAndExit(msg) {
  if (msg) console.error(`\n${msg}\n`);
  console.error('Usage: node scripts/smoke-admin.mjs [options] [baseUrl]');
  console.error('  baseUrl default: http://127.0.0.1:8000');
  console.error('  Needs ADMIN_PASSWORD (env or .dev.vars).');
  console.error('Options:');
  console.error('  --e2e             Runs a DB-mutating end-to-end check (creates temp student + demerit).');
  console.error('  --classId <id>    Target class id for --e2e (defaults to first class from bootstrap).');
  process.exit(2);
}

function readDevVarsAdminPassword() {
  try {
    const devVarsPath = path.resolve(process.cwd(), '.dev.vars');
    if (!fs.existsSync(devVarsPath)) return null;
    const text = fs.readFileSync(devVarsPath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key === 'ADMIN_PASSWORD') return value;
    }
  } catch {
    // ignore
  }
  return null;
}

async function postAdmin(baseUrl, body) {
  const url = new URL('/admin', baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseArgs(argv) {
  const out = { e2e: false, classId: null, baseUrl: null };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === '--e2e') {
      out.e2e = true;
      continue;
    }
    if (a === '--classId') {
      const v = args.shift();
      if (!v) usageAndExit('Missing value for --classId');
      out.classId = v;
      continue;
    }
    if (a && a.startsWith('-')) {
      usageAndExit(`Unknown option: ${a}`);
    }
    // first positional arg = baseUrl
    if (!out.baseUrl) {
      out.baseUrl = a;
      continue;
    }
    usageAndExit(`Unexpected extra argument: ${a}`);
  }
  return out;
}

function isoDateToday() {
  // app stores date strings; keep it YYYY-MM-DD for consistency
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function runE2E({ baseUrl, password, classId }) {
  console.log('\nRunning --e2e (this will write to the database) ...');

  const stamp = Date.now().toString(36);
  const first = `SMOKE${stamp.slice(-4)}`;
  const last = `TEST${stamp.slice(-4)}`;
  const email1 = `smoke+${stamp}@example.com`;
  const email2 = `smoke+${stamp}+updated@example.com`;
  const date = isoDateToday();
  const staff = 'Smoke Test';
  const description = `Smoke test demerit ${stamp}`;

  let studentId = null;
  let demeritId = null;

  try {
    const boot = await postAdmin(baseUrl, { action: 'bootstrap', password });
    assert(boot.status === 200, `Expected 200 for bootstrap, got ${boot.status}`);
    const classes = boot.json?.classes || [];
    assert(Array.isArray(classes) && classes.length, 'No classes returned from bootstrap; cannot run --e2e');

    const targetClassId = classId || classes[0].id;
    assert(targetClassId, 'Could not determine classId for --e2e');

    // Create temp student
    {
      const r = await postAdmin(baseUrl, {
        action: 'addStudent',
        password,
        payload: { classId: targetClassId, first, last, email: email1 },
      });
      assert(r.status === 200, `Expected 200 for addStudent, got ${r.status}: ${JSON.stringify(r.json)}`);
    }

    // Find student id
    {
      const r = await postAdmin(baseUrl, {
        action: 'students',
        password,
        payload: { classId: targetClassId },
      });
      assert(r.status === 200, `Expected 200 for students, got ${r.status}`);
      const students = r.json?.students || [];
      const s = students.find(x => String(x.first || '').trim() === first && String(x.last || '').trim() === last);
      assert(s && s.id, 'Created student not found in class roster');
      studentId = s.id;
    }

    // Totals should start at 0
    {
      const r = await postAdmin(baseUrl, {
        action: 'studentDemeritTotal',
        password,
        payload: { studentId },
      });
      assert(r.status === 200, `Expected 200 for studentDemeritTotal, got ${r.status}`);
      assert(typeof r.json?.total === 'number', `Expected numeric total, got ${JSON.stringify(r.json)}`);
      assert(r.json.total === 0, `Expected starting total 0, got ${r.json.total}`);
    }

    // Issue demerit (code 1 => 1 point)
    {
      const r = await postAdmin(baseUrl, {
        action: 'issueDemerit',
        password,
        payload: {
          studentId,
          classId: targetClassId,
          date,
          staff,
          code: 1,
          excused: false,
          description,
          incident: `smoke-${stamp}`,
          signed: false,
        },
      });
      assert(r.status === 200, `Expected 200 for issueDemerit, got ${r.status}: ${JSON.stringify(r.json)}`);
      assert(r.json?.ok === true, `Expected ok:true from issueDemerit, got ${JSON.stringify(r.json)}`);
    }

    // Total should now be 1
    {
      const r = await postAdmin(baseUrl, {
        action: 'studentDemeritTotal',
        password,
        payload: { studentId },
      });
      assert(r.status === 200, `Expected 200 for studentDemeritTotal, got ${r.status}`);
      assert(r.json?.total === 1, `Expected total 1 after issue, got ${JSON.stringify(r.json)}`);
    }

    // Find the demerit id
    {
      const r = await postAdmin(baseUrl, {
        action: 'demerits',
        password,
        payload: { classId: targetClassId, includeVoided: true },
      });
      assert(r.status === 200, `Expected 200 for demerits, got ${r.status}`);
      const rows = r.json?.demerits || [];
      const d = rows.find(x => x.student_id === studentId && x.date === date && x.staff === staff && x.description === description);
      assert(d && d.id, 'Issued demerit not found in class demerits list');
      demeritId = d.id;
    }

    // Update student email
    {
      const r = await postAdmin(baseUrl, {
        action: 'updateStudent',
        password,
        payload: { id: studentId, first, last, email: email2 },
      });
      assert(r.status === 200, `Expected 200 for updateStudent, got ${r.status}: ${JSON.stringify(r.json)}`);
    }

    // Verify student email updated
    {
      const r = await postAdmin(baseUrl, {
        action: 'students',
        password,
        payload: { classId: targetClassId },
      });
      assert(r.status === 200, `Expected 200 for students, got ${r.status}`);
      const students = r.json?.students || [];
      const s = students.find(x => x.id === studentId);
      assert(s, 'Updated student not found');
      assert((s.email || '') === email2, `Expected email updated to ${email2}, got ${String(s.email)}`);
    }

    // Update demerit to be excused (points should become 0)
    {
      const r = await postAdmin(baseUrl, {
        action: 'updateDemerit',
        password,
        payload: {
          id: demeritId,
          studentId,
          date,
          staff,
          code: 7,
          description,
          excused: true,
          excuseReason: `Excused by smoke test ${stamp}`,
          incident: `smoke-${stamp}-updated`,
        },
      });
      assert(r.status === 200, `Expected 200 for updateDemerit, got ${r.status}: ${JSON.stringify(r.json)}`);
      assert(r.json?.ok === true, `Expected ok:true from updateDemerit, got ${JSON.stringify(r.json)}`);
    }

    // Total should now be 0
    {
      const r = await postAdmin(baseUrl, {
        action: 'studentDemeritTotal',
        password,
        payload: { studentId },
      });
      assert(r.status === 200, `Expected 200 for studentDemeritTotal, got ${r.status}`);
      assert(r.json?.total === 0, `Expected total 0 after excusing, got ${JSON.stringify(r.json)}`);
    }

    console.log('✓ e2e ok (updateStudent + updateDemerit verified)');
  } finally {
    // best-effort cleanup so we don't clutter real data
    if (demeritId) {
      try {
        await postAdmin(baseUrl, {
          action: 'voidDemerit',
          password,
          payload: { id: demeritId, studentId, by: 'Smoke Test' },
        });
      } catch {
        // ignore
      }
    }
    if (studentId) {
      try {
        await postAdmin(baseUrl, {
          action: 'deleteStudent',
          password,
          payload: { id: studentId },
        });
      } catch {
        // ignore
      }
    }
  }
}

const opts = parseArgs(process.argv.slice(2));
const baseUrl = opts.baseUrl || 'http://127.0.0.1:8000';
const password = process.env.ADMIN_PASSWORD || readDevVarsAdminPassword();
if (!password) usageAndExit('Missing ADMIN_PASSWORD. Set env var or create .dev.vars with ADMIN_PASSWORD=...');

console.log(`Smoke testing ${baseUrl} ...`);

try {
  // 1) Endpoint reachable + auth enforced (does not require Supabase vars)
  {
    const r = await postAdmin(baseUrl, { action: 'login', password: '__WRONG__' });
    assert(r.status === 401, `Expected 401 for wrong password, got ${r.status}`);
    assert(r.json && r.json.error === 'Unauthorized', `Expected {error:"Unauthorized"}, got ${JSON.stringify(r.json)}`);
    console.log('✓ /admin reachable; unauthorized rejected');
  }

  // 2) Auth works
  {
    const r = await postAdmin(baseUrl, { action: 'login', password });
    assert(r.status === 200, `Expected 200 for login, got ${r.status}`);
    assert(r.json && r.json.ok === true, `Expected {ok:true}, got ${JSON.stringify(r.json)}`);
    console.log('✓ login ok');
  }

  // 3) Supabase connectivity (bootstrap)
  {
    const r = await postAdmin(baseUrl, { action: 'bootstrap', password });
    assert(r.status === 200, `Expected 200 for bootstrap, got ${r.status}`);
    assert(r.json && Array.isArray(r.json.instructors) && Array.isArray(r.json.classes), `Expected instructors/classes arrays, got ${JSON.stringify(r.json)}`);
    console.log(`✓ bootstrap ok (instructors=${r.json.instructors.length}, classes=${r.json.classes.length})`);
  }

  // 4) New actions wired (validate expected errors without needing real IDs)
  {
    const r = await postAdmin(baseUrl, { action: 'updateStudent', password, payload: {} });
    assert(r.status === 400, `Expected 400 for updateStudent missing id, got ${r.status}`);
    assert(r.json && r.json.error === 'Missing student id', `Expected Missing student id, got ${JSON.stringify(r.json)}`);
    console.log('✓ updateStudent action present');
  }

  {
    const r = await postAdmin(baseUrl, { action: 'updateDemerit', password, payload: {} });
    assert(r.status === 400, `Expected 400 for updateDemerit missing id, got ${r.status}`);
    assert(r.json && r.json.error === 'Missing demerit id', `Expected Missing demerit id, got ${JSON.stringify(r.json)}`);
    console.log('✓ updateDemerit action present');
  }

  // Case notes: ensure the action is wired and rejects missing fields.
  {
    const r = await postAdmin(baseUrl, { action: 'caseNotes', password, payload: {} });
    assert(r.status === 400, `Expected 400 for caseNotes missing fields, got ${r.status}`);
    assert(r.json && /Missing/.test(r.json.error || ''), `Expected Missing... for caseNotes, got ${JSON.stringify(r.json)}`);
    console.log('✓ caseNotes action present');
  }
  {
    const r = await postAdmin(baseUrl, { action: 'addCaseNote', password, payload: {} });
    assert(r.status === 400, `Expected 400 for addCaseNote missing fields, got ${r.status}`);
    console.log('✓ addCaseNote action present');
  }

  // Method check
  {
    const url = new URL('/admin', baseUrl);
    const res = await fetch(url, { method: 'GET' });
    assert(res.status === 405, `Expected 405 for GET /admin, got ${res.status}`);
    console.log('✓ GET /admin rejected with 405');
  }

  if (opts.e2e) {
    await runE2E({ baseUrl, password, classId: opts.classId });
  }

  console.log('\nAll smoke checks passed.');
  process.exit(0);
} catch (e) {
  console.error('\nSmoke test failed.');
  console.error(String(e?.message || e));
  process.exit(1);
}
