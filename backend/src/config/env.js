import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

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

export const env = {
  port: Number(process.env.PORT || 3001),
  clientUrl: resolveClientUrl(),
  databaseUrl: required('DATABASE_URL'),
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
    throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env and set your PostgreSQL URL.');
  }
  if (env.nodeEnv === 'production' && env.jwtSecret === 'dev-only-change-me') {
    throw new Error('JWT_SECRET must be set to a strong secret in production.');
  }
}
