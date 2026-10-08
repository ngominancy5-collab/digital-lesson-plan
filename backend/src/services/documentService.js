import fs from 'node:fs/promises';
import path from 'node:path';
import * as documentRepository from '../repositories/documentRepository.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { parseUploadedDocument } from './documentParser.js';

export async function listDocuments(userId) {
  return documentRepository.listByUser(userId);
}

export async function getDocument(userId, id, { includeText = false } = {}) {
  const doc = await documentRepository.findOwned(userId, id);
  if (!doc) throw new AppError('Document not found.', 404);
  if (!includeText) {
    const { extractedText, ...rest } = doc;
    return rest;
  }
  return doc;
}

export async function uploadDocument(userId, file) {
  if (!file) throw new AppError('Please choose a file to upload.');

  const storageUrl = `${env.fileStorageUrl}/${file.filename}`;
  const created = await documentRepository.create({
    userId,
    originalName: file.originalname,
    fileType: path.extname(file.originalname || '').toLowerCase() || 'unknown',
    fileSize: file.size,
    storagePath: file.path,
    storageUrl,
    status: 'processing',
  });

  try {
    const buffer = await fs.readFile(file.path);
    const base64 = buffer.toString('base64');
    const parsed = await parseUploadedDocument({
      fileName: file.originalname,
      mimeType: file.mimetype,
      contentBase64: base64,
      filePath: file.path,
    });

    if (!parsed.ok) {
      return documentRepository.update(created.id, { status: 'failed', errorMessage: parsed.error || 'Could not extract text.' });
    }

    return documentRepository.update(created.id, {
      status: 'ready',
      extractedText: parsed.text || '',
      errorMessage: null,
    });
  } catch (error) {
    return documentRepository.update(created.id, { status: 'failed', errorMessage: error.message || 'Upload processing failed.' });
  }
}

export async function deleteDocument(userId, id) {
  const doc = await documentRepository.findOwned(userId, id);
  if (!doc) throw new AppError('Document not found.', 404);
  try {
    await fs.unlink(doc.storagePath);
  } catch {
    // file may already be gone
  }
  await documentRepository.remove(id);
  return { ok: true };
}
