// functions/api/admin.js  → served at /api/admin
// Lives under /api so the path doesn't collide with the static /admin.html page
// (Cloudflare Pages auto-redirects .html → clean URL, which would otherwise loop).
import {
  makeSb, ok, bad, clean, enc,
  DEMERIT_PTS, decideRequest, instructorOwnsClass,
} from '../_lib.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. POST JSON to /api/admin.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }
  return onRequestPost(context);
}

async function activeTotal(sb, studentId) {
  const rows = await sb(
    `anew_demerits?student_id=eq.${enc(studentId)}&excused=eq.false&voided=eq.false`
  );
  return (rows || []).reduce((s, d) => s + (d.pts_num || 0), 0);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const sb = makeSb(env);
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

  let body;
  try { body = await request.json(); } catch { return bad('Bad JSON'); }

  if (!ADMIN_PASSWORD) return bad('Server missing ADMIN_PASSWORD', 500);
  if (body.password !== ADMIN_PASSWORD) return bad('Unauthorized', 401);

  const { action, payload = {} } = body;

  try {
    switch (action) {
      // ── Session ────────────────────────────────────────────────────
      case 'login':
        return ok({ ok: true });

      case 'bootstrap': {
        const [instructors, classes] = await Promise.all([
          sb('anew_instructors?order=name.asc&active=eq.true'),
          sb('anew_classes?order=created_at.asc&active=eq.true'),
        ]);
        let links = [];
        if (classes && classes.length) {
          const ids = classes.map(c => c.id).join(',');
          links = await sb(`anew_class_instructors?class_id=in.(${ids})`) || [];
        }
        const byClass = {};
        for (const l of links) (byClass[l.class_id] = byClass[l.class_id] || []).push(l.instructor_id);
        for (const c of (classes || [])) c.instructor_ids = byClass[c.id] || [];
        return ok({ instructors: instructors || [], classes: classes || [] });
      }

      // ── Roster ─────────────────────────────────────────────────────
      case 'students': {
        const rows = await sb(`anew_students?class_id=eq.${enc(payload.classId)}&active=eq.true&order=last.asc`);
        return ok({ students: rows || [] });
      }

      // ── Instructors ────────────────────────────────────────────────
      case 'saveInstructor': {
        const name = clean(payload.name), email = clean(payload.email);
        if (!name || !email) return bad('Name and email required');
        if (payload.id)
          await sb(`anew_instructors?id=eq.${enc(payload.id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ name, email }) });
        else
          await sb('anew_instructors', { method:'POST', prefer:'return=minimal', body: JSON.stringify({ name, email, active:true }) });
        return ok({ ok:true });
      }
      case 'deleteInstructor':
        await sb(`anew_instructors?id=eq.${enc(payload.id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ active:false }) });
        return ok({ ok:true });

      // ── Classes ────────────────────────────────────────────────────
      case 'saveClass': {
        const { program_name, slug, cohorts = [], instructor_ids = [] } = payload;
        if (!clean(program_name) || !clean(slug)) return bad('Program name and slug required');
        if (!Array.isArray(instructor_ids) || !instructor_ids.length) return bad('Assign at least one instructor');
        const instrs = await sb('anew_instructors?active=eq.true') || [];
        const validIds = instructor_ids.filter(id => instrs.find(i => i.id === id));
        if (!validIds.length) return bad('No valid instructors selected');
        const names  = validIds.map(id => (instrs.find(i=>i.id===id)||{}).name).filter(Boolean).join(' & ');
        const emails = validIds.map(id => (instrs.find(i=>i.id===id)||{}).email).filter(Boolean).join(', ');
        const data = { program_name: clean(program_name), slug: clean(slug), cohorts,
          instructor_name: names, instructor_email: emails, start_date: payload.start_date || null };
        let classId = payload.id;
        if (payload.id) {
          await sb(`anew_classes?id=eq.${enc(payload.id)}`, { method:'PATCH', body: JSON.stringify(data) });
        } else {
          const r = await sb('anew_classes', { method:'POST', body: JSON.stringify({ ...data, active:true }) });
          classId = r[0].id;
        }
        // Replace links in one shot (delete + bulk insert)
        await sb(`anew_class_instructors?class_id=eq.${enc(classId)}`, { method:'DELETE', prefer:'return=minimal' });
        if (validIds.length) {
          const linkRows = validIds.map(iid => ({ class_id: classId, instructor_id: iid }));
          await sb('anew_class_instructors', { method:'POST', prefer:'return=minimal', body: JSON.stringify(linkRows) });
        }
        return ok({ ok:true, classId });
      }
      case 'deleteClass':
        await sb(`anew_classes?id=eq.${enc(payload.id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ active:false }) });
        return ok({ ok:true });

      // ── Students (roster CRUD) ─────────────────────────────────────
      case 'addStudent': {
        const first = clean(payload.first), last = clean(payload.last);
        if (!first || !last) return bad('First and last name required');
        await sb('anew_students', { method:'POST', prefer:'return=minimal',
          body: JSON.stringify({ class_id: payload.classId, first, last, email: clean(payload.email) || null, active:true }) });
        return ok({ ok:true });
      }
      case 'addRoster': {
        const list = (payload.students || []).filter(s => clean(s.first) && clean(s.last));
        if (!list.length) return bad('No valid names');
        const existing = await sb(`anew_students?class_id=eq.${enc(payload.classId)}&active=eq.true`) || [];
        const have = new Set(existing.map(s => (s.first+'|'+s.last).toLowerCase()));
        const toAdd = list
          .filter(s => !have.has((clean(s.first)+'|'+clean(s.last)).toLowerCase()))
          .map(s => ({
            class_id: payload.classId,
            first:    clean(s.first),
            last:     clean(s.last),
            email:    clean(s.email) || null,
            active:   true,
          }));
        if (toAdd.length) await sb('anew_students', { method:'POST', prefer:'return=minimal', body: JSON.stringify(toAdd) });
        return ok({ ok:true, added: toAdd.length });
      }
      case 'deleteStudent':
        await sb(`anew_students?id=eq.${enc(payload.id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ active:false }) });
        return ok({ ok:true });

      case 'updateStudent': {
        const { id } = payload;
        if (!id) return bad('Missing student id');
        const first = clean(payload.first);
        const last  = clean(payload.last);
        const email = clean(payload.email);
        if (!first || !last) return bad('First and last name required');
        await sb(`anew_students?id=eq.${enc(id)}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({ first, last, email: email || null }),
        });
        return ok({ ok:true });
      }

      // ── Requests ───────────────────────────────────────────────────
      case 'requests': {
        let q = 'anew_requests?order=created_at.desc';
        if (payload.status) q += `&status=eq.${enc(payload.status)}`;
        if (payload.classId) q += `&class_id=eq.${enc(payload.classId)}`;
        const rows = await sb(q);
        return ok({ requests: rows || [] });
      }
      case 'decideRequest': {
        const { id, decision } = payload;
        if (!['approved','denied'].includes(decision)) return bad('Bad decision');
        if (!id) return bad('Missing request id');
        const rows = await sb(`anew_requests?id=eq.${enc(id)}&limit=1`);
        const reqRow = rows && rows[0];
        if (!reqRow) return bad('Request not found', 404);
        const r = await decideRequest(sb, reqRow, decision, payload.by);
        return ok({ ok:true, alreadyDecided: r.alreadyDecided, autoAttendance: r.autoAttendance });
      }

      // ── Attendance ─────────────────────────────────────────────────
      case 'attendanceDay': {
        const rows = await sb(`anew_attendance?class_id=eq.${enc(payload.classId)}&date=eq.${enc(payload.date)}`);
        return ok({ attendance: rows || [] });
      }
      case 'setAttendance': {
        const { studentId, classId, date, status, notes } = payload;
        const existing = await sb(`anew_attendance?student_id=eq.${enc(studentId)}&date=eq.${enc(date)}&limit=1`);
        if (existing && existing.length) {
          if (status)
            await sb(`anew_attendance?id=eq.${enc(existing[0].id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ status, notes: notes ?? existing[0].notes }) });
          else
            await sb(`anew_attendance?id=eq.${enc(existing[0].id)}`, { method:'DELETE', prefer:'return=minimal' });
        } else if (status) {
          await sb('anew_attendance', { method:'POST', prefer:'return=minimal',
            body: JSON.stringify({ student_id: studentId, class_id: classId, date, status, notes: notes || null, source:'manual' }) });
        }
        return ok({ ok:true });
      }

      // ── Demerits ───────────────────────────────────────────────────
      case 'demerits': {
        let q = `anew_demerits?class_id=eq.${enc(payload.classId)}&order=created_at.desc`;
        if (!payload.includeVoided) q += '&voided=eq.false';
        const rows = await sb(q);
        return ok({ demerits: rows || [] });
      }
      case 'studentDemeritTotal': {
        const total = await activeTotal(sb, payload.studentId);
        return ok({ total });
      }
      case 'issueDemerit': {
        const { studentId, classId, date, staff, code, excused, excuseReason, incident } = payload;
        const codeNum = parseInt(code);
        if (!studentId || !date || !staff || !codeNum) return bad('Missing required fields');
        if (!DEMERIT_PTS[codeNum]) return bad('Invalid code');
        const ptsNum = excused ? 0 : DEMERIT_PTS[codeNum];
        await sb('anew_demerits', { method:'POST', prefer:'return=minimal',
          body: JSON.stringify({
            student_id: studentId, class_id: classId, date, staff: clean(staff),
            code: codeNum, description: clean(payload.description) || '',
            pts_num: ptsNum, excused: !!excused,
            excuse_reason: excused ? clean(excuseReason) : null,
            incident: clean(incident) || null, signed: !!payload.signed,
          }) });
        const total = await activeTotal(sb, studentId);
        return ok({ ok:true, total });
      }
      case 'voidDemerit': {
        const { id, studentId } = payload;
        if (!id) return bad('Missing demerit id');
        await sb(`anew_demerits?id=eq.${enc(id)}`, { method:'PATCH', prefer:'return=minimal',
          body: JSON.stringify({ voided: true, voided_at: new Date().toISOString(), voided_by: clean(payload.by) || 'Instructor' }) });
        const total = studentId ? await activeTotal(sb, studentId) : 0;
        return ok({ ok:true, total });
      }
      case 'updateDemerit': {
        const { id, studentId } = payload;
        if (!id) return bad('Missing demerit id');
        const codeNum = parseInt(payload.code);
        const excused = !!payload.excused;
        if (!codeNum || !DEMERIT_PTS[codeNum]) return bad('Invalid code');
        if (!payload.date) return bad('Missing date');
        if (!clean(payload.staff)) return bad('Missing staff');
        const ptsNum = excused ? 0 : DEMERIT_PTS[codeNum];
        await sb(`anew_demerits?id=eq.${enc(id)}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({
            date: payload.date,
            staff: clean(payload.staff),
            code: codeNum,
            description: clean(payload.description) || '',
            pts_num: ptsNum,
            excused,
            excuse_reason: excused ? clean(payload.excuseReason) : null,
            incident: clean(payload.incident) || null,
          }),
        });
        const total = studentId ? await activeTotal(sb, studentId) : 0;
        return ok({ ok:true, total });
      }

      // ── CASE NOTES ─────────────────────────────────────────────────
      // All case-note actions require payload.instructorId, and the
      // instructor must be linked to payload.classId. Author identity is
      // recorded server-side from the instructor record, not the client.
      case 'caseNotes': {
        const { studentId, classId, instructorId, includeVoided } = payload;
        if (!studentId || !classId) return bad('Missing studentId or classId');
        if (!instructorId) return bad('Missing instructorId');
        if (!(await instructorOwnsClass(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }
        let q = `anew_case_notes?student_id=eq.${enc(studentId)}&class_id=eq.${enc(classId)}&order=note_date.desc,created_at.desc`;
        if (!includeVoided) q += '&voided=eq.false';
        const rows = await sb(q);
        return ok({ notes: rows || [] });
      }

      case 'addCaseNote': {
        const { studentId, classId, instructorId, subject, body: noteBody, category, noteDate, followupDate } = payload;
        if (!studentId || !classId) return bad('Missing studentId or classId');
        if (!instructorId) return bad('Missing instructorId');
        if (!clean(subject)) return bad('Subject is required');
        if (!clean(noteBody)) return bad('Note body is required');
        if (!(await instructorOwnsClass(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }
        const instrs = await sb(`anew_instructors?id=eq.${enc(instructorId)}&limit=1`);
        const instr = instrs && instrs[0];
        if (!instr) return bad('Instructor not found', 404);
        const row = {
          student_id: studentId,
          class_id:   classId,
          author_id:  instructorId,
          author_name: instr.name,
          note_date:  clean(noteDate) || new Date().toISOString().slice(0,10),
          category:   clean(category) || null,
          subject:    clean(subject),
          body:       clean(noteBody),
          followup_date: clean(followupDate) || null,
        };
        const r = await sb('anew_case_notes', { method:'POST', body: JSON.stringify(row) });
        return ok({ ok:true, note: r && r[0] });
      }

      case 'updateCaseNote': {
        const { id, classId, instructorId, subject, body: noteBody, category, noteDate, followupDate } = payload;
        if (!id) return bad('Missing case note id');
        if (!instructorId || !classId) return bad('Missing instructorId or classId');
        if (!(await instructorOwnsClass(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }
        // Verify the note belongs to that class (prevents cross-class edits)
        const existing = await sb(`anew_case_notes?id=eq.${enc(id)}&limit=1`);
        const note = existing && existing[0];
        if (!note) return bad('Case note not found', 404);
        if (note.class_id !== classId) return bad('Case note does not belong to that class', 403);
        const patch = {
          subject:       clean(subject) || note.subject,
          body:          clean(noteBody) || note.body,
          category:      clean(category) || null,
          note_date:     clean(noteDate) || note.note_date,
          followup_date: clean(followupDate) || null,
          updated_at:    new Date().toISOString(),
        };
        await sb(`anew_case_notes?id=eq.${enc(id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify(patch) });
        return ok({ ok:true });
      }

      case 'voidCaseNote': {
        const { id, classId, instructorId } = payload;
        if (!id) return bad('Missing case note id');
        if (!instructorId || !classId) return bad('Missing instructorId or classId');
        if (!(await instructorOwnsClass(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }
        const existing = await sb(`anew_case_notes?id=eq.${enc(id)}&limit=1`);
        const note = existing && existing[0];
        if (!note) return bad('Case note not found', 404);
        if (note.class_id !== classId) return bad('Case note does not belong to that class', 403);
        const instrs = await sb(`anew_instructors?id=eq.${enc(instructorId)}&limit=1`);
        const by = (instrs && instrs[0] && instrs[0].name) || 'Instructor';
        await sb(`anew_case_notes?id=eq.${enc(id)}`, { method:'PATCH', prefer:'return=minimal',
          body: JSON.stringify({ voided:true, voided_at: new Date().toISOString(), voided_by: by }) });
        return ok({ ok:true });
      }

      default:
        return bad('Unknown action: ' + action);
    }
  } catch (e) {
    console.error('admin action failed:', action, e && e.message);
    return bad(e.message, 500);
  }
}
