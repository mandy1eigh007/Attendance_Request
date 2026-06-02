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
  console.error('Usage: node scripts/smoke-admin.mjs [baseUrl]');
  console.error('  baseUrl default: http://127.0.0.1:8000');
  console.error('  Needs ADMIN_PASSWORD (env or .dev.vars).');
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

const baseUrl = process.argv[2] || 'http://127.0.0.1:8000';
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

  console.log('\nAll smoke checks passed.');
  process.exit(0);
} catch (e) {
  console.error('\nSmoke test failed.');
  console.error(String(e?.message || e));
  process.exit(1);
}
