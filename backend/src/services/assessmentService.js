import { AppError } from '../utils/errors.js';
import { mapAssessment } from '../utils/mappers.js';
import { completeJson } from './ai/aiClient.js';
import { packSourceMaterial } from './ai/sourceMaterialPacker.js';
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

async function loadOwnedMaterialFiles(userId, documentIds) {
  const ids = [...new Set((documentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return { files: [], sourceDocumentIds: [] };

  const files = [];
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
    files.push({ id: doc.id, name: doc.originalName || id, text });
    sourceDocumentIds.push(doc.id);
  }
  return { files, sourceDocumentIds };
}

export async function generateAssessment(userId, body) {
  const requestedIds = [
    ...(Array.isArray(body.documentIds) ? body.documentIds : []),
    ...(body.documentId ? [body.documentId] : []),
  ];
  let materialText = String(body.materialText || '').trim();
  let sourceDocumentIds = [];
  if (requestedIds.length) {
    const loaded = await loadOwnedMaterialFiles(userId, requestedIds);
    sourceDocumentIds = loaded.sourceDocumentIds;
    const topicHints = String(body.topicsInclude || '')
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
    const packed = packSourceMaterial(loaded.files, {
      topics: topicHints,
      totalBudget: 5500,
    });
    materialText = packed.materialText;
  } else if (materialText) {
    materialText = materialText.slice(0, 5500);
  }
  if (!materialText) {
    throw new AppError('Source material is required to generate an assessment.');
  }

  const count = Math.max(1, Math.min(Number(body.count || 10) || 10, 25));
  const difficulty = body.difficulty || 'Intermediate';
  const marksPerQuestion = Number(body.marksPerQuestion || 2) || 2;
  const questionTypes = (body.questionTypes || ['multiple-choice', 'true-false', 'short-answer']).slice(0, 4);
  const { data } = await completeJson(
    'Expert assessment designer. Return compact JSON only. Ground every question in the source.',
    `Create a ${body.kind || body.type || 'quiz'} with exactly ${count} questions (${difficulty}).

Source:
${materialText}

Types: ${questionTypes.join(', ')}
Marks/question: ${marksPerQuestion}
Total marks: ${body.totalMarks || count * marksPerQuestion}
Include topics: ${body.topicsInclude || 'any from source'}
Exclude topics: ${body.topicsExclude || 'none'}
Keep prompts short. Options only for multiple-choice/true-false. No long explanations.

JSON shape:
{"title":"","kind":"quiz","instructions":"","timeAllowed":"","totalMarks":0,"difficulty":"","questions":[{"id":"q1","type":"multiple-choice","prompt":"","options":["A","B","C","D"],"answer":"","marks":${marksPerQuestion}}]}`,
    [],
    {
      temperature: 0.3,
      maxOutputTokens: Math.min(4096, 700 + count * 160),
      timeout: 45000,
      retries: 0,
      preferredModels: [
        process.env.GEMINI_ASSESSMENT_MODEL,
        process.env.GEMINI_MODEL,
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
      ],
    },
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
      courseName: body.courseName || body.subjectName || '',
      courseCode: body.courseCode || '',
      institution: body.institution || '',
      timeAllowed: body.timeAllowed || data.timeAllowed || '',
    },
  });
  await notify(userId, {
    title: 'Assessment ready',
    message: saved.title || 'A new assessment was generated.',
    type: 'assessment',
  });
  return saved;
}
