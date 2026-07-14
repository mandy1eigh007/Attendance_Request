// functions/api/gradebook.js → served at /api/gradebook
// Cohotrack Gradebook v1. Uses the existing anew_grades table as a JSON document store.
// No schema change is required. Never place secrets in this file.

import { makeSb, ok, bad, clean, enc, instructorOwnsClass } from '../_lib.js';

const STATE_ASSESSMENT = '__cohotrack_gradebook_v1';
const CONFIG_ASSESSMENT = '__cohotrack_gradebook_config_v1';

function safeJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function instructorRecord(sb, instructorId) {
  const rows = await sb(`anew_instructors?id=eq.${enc(instructorId)}&active=eq.true&limit=1`);
  return rows && rows[0];
}

async function verifyClassAccess(sb, instructorId, classId) {
  if (!instructorId || !classId) return false;
  return instructorOwnsClass(sb, instructorId, classId);
}

async function verifyStudentClass(sb, studentId, classId) {
  const rows = await sb(
    `anew_students?id=eq.${enc(studentId)}&class_id=eq.${enc(classId)}&active=eq.true&select=id&limit=1`
  );
  return !!(rows && rows[0]);
}

async function latestGradeRow(sb, classId, assessment, studentId = null) {
  let query = `anew_grades?class_id=eq.${enc(classId)}&assessment=eq.${enc(assessment)}`;
  if (studentId) query += `&student_id=eq.${enc(studentId)}`;
  query += '&order=created_at.desc&limit=1';
  const rows = await sb(query);
  return rows && rows[0];
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. POST JSON to /api/gradebook.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  const { request, env } = context;
  const sb = makeSb(env);
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('Bad JSON');
  }

  if (!env.ADMIN_PASSWORD) return bad('Server missing ADMIN_PASSWORD', 500);
  if (body.password !== env.ADMIN_PASSWORD) return bad('Unauthorized', 401);

  const { action, payload = {} } = body;

  try {
    switch (action) {
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
        for (const link of links) {
          (byClass[link.class_id] = byClass[link.class_id] || []).push(link.instructor_id);
        }
        for (const klass of classes || []) klass.instructor_ids = byClass[klass.id] || [];

        return ok({ instructors: instructors || [], classes: classes || [] });
      }

      case 'loadClass': {
        const { instructorId, classId } = payload;
        if (!(await verifyClassAccess(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }

        const [students, attendance, demerits, gradeRows, configRows] = await Promise.all([
          sb(`anew_students?class_id=eq.${enc(classId)}&active=eq.true&order=last.asc,first.asc`),
          sb(`anew_attendance?class_id=eq.${enc(classId)}&order=date.asc`),
          sb(`anew_demerits?class_id=eq.${enc(classId)}&voided=eq.false&order=date.desc,created_at.desc`),
          sb(`anew_grades?class_id=eq.${enc(classId)}&assessment=eq.${enc(STATE_ASSESSMENT)}&order=created_at.desc`),
          sb(`anew_grades?class_id=eq.${enc(classId)}&assessment=eq.${enc(CONFIG_ASSESSMENT)}&order=created_at.desc&limit=1`),
        ]);

        const states = {};
        for (const row of gradeRows || []) {
          if (states[row.student_id] !== undefined) continue;
          states[row.student_id] = safeJson(row.notes, null);
        }

        const config = configRows && configRows[0] ? safeJson(configRows[0].notes, null) : null;
        return ok({
          students: students || [],
          attendance: attendance || [],
          demerits: demerits || [],
          states,
          config,
        });
      }

      case 'saveStudent': {
        const { instructorId, classId, studentId, state, summaryScore } = payload;
        if (!(await verifyClassAccess(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }
        if (!(await verifyStudentClass(sb, studentId, classId))) {
          return bad('Student does not belong to this class', 403);
        }
        if (!state || typeof state !== 'object' || Array.isArray(state)) {
          return bad('Invalid gradebook state');
        }

        const instructor = await instructorRecord(sb, instructorId);
        if (!instructor) return bad('Instructor not found', 404);

        const notes = JSON.stringify(state);
        if (notes.length > 750000) return bad('Student gradebook record is too large');

        const existing = await latestGradeRow(sb, classId, STATE_ASSESSMENT, studentId);
        const row = {
          student_id: studentId,
          class_id: classId,
          assessment: STATE_ASSESSMENT,
          score: Number.isFinite(Number(summaryScore)) ? Number(summaryScore) : null,
          max_score: 100,
          letter: null,
          graded_on: new Date().toISOString().slice(0, 10),
          graded_by: instructor.name,
          notes,
        };

        if (existing) {
          await sb(`anew_grades?id=eq.${enc(existing.id)}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify(row),
          });
        } else {
          await sb('anew_grades', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify(row),
          });
        }
        return ok({ ok: true });
      }

      case 'saveConfig': {
        const { instructorId, classId, config } = payload;
        if (!(await verifyClassAccess(sb, instructorId, classId))) {
          return bad('You are not assigned to this class', 403);
        }
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          return bad('Invalid gradebook configuration');
        }

        const instructor = await instructorRecord(sb, instructorId);
        if (!instructor) return bad('Instructor not found', 404);

        const notes = JSON.stringify(config);
        if (notes.length > 300000) return bad('Gradebook configuration is too large');

        const existing = await latestGradeRow(sb, classId, CONFIG_ASSESSMENT);
        let studentId = existing && existing.student_id;
        if (!studentId) {
          const students = await sb(
            `anew_students?class_id=eq.${enc(classId)}&active=eq.true&select=id&order=created_at.asc&limit=1`
          );
          studentId = students && students[0] && students[0].id;
        }
        if (!studentId) return bad('Add at least one active student before saving gradebook settings');

        const row = {
          student_id: studentId,
          class_id: classId,
          assessment: CONFIG_ASSESSMENT,
          score: null,
          max_score: null,
          letter: null,
          graded_on: new Date().toISOString().slice(0, 10),
          graded_by: instructor.name,
          notes,
        };

        if (existing) {
          await sb(`anew_grades?id=eq.${enc(existing.id)}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify(row),
          });
        } else {
          await sb('anew_grades', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify(row),
          });
        }
        return ok({ ok: true });
      }

      default:
        return bad('Unknown action: ' + clean(action));
    }
  } catch (error) {
    console.error('gradebook action failed:', action, error && error.message);
    return bad(error.message || 'Gradebook request failed', 500);
  }
}
