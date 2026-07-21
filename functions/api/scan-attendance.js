// functions/api/scan-attendance.js  → served at /api/scan-attendance
// Accepts a base64-encoded image or PDF, parses it with Claude Haiku,
// fuzzy-matches names to the class roster, and returns structured JSON.
import { makeSb, ok, bad, enc } from '../_lib.js';

const DEMERIT_PARSE_PROMPT = `Parse these ANEW demerit slips and return ONLY valid JSON, no markdown.

Each page is one demerit slip. Return:
{"slips":[{"student_name":"Gemechu Washo","staff_name":"Mandy Richardson","date":"7/2/2026","demerit_code":8,"excused":false,"notes":"Student arrived late to class..."}]}

Rules:
- student_name: from Client Name field at bottom of slip
- staff_name: from Staff Name field at bottom
- date: handwritten date at bottom (M/D/YYYY format)
- demerit_code: integer 1-18, whichever row has a hand-drawn circle around its number in the printed table
- excused: true if the word Excused appears near the date, false otherwise
- notes: handwritten notes at the bottom
- Multi-page PDF: one entry per page in slips array
- Return ONLY the JSON object, nothing else`;

const PARSE_PROMPT = `Parse this ANEW program attendance sheet and return ONLY valid JSON, no markdown, no explanation.

Return this exact structure:
{"sheets":[{"class":"Pace 64","week":"Week 9","dates":["7/14/2026","7/15/2026","7/16/2026","7/17/2026"],"students":[{"row":1,"name":"Aaron DeSelms","skipped":false,"attendance":{"7/14/2026":"OT","7/15/2026":"OT","7/16/2026":null,"7/17/2026":"L"}}],"notes":"handwritten notes at bottom verbatim"}]}

Rules:
- Each day has 5 columns: On Time, Late, Absent, Excused, Unexcused
- Checkmark in On Time column = "OT"
- Checkmark in Late column = "L"
- Checkmark in Absent + Excused = "AE"
- Checkmark in Absent + Unexcused = "AU"
- No mark = null
- Fully blacked-out rows = skipped:true, attendance:{}
- Multi-page PDF: one entry in sheets array per page
- Dates format: M/D/YYYY
- Student names: exactly as printed (Last, First format)
- Return ONLY the JSON object, nothing else`;

// Simple fuzzy match: normalize to lowercase, strip punctuation, check
// if either direction contains the other or shares enough tokens.
function normName(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

function matchName(parsed, roster) {
  if (!parsed || !roster || !roster.length) return null;
  const raw = normName(parsed);
  for (const s of roster) {
    const rFirst = normName(s.first);
    const rLast  = normName(s.last);
    const combos = [
      rLast + ' ' + rFirst,
      rFirst + ' ' + rLast,
      rLast + ', ' + rFirst,
    ];
    const rawNoComma = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim();
    if (combos.some(c => c === raw || c === rawNoComma)) {
      return s;
    }
    // Partial: if both last name tokens appear in the parsed string
    if (rLast && rFirst && rawNoComma.includes(rLast) && rawNoComma.includes(rFirst)) {
      return s;
    }
  }
  return null;
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return bad('POST only', 405);
  return onRequestPost(context);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const sb = makeSb(env);

  let body;
  try { body = await request.json(); } catch { return bad('Bad JSON'); }

  const { password, fileData, mimeType, classId, scanType = 'attendance' } = body;

  if (!env.ADMIN_PASSWORD) return bad('Server missing ADMIN_PASSWORD', 500);
  if (password !== env.ADMIN_PASSWORD) return bad('Unauthorized', 401);

  if (!fileData) return bad('Missing fileData');
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!mimeType || !allowedTypes.includes(mimeType)) return bad('mimeType must be image/jpeg, image/png, or application/pdf');
  if (!env.ANTHROPIC_API_KEY) return bad('Server missing ANTHROPIC_API_KEY', 500);

  const prompt = scanType === 'demerit' ? DEMERIT_PARSE_PROMPT : PARSE_PROMPT;

  // Call Anthropic API
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: mimeType === 'application/pdf' ? 'document' : 'image',
            source: { type: 'base64', media_type: mimeType, data: fileData }
          },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });
  const aiJson = await aiRes.json();
  if (!aiRes.ok) return bad('AI service error: ' + (aiJson.error && aiJson.error.message || aiRes.status), 502);
  const rawText = aiJson.content[0].text.trim();

  // Load roster
  let roster = [];
  if (classId) {
    try {
      roster = await sb(`anew_students?class_id=eq.${enc(classId)}&active=eq.true&order=last.asc`) || [];
    } catch (e) {
      console.error('scan-attendance: failed to load roster:', e && e.message);
    }
  }

  // Demerit path
  if (scanType === 'demerit') {
    let parsed;
    try { parsed = JSON.parse(rawText); } catch { return bad('Could not parse demerit slips', 422); }
    const slips = (parsed.slips || []).map(slip => {
      const match = matchName(slip.student_name, roster);
      return { ...slip, studentId: match ? match.id : null, matched: !!match, rosterName: match ? match.first + ' ' + match.last : null };
    });
    return ok({ slips, roster });
  }

  // Attendance path
  let parsed;
  try {
    const cleaned = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return bad('AI returned non-JSON response: ' + rawText.slice(0, 200), 502);
  }

  const sheets = parsed.sheets || [];

  // Fuzzy-match names to roster
  for (const sheet of sheets) {
    for (const stu of (sheet.students || [])) {
      if (stu.skipped) { stu.studentId = null; stu.matched = false; continue; }
      const match = matchName(stu.name, roster);
      if (match) {
        stu.studentId  = match.id;
        stu.matched    = true;
        stu.rosterName = match.first + ' ' + match.last;
      } else {
        stu.studentId = null;
        stu.matched   = false;
      }
    }
  }

  return ok({ sheets, roster });
}
