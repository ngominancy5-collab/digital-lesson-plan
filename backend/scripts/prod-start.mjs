/**
 * Production start for Render: ensure Prisma directUrl env exists, push schema, start API.
 * If DATABASE_URL_UNPOOLED is missing, fall back to DATABASE_URL so deploys do not crash.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

if (!process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
  console.warn('DATABASE_URL_UNPOOLED was not set; using DATABASE_URL for Prisma directUrl.');
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

await run('npx', ['prisma', 'db', 'push']);
await run('node', ['src/server.js']);
