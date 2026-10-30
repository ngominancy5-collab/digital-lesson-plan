import { AppError } from '../utils/errors.js';

const TRANSIENT_PRISMA_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

const TRANSIENT_MESSAGE_RE = /can'?t reach database|timed out|timeout|econnreset|econnrefused|connection terminated|server has closed the connection|too many connections|neon|cold start|connection.*reset|socket hang up/i;

export const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'executeRaw',
  'executeRawUnsafe',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientDbError(error) {
  if (!error) return false;
  const code = String(error.code || error.errorCode || '');
  if (TRANSIENT_PRISMA_CODES.has(code)) return true;
  const name = String(error.name || '');
  if (name === 'PrismaClientInitializationError' || name === 'PrismaClientRustPanicError') return true;
  return TRANSIENT_MESSAGE_RE.test(String(error.message || ''));
}

export function isWriteOperation(operation) {
  return WRITE_OPERATIONS.has(String(operation || ''));
}

/**
 * Retry only recoverable Neon/Postgres connectivity failures.
 * Writes get fewer attempts and only for clearly transient errors.
 */
export async function withDbRetry(operation, options = {}) {
  const isWrite = Boolean(options.isWrite);
  const maxAttempts = Number(options.maxAttempts) || (isWrite ? 2 : 4);
  const baseDelayMs = Number(options.baseDelayMs) || 700;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const transient = isTransientDbError(error);
      const canRetry = transient && attempt < maxAttempts;
      if (!canRetry) break;
      const waitMs = baseDelayMs * attempt;
      console.warn(
        `Transient database error (${error.code || error.name || 'unknown'}) on attempt ${attempt}/${maxAttempts}. Retrying in ${waitMs}ms…`,
      );
      await sleep(waitMs);
    }
  }

  if (isTransientDbError(lastError)) {
    throw new AppError(
      'The database is waking up or temporarily unavailable. Please wait a moment and try again.',
      503,
      { code: lastError?.code || 'DB_UNAVAILABLE' },
    );
  }
  throw lastError;
}
