import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { parseUploadedDocument } from './documentParser.js';

export async function listDocuments(userId) {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalName: true,
      fileType: true,
      fileSize: true,
      storageUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getDocument(userId, id, { includeText = false } = {}) {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
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
  const created = await prisma.document.create({
    data: {
      userId,
      originalName: file.originalname,
      fileType: path.extname(file.originalname || '').toLowerCase() || 'unknown',
      fileSize: file.size,
      storagePath: file.path,
      storageUrl,
      status: 'processing',
    },
  });

  try {
    const buffer = await fs.readFile(file.path);
    const base64 = buffer.toString('base64');
    const parsed = await parseUploadedDocument({
      fileName: file.originalname,
      mimeType: file.mimetype,
      contentBase64: base64,
    });

    if (!parsed.ok) {
      return prisma.document.update({
        where: { id: created.id },
        data: { status: 'failed', errorMessage: parsed.error || 'Could not extract text.' },
      });
    }

    return prisma.document.update({
      where: { id: created.id },
      data: {
        status: 'ready',
        extractedText: parsed.text || '',
        errorMessage: null,
      },
    });
  } catch (error) {
    return prisma.document.update({
      where: { id: created.id },
      data: { status: 'failed', errorMessage: error.message || 'Upload processing failed.' },
    });
  }
}

export async function deleteDocument(userId, id) {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc) throw new AppError('Document not found.', 404);
  try {
    await fs.unlink(doc.storagePath);
  } catch {
    // file may already be gone
  }
  await prisma.document.delete({ where: { id } });
  return { ok: true };
}
