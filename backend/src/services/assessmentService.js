import { AppError } from '../utils/errors.js';
import { mapAssessment } from '../utils/mappers.js';
import { completeJson } from './ai/aiClient.js';
import * as assessmentRepository from '../repositories/assessmentRepository.js';
import { recordActivity } from './activityService.js';
import * as documentRepository from '../repositories/documentRepository.js';
import { notify } from './notificationService.js';

export async function listAssessments(userId) {
  const rows = await assessmentRepository.listByUser(userId);
  return rows.map(mapAssessment);
}

export async function getAssessment(userId, id) {
  const row = await assessmentRepository.findOwned(userId, id);
  if (!row) throw new AppError('Assessment not found.', 404);
  return mapAssessment(row);
}

export async function createAssessment(userId, body) {
  const row = await assessmentRepository.create({
    userId,
    lessonPlanId: body.lessonPlanId || null,
    title: String(body.title || 'Untitled assessment').trim(),
    description: body.description || '',
    type: body.type || body.kind || 'quiz',
    instructions: body.instructions || '',
    marks: body.marks ?? body.totalMarks ?? null,
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    status: body.status || 'draft',
    questions: body.questions || [],
    meta: body.meta || {},
  });
  await recordActivity({
    userId,
    type: row.meta?.generated ? 'ai.assessment' : 'assessment.created',
    summary: row.meta?.generated ? 'AI assessment saved' : 'Assessment saved',
    targetType: 'assessment',
    targetId: row.id,
    meta: { title: row.title },
  });
  return mapAssessment(row);
}

export async function updateAssessment(userId, id, body) {
  const existing = await assessmentRepository.findOwned(userId, id);
  if (!existing) throw new AppError('Assessment not found.', 404);
  const row = await assessmentRepository.update(id, {
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    type: body.type || body.kind || existing.type,
    instructions: body.instructions ?? existing.instructions,
    marks: body.marks ?? body.totalMarks ?? existing.marks,
    dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : existing.dueDate,
    status: body.status ?? existing.status,
    questions: body.questions ?? existing.questions,
    meta: body.meta ?? existing.meta,
    lessonPlanId: body.lessonPlanId !== undefined ? body.lessonPlanId : existing.lessonPlanId,
  });
  return mapAssessment(row);
}

export async function deleteAssessment(userId, id) {
  const existing = await assessmentRepository.findOwned(userId, id);
  if (!existing) throw new AppError('Assessment not found.', 404);
  await assessmentRepository.remove(id);
  return { ok: true };
}

async function loadOwnedMaterialText(userId, documentIds) {
  const ids = [...new Set((documentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return { materialText: '', sourceDocumentIds: [] };

  const parts = [];
  const sourceDocumentIds = [];
  for (const id of ids) {
    const doc = await documentRepository.findOwned(userId, id);
    if (!doc) {
      throw new AppError('One of the selected files was not found or you do not have access to it.', 404);
    }
    const text = String(doc.extractedText || '').trim();
    if (!text) {
      throw new AppError(
        `"${doc.originalName || 'Selected file'}" has no readable text yet. Wait for processing to finish, or choose another file.`,
        400,
      );
    }
    parts.push(`--- ${doc.originalName || id} ---\n${text}`);
    sourceDocumentIds.push(doc.id);
  }
  return { materialText: parts.join('\n\n'), sourceDocumentIds };
}

export async function generateAssessment(userId, body) {
  const requestedIds = [
    ...(Array.isArray(body.documentIds) ? body.documentIds : []),
    ...(body.documentId ? [body.documentId] : []),
  ];
  let materialText = body.materialText || '';
  let sourceDocumentIds = [];
  if (requestedIds.length) {
    const loaded = await loadOwnedMaterialText(userId, requestedIds);
    materialText = loaded.materialText;
    sourceDocumentIds = loaded.sourceDocumentIds;
  }
  if (!String(materialText).trim()) {
    throw new AppError('Source material is required to generate an assessment.');
  }

  const count = Number(body.count || 10);
  const difficulty = body.difficulty || 'Intermediate';
  const { data } = await completeJson(
    'You are an expert assessment designer. Return JSON only.',
    `Create a ${body.kind || body.type || 'quiz'} with ${count} questions at ${difficulty} difficulty from this material.

Material:
${String(materialText).slice(0, 12000)}

Question types allowed: ${(body.questionTypes || ['multiple-choice', 'true-false', 'short-answer']).join(', ')}
Marks per question: ${body.marksPerQuestion || 2}
Total marks target: ${body.totalMarks || count * 2}
Time allowed: ${body.timeAllowed || 'Not specified. Leave timeAllowed empty.'}
Topics include: ${body.topicsInclude || 'any'}
Topics exclude: ${body.topicsExclude || 'none'}

Return JSON:
{
  "title": "string",
  "kind": "quiz|test",
  "instructions": "string",
  "timeAllowed": "string",
  "totalMarks": number,
  "difficulty": "string",
  "questions": [
    {
      "id": "q1",
      "type": "multiple-choice|true-false|short-answer",
      "prompt": "string",
      "options": ["A","B","C","D"],
      "answer": "string",
      "marks": number,
      "explanation": "string"
    }
  ]
}`,
  );

  if (!data?.questions?.length) throw new AppError('AI could not generate the assessment. Try again.', 502);

  const saved = await createAssessment(userId, {
    ...data,
    type: data.kind || body.kind || 'quiz',
    marks: data.totalMarks,
    lessonPlanId: body.lessonPlanId || null,
    status: 'draft',
    meta: {
      generated: true,
      sourceDocumentId: sourceDocumentIds[0] || body.documentId || null,
      sourceDocumentIds,
      difficulty,
    },
  });
  await notify(userId, {
    title: 'Assessment ready',
    message: saved.title || 'A new assessment was generated.',
    type: 'assessment',
  });
  return saved;
}
