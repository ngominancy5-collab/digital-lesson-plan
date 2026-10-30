import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientDbError, withDbRetry } from '../src/config/databaseRetry.js';

test('detects transient Neon / Prisma connection codes', () => {
  assert.equal(isTransientDbError({ code: 'P1001', message: 'Can\'t reach database server' }), true);
  assert.equal(isTransientDbError({ code: 'P1017', message: 'Server has closed the connection' }), true);
  assert.equal(isTransientDbError({ code: 'P2024', message: 'Timed out fetching a new connection' }), true);
  assert.equal(isTransientDbError({ name: 'PrismaClientInitializationError', message: 'init failed' }), true);
  assert.equal(isTransientDbError({ code: 'P2002', message: 'Unique constraint failed' }), false);
  assert.equal(isTransientDbError({ code: 'P2003', message: 'Foreign key constraint failed' }), false);
});

test('retries transient failures then succeeds', async () => {
  let attempts = 0;
  const value = await withDbRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error('Can\'t reach database server');
      error.code = 'P1001';
      throw error;
    }
    return 'ok';
  }, { isWrite: false, maxAttempts: 4, baseDelayMs: 10 });
  assert.equal(value, 'ok');
  assert.equal(attempts, 3);
});

test('does not retry non-transient errors', async () => {
  let attempts = 0;
  await assert.rejects(async () => {
    await withDbRetry(async () => {
      attempts += 1;
      const error = new Error('Unique constraint failed');
      error.code = 'P2002';
      throw error;
    }, { isWrite: true, maxAttempts: 4, baseDelayMs: 10 });
  }, /Unique constraint failed/);
  assert.equal(attempts, 1);
});

test('write path uses fewer attempts and maps final transient error', async () => {
  let attempts = 0;
  await assert.rejects(async () => {
    await withDbRetry(async () => {
      attempts += 1;
      const error = new Error('Can\'t reach database server');
      error.code = 'P1001';
      throw error;
    }, { isWrite: true, maxAttempts: 2, baseDelayMs: 10 });
  }, /waking up or temporarily unavailable/);
  assert.equal(attempts, 2);
});
