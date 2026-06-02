// functions/admin.js  → served at /admin
import { makeSb, ok, bad, clean, enc } from './_lib.js';

const DEMERIT_PTS = {
  1:1, 2:1, 3:1, 4:1, 5:1, 6:1, 7:3, 8:2, 9:2, 10:3,
  11:3, 12:3, 13:5, 14:5, 15:10, 16:10, 17:10, 18:10,
};

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

      case 'students': {
        const rows = await sb(`anew_students?class_id=eq.${enc(payload.classId)}&active=eq.true&order=last.asc`);
        return ok({ students: rows || [] });
      }

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

      case 'saveClass': {
        const { program_name, slug, cohorts = [], instructor_ids = [] } = payload;
        if (!clean(program_name) || !clean(slug)) return bad('Program name and slug required');
        if (!instructor_ids.length) return bad('Assign at least one instructor');
        const instrs = await sb('anew_instructors?active=eq.true');
        const names = instructor_ids.map(id => (instrs.find(i=>i.id===id)||{}).name).filter(Boolean).join(' & ');
        const emails = instructor_ids.map(id => (instrs.find(i=>i.id===id)||{}).email).filter(Boolean).join(', ');
        const data = { program_name: clean(program_name), slug: clean(slug), cohorts,
          instructor_name: names, instructor_email: emails, start_date: payload.start_date || null };
        let classId = payload.id;
        if (payload.id) {
          await sb(`anew_classes?id=eq.${enc(payload.id)}`, { method:'PATCH', body: JSON.stringify(data) });
        } else {
          const r = await sb('anew_classes', { method:'POST', body: JSON.stringify({ ...data, active:true }) });
          classId = r[0].id;
        }
        await sb(`anew_class_instructors?class_id=eq.${enc(classId)}`, { method:'DELETE', prefer:'return=minimal' });
        for (const iid of instructor_ids)
          await sb('anew_class_instructors', { method:'POST', prefer:'return=minimal', body: JSON.stringify({ class_id: classId, instructor_id: iid }) });
        return ok({ ok:true, classId });
      }
      case 'deleteClass':
        await sb(`anew_classes?id=eq.${enc(payload.id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ active:false }) });
        return ok({ ok:true });

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
        const toAdd = list.filter(s => !have.has((s.first+'|'+s.last).toLowerCase()))
          .map(s => ({ class_id: payload.classId, first: clean(s.first), last: clean(s.last), active:true }));
        if (toAdd.length) await sb('anew_students', { method:'POST', prefer:'return=minimal', body: JSON.stringify(toAdd) });
        return ok({ ok:true, added: toAdd.length });
      }
      case 'deleteStudent':
        await sb(`anew_students?id=eq.${enc(payload.id)}`, { method:'PATCH', prefer:'return=minimal', body: JSON.stringify({ active:false }) });
        return ok({ ok:true });

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
        await sb(`anew_requests?id=eq.${enc(id)}`, { method:'PATCH', prefer:'return=minimal',
          body: JSON.stringify({ status: decision, decided_at: new Date().toISOString(), decided_by: clean(payload.by) || 'Instructor' }) });
        return ok({ ok:true });
      }

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

      case 'demerits': {
        const rows = await sb(`anew_demerits?class_id=eq.${enc(payload.classId)}&voided=eq.false&order=created_at.desc`);
        return ok({ demerits: rows || [] });
      }
      case 'studentDemeritTotal': {
        const rows = await sb(`anew_demerits?student_id=eq.${enc(payload.studentId)}&excused=eq.false&voided=eq.false`);
        const total = (rows || []).reduce((s, d) => s + (d.pts_num || 0), 0);
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
        const rows = await sb(`anew_demerits?student_id=eq.${enc(studentId)}&excused=eq.false&voided=eq.false`);
        const total = (rows || []).reduce((s, d) => s + (d.pts_num || 0), 0);
        return ok({ ok:true, total });
      }

      case 'voidDemerit': {
        const { id, studentId } = payload;
        if (!id) return bad('Missing demerit id');
        await sb(`anew_demerits?id=eq.${enc(id)}`, { method:'PATCH', prefer:'return=minimal',
          body: JSON.stringify({ voided: true, voided_at: new Date().toISOString(), voided_by: clean(payload.by) || 'Instructor' }) });
        // recompute the student's running total without the voided one
        let total = 0;
        if (studentId) {
          const rows = await sb(`anew_demerits?student_id=eq.${enc(studentId)}&excused=eq.false&voided=eq.false`);
          total = (rows || []).reduce((s, d) => s + (d.pts_num || 0), 0);
        }
        return ok({ ok:true, total });
      }

      default:
        return bad('Unknown action: ' + action);
    }
  } catch (e) {
    return bad(e.message, 500);
  }
}
