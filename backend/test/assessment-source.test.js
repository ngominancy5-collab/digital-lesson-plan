import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAssessment } from '../src/services/assessmentService.js';

test('generateAssessment rejects unauthorized or missing document ids', async () => {
  await assert.rejects(
    () => generateAssessment('user-does-not-own', {
      documentIds: ['missing-doc-id'],
      count: 2,
      kind: 'quiz',
    }),
    (error) => error?.status === 404 || /not found|do not have access/i.test(String(error?.message || '')),
  );
});

test('generateAssessment requires source material when no documents provided', async () => {
  await assert.rejects(
    () => generateAssessment('any-user', { count: 2, kind: 'quiz' }),
    (error) => /source material|required/i.test(String(error?.message || '')),
  );
});
