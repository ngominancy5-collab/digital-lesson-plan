import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordChangeBlocks, roleConfirmationBlocks } from '../src/middleware/auth.js';

test('a temporary password blocks dashboard APIs but allows the password change', () => {
  const pending = { mustChangePassword: true };
  const ready = { mustChangePassword: false };
  assert.equal(passwordChangeBlocks(pending, '/api/lesson-plans'), true);
  assert.equal(passwordChangeBlocks(pending, '/api/dashboard?tab=home'), true);
  assert.equal(passwordChangeBlocks(pending, '/api/auth/me'), false);
  assert.equal(passwordChangeBlocks(pending, '/api/auth/change-password'), false);
  assert.equal(passwordChangeBlocks(ready, '/api/lesson-plans'), false);
  assert.equal(passwordChangeBlocks(null, '/api/lesson-plans'), false);
  const awaitingRole = { mustChangePassword: false, role: 'teacher', roleConfirmed: false };
  assert.equal(roleConfirmationBlocks(awaitingRole, '/api/lesson-plans'), true);
  assert.equal(roleConfirmationBlocks(awaitingRole, '/api/auth/confirm-role'), false);
  assert.equal(roleConfirmationBlocks({ role: 'unassigned', roleConfirmed: false }, '/api/lesson-plans'), false);
});
