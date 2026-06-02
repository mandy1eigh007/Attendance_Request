// functions/_lib.js
// Shared helpers for Cloudflare Pages Functions.
// NOTE: unlike Netlify, Cloudflare passes env per-request (context.env), so every
// helper that needs secrets takes an `env` argument. No secret is ever hardcoded.

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

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const ok  = (body) => json(200, body);
export const bad = (msg, code = 400) => json(code, { error: msg });

export const clean = (v) => (typeof v === 'string' ? v.trim() : v);
export const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
export const enc = (v) => encodeURIComponent(v);
