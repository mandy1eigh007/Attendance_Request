// functions/api/verify-test-access.js  →  POST /api/verify-test-access
// Verifies Google identity + class PIN, or guest/instructor PIN, before a student can take a test.
import { makeSb, ok, bad, clean, enc } from '../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const sb = makeSb(env);

  let d;
  try { d = await request.json(); } catch { return bad('Bad JSON'); }

  // ── Guest / Instructor mode ───────────────────────────────────────────────
  if (d.guestMode) {
    const code = clean(d.guestPin);
    if (!code) return bad('Access code required', 403);

    // Instructor PIN — no name needed, unlocks answer-key mode
    if (env.INSTRUCTOR_PIN && code === env.INSTRUCTOR_PIN) {
      return ok({ ok: true, studentName: 'Instructor', mode: 'instructor', classId: null });
    }

    // Guest PIN — name required
    if (!env.GUEST_PIN || code !== env.GUEST_PIN) {
      return bad('Invalid access code', 403);
    }
    const studentName = clean(d.studentName);
    if (!studentName) return bad('Name required');
    return ok({ ok: true, studentName, mode: 'guest', classId: null });
  }

  // ── Google mode ───────────────────────────────────────────────────────────
  const googleToken = clean(d.googleToken);
  const classPin    = clean(d.classPin);

  if (!googleToken) return bad('googleToken required');
  if (!classPin)    return bad('classPin required');

  // Verify Google token via Google's tokeninfo endpoint
  let gInfo;
  try {
    const gRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleToken)}`
    );
    gInfo = await gRes.json();
    if (!gRes.ok || gInfo.error) throw new Error(gInfo.error || 'Token invalid');
  } catch (e) {
    return bad('Google sign-in failed — please try again', 401);
  }

  // Confirm token is for our app
  if (env.GOOGLE_CLIENT_ID && gInfo.aud !== env.GOOGLE_CLIENT_ID) {
    return bad('Token audience mismatch', 401);
  }

  // Verify class PIN against anew_classes
  let classes;
  try {
    classes = await sb(`anew_classes?select=id,program_name&class_pin=eq.${enc(classPin)}&limit=1`);
  } catch (e) {
    console.error('verify-test-access: class lookup failed:', e && e.message);
    return bad('Could not verify class code', 500);
  }

  if (!classes || !classes.length) {
    return bad('Invalid class code', 403);
  }

  return ok({
    ok:          true,
    studentName: gInfo.name,
    googleEmail: gInfo.email,
    mode:        'google',
    classId:     classes[0].id,
    className:   classes[0].program_name,
  });
}
