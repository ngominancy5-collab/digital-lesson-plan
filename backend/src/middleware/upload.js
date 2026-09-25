import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.txt', '.pptx', '.doc', '.ppt', '.md', '.csv']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/octet-stream',
]);

fs.mkdirSync(env.fileStoragePath, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.fileStoragePath),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}-${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new AppError('Unsupported file type. Use PDF, DOCX, PPTX, or TXT.', 400));
  }
  if (file.mimetype && !ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith('text/')) {
    return cb(new AppError('Unsupported file type.', 400));
  }
  return cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});
