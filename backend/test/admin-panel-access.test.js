import assert from 'node:assert/strict';
import test from 'node:test';
import { requireAdmin } from '../src/middleware/auth.js';
import { maskIdentifier } from '../src/services/activityService.js';

test('only an administrator passes the admin gate', () => {
  const denied = [];
  requireAdmin({ user: { role: 'lecturer' } }, {}, (error) => denied.push(error));
  assert.equal(denied[0].status, 403);
  assert.match(denied[0].message, /administrator/i);

  let passed = false;
  requireAdmin({ user: { role: 'admin' } }, {}, () => { passed = true; });
  assert.equal(passed, true);
});

test('failed sign-in records do not keep the full identifier or a password', () => {
  assert.equal(maskIdentifier('liah@school.edu'), 'l***@school.edu');
  assert.equal(maskIdentifier('lecturer'), 'l***');
  assert.doesNotMatch(maskIdentifier('secret-password'), /secret-password/);
});
