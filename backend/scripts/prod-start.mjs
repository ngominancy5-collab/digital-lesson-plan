/**
 * Production start for Render: ensure Prisma directUrl env exists, push schema, start API.
 * If DATABASE_URL_UNPOOLED is missing, fall back to DATABASE_URL so deploys do not crash.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function cleanUrl(raw) {
  let value = String(raw || '').trim().replace(/^["']|["']$/g, '');
  // channel_binding=require often breaks Prisma/Node TLS on hosted runtimes
  value = value
    .replace(/([?&])channel_binding=require&?/g, '$1')
    .replace(/[?&]$/, '');
  return value;
}

function assertPgUrl(name, value) {
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    console.error(
      `${name} must start with postgresql:// (full Neon URL including user:password@host). ` +
        `Got: ${value.slice(0, 48)}...`,
    );
    process.exit(1);
  }
}

process.env.DATABASE_URL = cleanUrl(process.env.DATABASE_URL);
process.env.DATABASE_URL_UNPOOLED = cleanUrl(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
);

assertPgUrl('DATABASE_URL', process.env.DATABASE_URL);
assertPgUrl('DATABASE_URL_UNPOOLED', process.env.DATABASE_URL_UNPOOLED);

try {
  const pooledHost = new URL(process.env.DATABASE_URL.replace(/^postgresql:/i, 'postgres:')).host;
  const directHost = new URL(process.env.DATABASE_URL_UNPOOLED.replace(/^postgresql:/i, 'postgres:')).host;
  const pooledOk = /-pooler\./i.test(pooledHost);
  const directOk = Boolean(directHost) && !/-pooler\./i.test(directHost);
  console.info(`Using pooled database host: ${pooledHost} (${pooledOk ? 'ok' : 'WARNING: expected -pooler'})`);
  console.info(`Using direct database host: ${directHost} (${directOk ? 'ok' : 'WARNING: expected non-pooler'})`);
  if (!pooledOk || !directOk) {
    console.warn('Neon URL shape looks incorrect. DATABASE_URL should use the pooler host; DATABASE_URL_UNPOOLED should be direct.');
  }
} catch {
  console.warn('Could not parse DATABASE_URL hosts for logging.');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function pushSchemaWithRetry(attempts = 4) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      console.info(`Running prisma db push (attempt ${i}/${attempts})...`);
      await run('npx', ['prisma', 'db', 'push', '--skip-generate']);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`prisma db push failed on attempt ${i}: ${error.message}`);
      if (i < attempts) {
        const waitMs = i * 5000;
        console.info(`Waiting ${waitMs / 1000}s for Neon compute to wake...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastError;
}

await pushSchemaWithRetry();
await run('node', ['src/server.js']);
