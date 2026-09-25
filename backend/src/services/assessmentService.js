import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { mapAssessment } from '../utils/mappers.js';
import { completeJson } from './llm.js';

export async function listAssessments(userId) {
  const rows = await prisma.assessment.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(mapAssessment);
}

export async function getAssessment(userId, id) {
  const row = await prisma.assessment.findFirst({ where: { id, userId } });
  if (!row) throw new AppError('Assessment not found.', 404);
  return mapAssessment(row);
}

export async function createAssessment(userId, body) {
  const row = await prisma.assessment.create({
    data: {
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
    },
  });
  return mapAssessment(row);
}

export async function updateAssessment(userId, id, body) {
  const existing = await prisma.assessment.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Assessment not found.', 404);
  const row = await prisma.assessment.update({
    where: { id },
    data: {
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
    },
  });
  return mapAssessment(row);
}

export async function deleteAssessment(userId, id) {
  const existing = await prisma.assessment.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Assessment not found.', 404);
  await prisma.assessment.delete({ where: { id } });
  return { ok: true };
}

export async function generateAssessment(userId, body) {
  let materialText = body.materialText || '';
  if (body.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: body.documentId, userId } });
    if (!doc?.extractedText) throw new AppError('Upload and process a document before generating an assessment.');
    materialText = doc.extractedText;
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
Time allowed: ${body.timeAllowed || '40 minutes'}
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

  return createAssessment(userId, {
    ...data,
    type: data.kind || body.kind || 'quiz',
    marks: data.totalMarks,
    lessonPlanId: body.lessonPlanId || null,
    status: 'draft',
    meta: { generated: true, sourceDocumentId: body.documentId || null },
  });
}
