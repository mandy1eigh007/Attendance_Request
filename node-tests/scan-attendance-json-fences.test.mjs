import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAiJson } from '../functions/api/scan-attendance.js';

test('parses plain JSON', () => {
  assert.deepEqual(parseAiJson('{"sheets":[]}'), { sheets: [] });
});

test('parses a JSON fence separated by a newline', () => {
  assert.deepEqual(parseAiJson('```json\n{"sheets":[]}\n```'), { sheets: [] });
});

test('parses a JSON fence separated by a space', () => {
  assert.deepEqual(parseAiJson('```json {"slips":[]} ```'), { slips: [] });
});

test('accepts uppercase and extended fence labels', () => {
  assert.deepEqual(parseAiJson('```JSONC\n{"slips":[]}\n```'), { slips: [] });
});

test('rejects invalid JSON', () => {
  assert.throws(() => parseAiJson('not json'), SyntaxError);
});
