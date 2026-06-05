// functions/respond.js  → served at /respond
import { makeSb, enc, EMAILJS, decideRequest } from './_lib.js';

export async function onRequestGet(context) {
  // Approve/deny is now handled in the authenticated instructor dashboard.
  // This endpoint no longer changes any request — that prevents email-client
  // link prefetching from auto-deciding requests. Old email links land here
  // and are safely redirected to the dashboard.
  const origin = new URL(context.request.url).origin;
  return html(200, page('Manage in the Dashboard',
    'Requests are now approved or denied in the instructor dashboard. Open the dashboard, go to the <strong>Requests</strong> tab, and decide there — the student is emailed automatically. <br><br><a href="' + origin + '/admin/" style="color:#2dd4a7;font-weight:600">Open the dashboard →</a>',
    '#2dd4a7', '\uD83D\uDCCB'));
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
.tag{display:inline-block;margin-top:22px;background:${color}1f;color:${color};border:.5px solid ${color}55;padding:6px 16px;border-radius:980px;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase}
</style></head><body>
<div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${msg}</p><div class="tag">ANEW Attendance System</div></div>
</body></html>`;
}
