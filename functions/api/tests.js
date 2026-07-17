// functions/api/tests.js  →  POST /api/tests
// Saves a student test result to anew_test_results.
import { makeSb, ok, bad, clean } from '../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const sb = makeSb(env);

  let d;
  try { d = await request.json(); } catch { return bad('Bad JSON'); }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // TESTS_WRITE_TOKEN must be set in Cloudflare Pages → Settings → Environment
  // variables (do NOT commit a value). /api/verify-test-access hands the same
  // token to the client after a successful sign-in; without it, anyone could
  // POST fake scores.
  if (!env.TESTS_WRITE_TOKEN || d.authToken !== env.TESTS_WRITE_TOKEN) {
    return bad('Unauthorized', 401);
  }

  const studentName = clean(d.studentName);
  const testName    = clean(d.testName);
  const score       = parseInt(d.score);
  const total       = parseInt(d.total);
  const pct         = parseFloat(d.pct);

  if (!studentName) return bad('studentName is required');
  if (!testName)    return bad('testName is required');
  if (isNaN(score) || isNaN(total) || total < 1) return bad('Invalid score or total');

  try {
    const row = await sb('anew_test_results', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        student_name: studentName,
        test_name:    testName,
        score,
        total,
        pct: isNaN(pct) ? null : pct,
        auth_mode: clean(d.authMode) || null,
        class_id:  d.classId || null,
        answers:   d.answers || null,
        taken_at:  new Date().toISOString(),
      }),
    });
    return ok({ ok: true, id: (row && row[0]) ? row[0].id : null });
  } catch (e) {
    console.error('tests POST failed:', e && e.message);
    return bad('Could not save result: ' + e.message, 500);
  }
}
