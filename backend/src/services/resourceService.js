import { AppError } from '../utils/errors.js';
import * as documentRepository from '../repositories/documentRepository.js';
import { uploadDocument, deleteDocument, getDocument } from './documentService.js';
import { analyzeCourseOutline } from './courseOutline.js';
import { notify } from './notificationService.js';

function mapResource(doc, { includeText = false } = {}) {
  return {
    id: doc.id,
    fileName: doc.originalName,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    storageUrl: doc.storageUrl,
    status: doc.status,
    courseName: doc.courseName || null,
    courseCode: doc.courseCode || null,
    description: doc.description || null,
    topics: Array.isArray(doc.topics) ? doc.topics : [],
    objectives: Array.isArray(doc.objectives) ? doc.objectives : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(includeText ? { extractedText: doc.extractedText || '' } : {}),
  };
}

export async function listResources(userId) {
  const rows = await documentRepository.listResources(userId);
  return rows.map((row) => mapResource(row));
}

export async function getResource(userId, id) {
  const doc = await getDocument(userId, id, { includeText: true });
  return mapResource(doc, { includeText: true });
}

export async function uploadResource(userId, file, overrides = {}) {
  const doc = await uploadDocument(userId, file);
  if (doc.status !== 'ready' || !String(doc.extractedText || '').trim()) {
    throw new AppError(doc.errorMessage || 'The file was uploaded, but no readable text could be extracted.', 422, doc.detail || null);
  }
  const outline = analyzeCourseOutline(doc.extractedText);
  const saved = await documentRepository.update(doc.id, {
    courseName: String(overrides.courseName || '').trim() || outline.courseName,
    courseCode: String(overrides.courseCode || '').trim() || outline.courseCode,
    description: outline.description,
    topics: outline.topics,
    objectives: outline.objectives,
  });
  const mapped = mapResource(saved, { includeText: true });
  const note = String(saved.extractedText || '').match(/\nNote: ([^\n]+)\s*$/);
  if (note) mapped.extractionNote = note[1];
  await notify(userId, {
    title: 'Resource saved',
    message: `${saved.courseName || saved.originalName} is in your library.`,
    type: 'resource',
  });
  return mapped;
}

export async function removeResource(userId, id) {
  return deleteDocument(userId, id);
}
