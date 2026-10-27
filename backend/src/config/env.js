import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(backendRoot, '..');

// Backend defaults first; project-root .env (including `neon env pull`) wins.
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, '.env'), override: true });

function required(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  return value;
}

function resolveClientUrl() {
  const configured = String(process.env.CLIENT_URL || '').trim();
  if (configured) return configured;
  const renderUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim();
  if (renderUrl) return renderUrl;
  return 'http://localhost:5180';
}

function resolveCorsOrigins() {
  const origins = new Set();
  const client = resolveClientUrl().replace(/\/$/, '');
  if (client) origins.add(client);
  const renderUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (renderUrl) origins.add(renderUrl);
  return [...origins];
}

function resolveDatabaseUrls() {
  let databaseUrl = required('DATABASE_URL');
  let databaseUrlUnpooled = required('DATABASE_URL_UNPOOLED');
  // Strip accidental quotes from Neon / dashboard copy-paste
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  databaseUrlUnpooled = databaseUrlUnpooled.replace(/^["']|["']$/g, '');
  if (!databaseUrlUnpooled && databaseUrl) {
    databaseUrlUnpooled = databaseUrl.includes('-pooler')
      ? databaseUrl.replace('-pooler', '')
      : databaseUrl;
  }
  if (databaseUrlUnpooled && !process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL_UNPOOLED = databaseUrlUnpooled;
  }
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  return { databaseUrl, databaseUrlUnpooled };
}

const { databaseUrl, databaseUrlUnpooled } = resolveDatabaseUrls();

export const env = {
  port: Number(process.env.PORT || 3001),
  clientUrl: resolveClientUrl(),
  corsOrigins: resolveCorsOrigins(),
  databaseUrl,
  databaseUrlUnpooled,
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me'),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '7d'),
  fileStoragePath: path.resolve(backendRoot, required('FILE_STORAGE_PATH', './uploads')),
  fileStorageUrl: required('FILE_STORAGE_URL', '/uploads'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 15 * 1024 * 1024),
  nodeEnv: process.env.NODE_ENV || 'development',
};

export function unapprovedTestAccountsAllowed() {
  if (String(process.env.NODE_ENV || env.nodeEnv || '').toLowerCase() === 'production') return false;
  return String(process.env.ALLOW_UNAPPROVED_TEST_ACCOUNTS || 'false').trim().toLowerCase() === 'true';
}

export function assertEnv() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required. Set your Neon (or Postgres) connection string.');
  }
  if (!/^postgres(ql)?:\/\//i.test(env.databaseUrl)) {
    throw new Error('DATABASE_URL must start with postgresql:// (remove wrapping quotes if present).');
  }
  if (env.nodeEnv === 'production') {
    if (!env.databaseUrlUnpooled) {
      throw new Error('DATABASE_URL_UNPOOLED is required in production for Prisma migrations (Neon direct URL, no -pooler).');
    }
    if (env.jwtSecret === 'dev-only-change-me' || env.jwtSecret.length < 16) {
      throw new Error('JWT_SECRET must be set to a strong secret (16+ characters) in production.');
    }
    if (!String(process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || '').trim()) {
      throw new Error('CLIENT_URL (or RENDER_EXTERNAL_URL) must be set in production for CORS and auth links.');
    }
    if (!String(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '').trim()) {
      console.warn('Warning: no GEMINI_API_KEY (or OPENAI_API_KEY) configured — AI generation will fail until set.');
    }
  }
}
