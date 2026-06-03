// functions/submit.js  → served at /submit
import { makeSb, ok, bad, clean, isEmail, enc } from './_lib.js';

const EMAILJS_SERVICE_ID          = 'service_w5fxqhb';
const EMAILJS_TEMPLATE_INSTRUCTOR = 'template_3oe8h8c';
const EMAILJS_TEMPLATE_STUDENT    = 'template_ad4tf59';
const EMAILJS_PUBLIC_KEY          = 'jyNFKwUKoOYerQd9p';

async function sendEmail(env, template_id, template_params) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID, template_id,
      user_id: EMAILJS_PUBLIC_KEY, accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params,
    }),
  });
  if (res.status !== 200) throw new Error('EmailJS ' + res.status + ': ' + (await res.text()));
}

async function lookupClass(sb, slug) {
  const rows = await sb(`anew_classes?slug=eq.${enc(slug)}&active=eq.true&limit=1`);
  if (!rows || !rows.length) return null;
  const c = rows[0];
  return { id: c.id, program_name: c.program_name, instructor_name: c.instructor_name,
           instructor_email: c.instructor_email, cohorts: c.cohorts || [] };
}

async function matchStudent(sb, classId, first, last, email) {
  try {
    const roster = await sb(`anew_students?class_id=eq.${enc(classId)}&active=eq.true`);
    if (!roster || !roster.length) return null;
    const f = first.toLowerCase(), l = last.toLowerCase(), e = (email || '').toLowerCase();
    return (
      roster.find(s => (s.email || '').toLowerCase() === e && e) ||
      roster.find(s => s.first.toLowerCase() === f && s.last.toLowerCase() === l) ||
      roster.find(s => s.last.toLowerCase() === l && s.first.toLowerCase()[0] === f[0]) ||
      null
    );
  } catch { return null; }
}

// GET /submit?class=slug  → class info for the public form
export async function onRequestGet(context) {
  const { request, env } = context;
  const sb = makeSb(env);
  const slug = new URL(request.url).searchParams.get('class');
  try {
    if (!slug) {
      const rows = await sb('anew_classes?active=eq.true&order=program_name.asc');
      const classes = (rows || []).map(c => ({
        id: c.id,
        slug: c.slug,
        program_name: c.program_name,
        instructor_name: c.instructor_name,
      }));
      return ok({ classes });
    }
    const info = await lookupClass(sb, slug);
    return info ? ok(info) : bad('Class not found', 404);
  } catch (e) { return bad(e.message, 500); }
}

// POST /submit  → store request + email
export async function onRequestPost(context) {
  const { request, env } = context;
  const sb = makeSb(env);
  const SITE_URL = env.SITE_URL || new URL(request.url).origin;

  let d;
  try { d = await request.json(); } catch { return bad('Bad JSON'); }

  const first = clean(d.firstName), last = clean(d.lastName), email = clean(d.studentEmail);
  const cohort = clean(d.cohort), type = clean(d.requestType), date = clean(d.requestDate);
  if (!first || !last) return bad('Name is required');
  if (!isEmail(email)) return bad('Valid email is required');
  if (!cohort) return bad('Cohort is required');
  if (!['Full Absence', 'Leave Early', 'Appointment'].includes(type)) return bad('Invalid request type');
  if (!date) return bad('Date is required');
  if (type === 'Leave Early' && !clean(d.leaveTime)) return bad('Leave time required');
  if (type === 'Appointment' && (!clean(d.apptStart) || !clean(d.apptReturn))) return bad('Appointment times required');

  try {
    const slug = clean(d.classSlug);
    const cls = slug ? await lookupClass(sb, slug) : null;
    if (!cls) return bad('Class not found', 404);

    const token = 'REQ-' + Date.now().toString(36).toUpperCase();
    const matched = await matchStudent(sb, cls.id, first, last, email);

    await sb('anew_requests', {
      method: 'POST', prefer: 'return=minimal',
      body: JSON.stringify({
        class_id: cls.id, student_id: matched ? matched.id : null,
        student_first: first, student_last: last, student_email: email,
        cohort, request_type: type, request_date: date,
        leave_time: clean(d.leaveTime) || null, appt_start: clean(d.apptStart) || null,
        appt_return: clean(d.apptReturn) || null, appt_type: clean(d.apptType) || null,
        reason: clean(d.reason) || null, makeup: clean(d.makeup) || null,
        status: 'pending', token,
      }),
    });

    const p = new URLSearchParams({
      name: first + ' ' + last, email, date: clean(d.dateFormatted) || date,
      type, instructor: cls.instructor_name || 'your instructor',
      program: cls.program_name || 'ANEW', token,
    });
    const approveUrl = SITE_URL + '/respond?' + p + '&decision=approved';
    const denyUrl    = SITE_URL + '/respond?' + p + '&decision=denied';

    let timeDetails = '';
    if (type === 'Leave Early')
      timeDetails = `<div style="padding-bottom:12px"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Leaving At</div><div style="font-size:15px;color:#1C1C1C;font-weight:600">${clean(d.leaveTime)}</div></div>`;
    if (type === 'Appointment')
      timeDetails = `<table width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" style="padding-bottom:12px;vertical-align:top"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Appointment Start</div><div style="font-size:15px;color:#1C1C1C;font-weight:600">${clean(d.apptStart)}</div></td><td width="50%" style="padding-bottom:12px;vertical-align:top"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Estimated Return</div><div style="font-size:15px;color:#1C1C1C;font-weight:600">${clean(d.apptReturn)}</div></td></tr></table>`;

    const notesBlock = clean(d.reason)
      ? `<div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1b6b56;border-bottom:2px solid #2dd4a7;padding-bottom:5px;margin-bottom:12px">Notes</div><div style="font-size:14px;color:#1C1C1C;line-height:1.6;background:#FAFAF7;border-radius:6px;padding:12px 14px">${clean(d.reason)}</div>`
      : '';

    const dateFormatted = clean(d.dateFormatted) || date;

    await sendEmail(env, EMAILJS_TEMPLATE_INSTRUCTOR, {
      to_email: cls.instructor_email, reply_to: email,
      subject: `ANEW Request — ${first} ${last} — ${type} on ${dateFormatted}`,
      student_name: first + ' ' + last, student_email: email, cohort,
      request_type: type, request_date: dateFormatted,
      time_details: timeDetails, notes_block: notesBlock,
      makeup: clean(d.makeup) || 'Not specified',
      approve_url: approveUrl, deny_url: denyUrl, sub_id: token,
    });

    let studentEmailOk = true;
    try {
      await sendEmail(env, EMAILJS_TEMPLATE_STUDENT, {
        to_email: email, reply_to: cls.instructor_email,
        subject: `ANEW — Your ${type} request for ${dateFormatted} was received`,
        student_name: first, request_type: type, request_date: dateFormatted,
        cohort, instructor_name: cls.instructor_name, sub_id: token,
      });
    } catch (e) { studentEmailOk = false; }

    return ok({ ok: true, token, matched: !!matched, studentEmailOk });
  } catch (e) {
    return bad('Could not submit request: ' + e.message, 500);
  }
}
