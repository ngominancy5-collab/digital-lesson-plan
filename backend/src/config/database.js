import { PrismaClient } from '@prisma/client';
import {
  isTransientDbError,
  isWriteOperation,
  withDbRetry,
} from './databaseRetry.js';

const globalForPrisma = globalThis;

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return base.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        const isWrite = isWriteOperation(operation);
        return withDbRetry(() => query(args), { isWrite });
      },
    },
  });
}

export const prisma = globalForPrisma.__planwisePrisma || createPrismaClient();

// Keep one client per process in every environment (including production Render).
globalForPrisma.__planwisePrisma = prisma;

export { isTransientDbError, withDbRetry } from './databaseRetry.js';

export async function checkDatabaseHealth(timeoutMs = 8000) {
  const started = Date.now();
  try {
    await withDbRetry(async () => {
      const result = await Promise.race([
        prisma.$queryRaw`SELECT 1 AS ok`,
        new Promise((_, reject) => {
          setTimeout(() => reject(Object.assign(new Error('Database health check timed out'), { code: 'P1002' })), timeoutMs);
        }),
      ]);
      return result;
    }, { isWrite: false, maxAttempts: 3, baseDelayMs: 500 });

    return {
      ok: true,
      status: 'up',
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'down',
      latencyMs: Date.now() - started,
      error: isTransientDbError(error)
        ? 'Database unreachable or still waking from idle.'
        : 'Database check failed.',
    };
  }
}

/**
 * Log redacted Postgres host info for ops verification. Never logs passwords.
 */
export function logDatabaseTarget() {
  try {
    const pooled = String(process.env.DATABASE_URL || '');
    const direct = String(process.env.DATABASE_URL_UNPOOLED || '');
    const pooledHost = pooled ? new URL(pooled.replace(/^postgresql:/i, 'postgres:')).host : '';
    const directHost = direct ? new URL(direct.replace(/^postgresql:/i, 'postgres:')).host : '';
    const pooledOk = /-pooler\./i.test(pooledHost);
    const directOk = Boolean(directHost) && !/-pooler\./i.test(directHost);
    console.info(`Database pooled host: ${pooledHost || '(missing)'} (${pooledOk ? 'ok' : 'expected -pooler'})`);
    console.info(`Database direct host: ${directHost || '(missing)'} (${directOk ? 'ok' : 'expected non-pooler'})`);
    return { pooledHost, directHost, pooledOk, directOk };
  } catch (error) {
    console.warn('Could not parse database hosts for verification:', error.message);
    return { pooledHost: '', directHost: '', pooledOk: false, directOk: false };
  }
}

export default prisma;
