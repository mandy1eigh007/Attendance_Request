// functions/_lib.js
// Shared helpers for Cloudflare Pages Functions.
// NOTE: unlike Netlify, Cloudflare passes env per-request (context.env), so every
// helper that needs secrets takes an `env` argument. No secret is ever hardcoded.

// ── Supabase fetch wrapper ─────────────────────────────────────────────
export function makeSb(env) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
  return async function sb(path, opts = {}) {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Server missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: opts.prefer || 'return=representation',
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  };
}

// ── HTTP helpers ───────────────────────────────────────────────────────
export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const ok  = (body) => json(200, body);
export const bad = (msg, code = 400) => json(code, { error: msg });

export const clean = (v) => (typeof v === 'string' ? v.trim() : v);
export const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
export const enc = (v) => encodeURIComponent(v);

// ── EmailJS constants (public IDs; private key is in env) ──────────────
export const EMAILJS = {
  SERVICE_ID:           'service_w5fxqhb',
  TEMPLATE_INSTRUCTOR:  'template_3oe8h8c',
  TEMPLATE_STUDENT:     'template_ad4tf59',
  PUBLIC_KEY:           'jyNFKwUKoOYerQd9p',
};

export async function sendEmail(env, template_id, template_params) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS.SERVICE_ID,
      template_id,
      user_id: EMAILJS.PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params,
    }),
  });
  if (res.status !== 200) {
    throw new Error('EmailJS ' + res.status + ': ' + (await res.text()));
  }
}

// ── Demerit point table (single source of truth) ───────────────────────
export const DEMERIT_PTS = {
  1:1, 2:1, 3:1, 4:1, 5:1, 6:1, 7:3, 8:2, 9:2, 10:3,
  11:3, 12:3, 13:5, 14:5, 15:10, 16:10, 17:10, 18:10,
};

// ── Shared request-decision logic (used by /admin and /respond) ────────
// Returns { changed, alreadyDecided, autoAttendance, requestRow }
export async function decideRequest(sb, requestRow, decision, decidedBy) {
  if (!requestRow) return { changed: false, alreadyDecided: false, autoAttendance: false };
  if (requestRow.status && requestRow.status !== 'pending') {
    return { changed: false, alreadyDecided: true, autoAttendance: false, requestRow };
  }
  await sb(`anew_requests?id=eq.${enc(requestRow.id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: clean(decidedBy) || 'Instructor',
    }),
  });

  let autoAttendance = false;
  if (decision === 'approved' && requestRow.student_id && requestRow.class_id && requestRow.request_date) {
    try {
      const existing = await sb(
        `anew_attendance?student_id=eq.${enc(requestRow.student_id)}&date=eq.${enc(requestRow.request_date)}&limit=1`
      );
      if (!existing || !existing.length) {
        await sb('anew_attendance', {
          method: 'POST',
          prefer: 'return=minimal',
          body: JSON.stringify({
            student_id: requestRow.student_id,
            class_id: requestRow.class_id,
            date: requestRow.request_date,
            status: 'AE',
            notes: `Auto: approved ${requestRow.request_type} request`,
            source: 'request',
            request_id: requestRow.id,
          }),
        });
        autoAttendance = true;
      }
    } catch (e) {
      console.error('decideRequest: failed to write auto-AE row:', e && e.message);
    }
  }

  return { changed: true, alreadyDecided: false, autoAttendance, requestRow };
}

// ── Instructor / class authorization for case notes ────────────────────
// Returns true if the instructor is linked to the class via anew_class_instructors.
export async function instructorOwnsClass(sb, instructorId, classId) {
  if (!instructorId || !classId) return false;
  const rows = await sb(
    `anew_class_instructors?class_id=eq.${enc(classId)}&instructor_id=eq.${enc(instructorId)}&limit=1`
  );
  return !!(rows && rows.length);
}

// ── Best-effort per-IP rate limit (uses Cloudflare's edge cache) ───────
// Returns true if the request is allowed, false if rate-limited.
export async function rateLimit(bucket, key, windowSec = 60) {
  try {
    const cache = caches.default;
    if (!cache) return true;
    const url = `https://ratelimit.local/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
    const reqKey = new Request(url);
    const hit = await cache.match(reqKey);
    if (hit) return false;
    const marker = new Response('1', {
      headers: { 'Cache-Control': `max-age=${windowSec}` },
    });
    await cache.put(reqKey, marker);
    return true;
  } catch {
    return true; // never block on rate-limit infrastructure failure
  }
}

export const clientIp = (request) =>
  (request.headers.get('cf-connecting-ip') ||
   request.headers.get('x-forwarded-for') ||
   'unknown').split(',')[0].trim();
