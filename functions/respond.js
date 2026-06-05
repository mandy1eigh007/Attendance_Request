// functions/respond.js  → served at /respond
//
// Decisions are made ONLY in the instructor dashboard (Requests tab), never
// from email links. Email clients and security scanners prefetch links to
// build previews; when approve/deny were live GET actions, that prefetch
// silently auto-decided (usually denied) requests before the instructor
// acted. This handler therefore NEVER changes a request — it only shows the
// current status and sends the instructor to the dashboard.
import { makeSb, enc } from './_lib.js';

const eh = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function onRequestGet(context) {
  const { request, env } = context;
  const sb = makeSb(env);
  const url = new URL(request.url);
  const p = Object.fromEntries(url.searchParams);
  const SITE_URL = env.SITE_URL || url.origin;
  const dash = SITE_URL + '/admin';
  const token = p.token || '';

  let name = p.name || 'Student';
  let type = p.type || 'request';
  let date = p.date || '';
  let status = '', decidedAt = '', decidedBy = '';

  if (token) {
    try {
      const rows = await sb(`anew_requests?token=eq.${enc(token)}&limit=1`);
      const r = rows && rows[0];
      if (r) {
        name = `${r.student_first || ''} ${r.student_last || ''}`.trim() || name;
        type = r.request_type || type;
        date = r.request_date || date;
        status = r.status || '';
        decidedAt = r.decided_at || '';
        decidedBy = r.decided_by || '';
      }
    } catch (e) { console.error('respond: load failed:', e && e.message); }
  }

  const btn = `<a href="${eh(dash)}" style="display:inline-block;margin-top:22px;background:#2dd4a7;color:#06231c;text-decoration:none;padding:13px 24px;border-radius:980px;font-size:14px;font-weight:700;letter-spacing:.3px">Open Instructor Dashboard →</a>`;

  if (status && status !== 'pending') {
    const label = status === 'approved' ? 'Approved' : 'Denied';
    const color = status === 'approved' ? '#1A7A3E' : '#C0392B';
    const emoji = status === 'approved' ? '✅' : '❌';
    return html(200, page(`Already ${label}`,
      `${eh(name)}'s ${eh(type)} request${date ? ' for ' + eh(date) : ''} was already <strong>${label.toLowerCase()}</strong>${decidedAt ? ' on ' + fmtTs(decidedAt) : ''}${decidedBy ? ' by ' + eh(decidedBy) : ''}.<br><br>Requests are managed in the dashboard — email links never change anything.${btn}`,
      color, emoji));
  }

  const summary = (status === 'pending')
    ? `${eh(name)}'s ${eh(type)} request${date ? ' for ' + eh(date) : ''} is <strong>pending</strong>.`
    : `Requests can't be approved or denied from email links.`;
  return html(200, page('Manage in Dashboard',
    `${summary}<br><br>Approve or deny it in your <strong>Instructor Dashboard → Requests</strong> tab. Email links are auto-opened by mail apps, so decisions intentionally don't happen here.${btn}`,
    '#2dd4a7', '🗂️'));
}

function fmtTs(ts){ if(!ts) return 'an earlier date'; try { return new Date(ts).toLocaleString('en-US'); } catch { return 'an earlier date'; } }
const html = (status, body) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

function page(title, msg, color, icon) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><meta name="theme-color" content="#0e1413">
<title>ANEW — ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}:root{color-scheme:dark}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue','Segoe UI',system-ui,sans-serif;
background:#0e1413;color:#f1f6f4;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;
padding:24px;-webkit-font-smoothing:antialiased;letter-spacing:-.01em;position:relative;overflow:hidden}
body::before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(120% 80% at 50% -10%,${color}22,transparent 55%)}
.card{position:relative;background:rgba(28,37,36,.82);backdrop-filter:saturate(180%) blur(30px);-webkit-backdrop-filter:saturate(180%) blur(30px);
border:.5px solid rgba(255,255,255,.18);border-radius:24px;padding:40px 30px;max-width:410px;width:100%;text-align:center;box-shadow:0 30px 90px rgba(0,0,0,.62)}
.icon{width:64px;height:64px;border-radius:18px;background:${color}26;color:${color};display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 18px}
h1{font-size:24px;font-weight:700;letter-spacing:-.03em;margin-bottom:10px}
p{font-size:15px;color:#bccac6;line-height:1.6}strong{color:#f1f6f4}
</style></head><body>
<div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${msg}</p></div>
</body></html>`;
}
