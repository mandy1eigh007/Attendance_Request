// functions/respond.js  → served at /respond
import { makeSb, enc } from './_lib.js';

const EMAILJS_SERVICE_ID  = 'service_w5fxqhb';
const EMAILJS_TEMPLATE_ID = 'template_ad4tf59';
const EMAILJS_PUBLIC_KEY  = 'jyNFKwUKoOYerQd9p';

export async function onRequestGet(context) {
  const { request, env } = context;
  const sb = makeSb(env);
  const p = Object.fromEntries(new URL(request.url).searchParams);
  const decision = p.decision;
  const studentName = p.name || 'Student';
  const studentEmail = p.email || '';
  const date = p.date || '';
  const type = p.type || 'request';
  const instructor = p.instructor || 'your instructor';
  const program = p.program || 'ANEW';
  const token = p.token || '';

  if (!studentEmail || !['approved', 'denied'].includes(decision)) {
    return html(400, page('Error', 'Invalid or missing parameters. No email was sent.', '#C0392B', '⚠️'));
  }

  const isApproved = decision === 'approved';

  try {
    let reqRow = null;
    if (token) {
      try { const rows = await sb(`anew_requests?token=eq.${enc(token)}&limit=1`); reqRow = rows && rows[0]; }
      catch (e) {}
    }

    if (reqRow && reqRow.status && reqRow.status !== 'pending') {
      const already = reqRow.status === 'approved' ? 'Approved' : 'Denied';
      return html(200, page(`Already ${already}`,
        `This request was already <strong>${already.toLowerCase()}</strong> on ${fmtTs(reqRow.decided_at)}. No second email was sent.`,
        '#8295a0', 'ℹ️'));
    }

    if (reqRow) {
      await sb(`anew_requests?id=eq.${enc(reqRow.id)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ status: decision, decided_at: new Date().toISOString(), decided_by: instructor }),
      });

      if (isApproved && reqRow.student_id && reqRow.class_id && reqRow.request_date) {
        try {
          const existing = await sb(`anew_attendance?student_id=eq.${enc(reqRow.student_id)}&date=eq.${enc(reqRow.request_date)}&limit=1`);
          if (!existing || !existing.length) {
            await sb('anew_attendance', {
              method: 'POST', prefer: 'return=minimal',
              body: JSON.stringify({
                student_id: reqRow.student_id, class_id: reqRow.class_id,
                date: reqRow.request_date, status: 'AE',
                notes: `Auto: approved ${reqRow.request_type} request`,
                source: 'request', request_id: reqRow.id,
              }),
            });
          }
        } catch (e) {}
      }
    }

    const decisionLine = isApproved
      ? `✅ APPROVED — Your ${type} request for ${date} has been approved by ${instructor}.`
      : `❌ DENIED — Your ${type} request for ${date} has been reviewed by ${instructor}. Please contact your instructor to discuss next steps.`;
    const messageBody = isApproved
      ? `Hi ${studentName},\n\nGreat news! Your ${type} request for ${date} has been APPROVED by ${instructor}.\n\nSee you there! If you have any questions, reply to this email.\n\nANEW Pre-Apprenticeship Program\n${program}`
      : `Hi ${studentName},\n\nYour ${type} request for ${date} has been reviewed by ${instructor}.\n\nPlease reach out to your instructor to discuss next steps.\n\nANEW Pre-Apprenticeship Program\n${program}`;

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID, template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY, accessToken: env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: studentEmail, to_name: studentName,
          subject: isApproved ? `Your ANEW request for ${date} — APPROVED`
                              : `Your ANEW request for ${date} — Update from your instructor`,
          decision_line: decisionLine, message: messageBody, instructor, program,
        },
      }),
    });
    if (res.status !== 200) throw new Error('EmailJS error: ' + (await res.text()));

    const color = isApproved ? '#1A7A3E' : '#C0392B';
    const label = isApproved ? 'Approved' : 'Denied';
    const emoji = isApproved ? '✅' : '❌';
    const extra = (isApproved && reqRow && reqRow.student_id) ? '<br>An excused-absence record was logged automatically.' : '';
    return html(200, page(label,
      `Decision email sent to <strong>${studentName}</strong> at ${studentEmail}.<br>Request: ${type} on ${date}.${extra}`,
      color, emoji));

  } catch (err) {
    return html(500, page('Send Failed', 'Could not complete: ' + err.message, '#C0392B', '⚠️'));
  }
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
