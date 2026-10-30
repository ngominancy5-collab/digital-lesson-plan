import { AppError } from '../utils/errors.js';
import { mapLessonPlan } from '../utils/mappers.js';
import { generateLessonPlan as aiGenerateLessonPlan, regenerateLesson } from './ai/lessonPlanAi.js';
import { completeJson } from './ai/aiClient.js';
import { deriveTopicsFromMaterial, packSourceMaterial } from './ai/sourceMaterialPacker.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { recordActivity } from './activityService.js';

function normalizeDifficulty(value) {
  const v = String(value || 'Intermediate');
  if (/easy/i.test(v)) return 'Easy';
  if (/pro/i.test(v)) return 'Professional';
  if (/adv/i.test(v)) return 'Advanced';
  return 'Intermediate';
}

export async function listLessonPlans(userId) {
  const plans = await lessonPlanRepository.listByUser(userId);
  return plans.map(mapLessonPlan);
}

export async function getLessonPlan(userId, id) {
  const plan = await lessonPlanRepository.findOwned(userId, id);
  if (!plan) throw new AppError('Lesson plan not found.', 404);
  return mapLessonPlan(plan);
}

export async function createLessonPlan(userId, body) {
  const title = String(body.title || body.courseName || 'Untitled lesson plan').trim();
  const plan = await lessonPlanRepository.create({
      userId,
      title,
      subject: body.subject || body.courseName || '',
      topic: body.topic || '',
      gradeLevel: body.gradeLevel || body.level || '',
      duration: body.duration || body.lessonDuration || '',
      learningObjectives: body.learningObjectives || [],
      introduction: body.introduction || '',
      lessonActivities: body.lessonActivities || body.activities || [],
      teachingMethods: body.teachingMethods || [],
      requiredMaterials: body.requiredMaterials || body.materials || [],
      assessmentMethod: body.assessmentMethod || '',
      conclusion: body.conclusion || '',
      difficulty: normalizeDifficulty(body.difficulty),
      sourceDocumentId: body.sourceDocumentId || null,
      aiGenerated: Boolean(body.aiGenerated),
      status: body.status || 'saved',
      courseName: body.courseName || title,
      courseCode: body.courseCode || '',
      lessons: body.lessons || [],
      warnings: body.warnings || [],
      meta: body.meta || {},
  });
  await recordActivity({
    userId,
    type: plan.aiGenerated ? 'ai.lesson_plan' : 'lesson.created',
    summary: plan.aiGenerated ? 'AI lesson plan saved' : 'Lesson plan saved',
    targetType: 'lessonPlan',
    targetId: plan.id,
    meta: { title: plan.title },
  });
  return mapLessonPlan(plan);
}

export async function updateLessonPlan(userId, id, body) {
  const existing = await lessonPlanRepository.findOwned(userId, id);
  if (!existing) throw new AppError('Lesson plan not found.', 404);

  const plan = await lessonPlanRepository.update(id, {
      title: body.title ?? existing.title,
      subject: body.subject ?? existing.subject,
      topic: body.topic ?? existing.topic,
      gradeLevel: body.gradeLevel ?? existing.gradeLevel,
      duration: body.duration ?? existing.duration,
      learningObjectives: body.learningObjectives ?? existing.learningObjectives,
      introduction: body.introduction ?? existing.introduction,
      lessonActivities: body.lessonActivities ?? body.activities ?? existing.lessonActivities,
      teachingMethods: body.teachingMethods ?? existing.teachingMethods,
      requiredMaterials: body.requiredMaterials ?? existing.requiredMaterials,
      assessmentMethod: body.assessmentMethod ?? existing.assessmentMethod,
      conclusion: body.conclusion ?? existing.conclusion,
      difficulty: body.difficulty ? normalizeDifficulty(body.difficulty) : existing.difficulty,
      status: body.status ?? existing.status,
      courseName: body.courseName ?? existing.courseName,
      courseCode: body.courseCode ?? existing.courseCode,
      lessons: body.lessons ?? existing.lessons,
      warnings: body.warnings ?? existing.warnings,
      meta: body.meta ?? existing.meta,
  });
  await recordActivity({
    userId,
    type: 'lesson.updated',
    summary: 'Lesson plan updated',
    targetType: 'lessonPlan',
    targetId: plan.id,
    meta: { title: plan.title },
  });
  return mapLessonPlan(plan);
}

export async function deleteLessonPlan(userId, id) {
  const existing = await lessonPlanRepository.findOwned(userId, id);
  if (!existing) throw new AppError('Lesson plan not found.', 404);
  await lessonPlanRepository.remove(id);
  return { ok: true };
}

export async function generateAndSaveLessonPlan(userId, payload) {
  const notes = String(payload.lessonNotes || payload.materialText || '').trim();
  const documentIds = [...new Set([
    ...(Array.isArray(payload.documentIds) ? payload.documentIds : []),
    payload.documentId,
  ].filter(Boolean))];

  const docs = documentIds.length
    ? await documentRepository.findOwnedMany(userId, documentIds)
    : [];
  if (documentIds.length && docs.length !== documentIds.length) {
    throw new AppError('Source document not found.', 404);
  }

  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const files = [];
  for (const documentId of documentIds) {
    const doc = byId.get(documentId);
    const extracted = String(doc?.extractedText || '').trim();
    if (!extracted) {
      throw new AppError(`No readable text could be extracted from ${doc?.originalName || 'that file'}.`, 422);
    }
    files.push({
      id: doc.id,
      name: doc.originalName || 'Uploaded file',
      text: extracted,
    });
  }

  const topicHints = (payload.topics || []).map((topic) => String(topic || '').trim()).filter(Boolean);
  const packed = packSourceMaterial(files, {
    topics: topicHints,
    notes,
    totalBudget: files.length > 3 ? 7500 : files.length > 1 ? 8500 : 9000,
  });
  const materialText = packed.materialText;
  let topics = topicHints;
  if (!topics.length) {
    topics = deriveTopicsFromMaterial(materialText);
  }
  if (!materialText && !topics.length) {
    throw new AppError('Add lesson notes, topics, or an uploaded file before generating a lesson plan.', 422);
  }

  // Prefer fewer, richer sessions when the client did not specify a schedule.
  const weeks = Math.max(1, Math.min(Number(payload.numberOfWeeks) || 2, 6));
  const lessonsPerWeek = Math.max(1, Math.min(Number(payload.lessonsPerWeek) || 2, 3));

  let profile = {};
  try {
    const user = await userRepository.findByIdWithProfile(userId);
    profile = user?.profile || {};
    if (!payload.lecturer && user?.fullName) payload.lecturer = user.fullName;
  } catch {
    profile = {};
  }

  let result;
  try {
    result = await aiGenerateLessonPlan({
      course: {
        institution: payload.institution || profile.institution || '',
        courseName: payload.courseName,
        courseCode: payload.courseCode,
        programme: payload.programme,
        level: payload.level || payload.gradeLevel || profile.educationLevel || '',
        department: payload.department || profile.department || '',
        lecturer: payload.lecturer || '',
        semester: payload.semester,
        academicYear: payload.academicYear,
      },
      topics,
      schedule: {
        startDate: payload.startDate,
        endDate: payload.endDate,
        numberOfWeeks: weeks,
        lessonsPerWeek,
        lessonDuration: payload.lessonDuration || '60 minutes',
        holidays: payload.holidays || [],
      },
      preferences: {
        teachingMethods: payload.teachingMethods || [],
        learningActivities: payload.learningActivities || [],
      },
      customInstructions: payload.customInstructions || '',
      sourceMaterial: materialText,
      difficulty: payload.difficulty || 'Intermediate',
    });
  } catch (error) {
    await recordActivity({
      userId,
      type: 'ai.lesson_plan',
      outcome: 'failed',
      summary: 'Lesson plan generation failed',
      meta: { category: String(error.status || 'error') },
    });
    throw error;
  }

  const first = result.lessons?.[0] || {};
  const plan = await lessonPlanRepository.create({
    userId,
    title: result.courseName || payload.courseName || 'Generated lesson plan',
    subject: payload.courseName || first.subject || '',
    topic: first.topic || topics[0] || '',
    gradeLevel: payload.level || first.level || '',
    duration: payload.lessonDuration || first.duration || '',
    learningObjectives: first.learningObjectives || [],
    introduction: first.introduction || first.procedure?.[0]?.content || '',
    lessonActivities: first.studentActivities || first.teacherActivities || [],
    teachingMethods: first.teachingMethods || payload.teachingMethods || [],
    requiredMaterials: first.learningResources || [],
    assessmentMethod: first.assessmentMethod || (first.assessmentMethods || []).join('; '),
    conclusion: first.conclusion || first.homework || first.notes || '',
    difficulty: normalizeDifficulty(payload.difficulty),
    sourceDocumentId: payload.documentId || documentIds[0] || null,
    aiGenerated: true,
    status: 'Generated',
    courseName: result.courseName || payload.courseName,
    courseCode: result.courseCode || payload.courseCode,
    lessons: result.lessons || [],
    warnings: result.warnings || [],
    meta: {
      schedule: { ...payload, numberOfWeeks: weeks, lessonsPerWeek },
      institution: result.institution || payload.institution || profile.institution || '',
      sourcePack: {
        fileCount: packed.fileCount,
        usedChars: packed.usedChars,
        fromCache: packed.fromCache,
      },
      structureVersion: 2,
    },
  });
  await recordActivity({
    userId,
    type: 'ai.lesson_plan',
    summary: 'AI lesson plan generated',
    targetType: 'lessonPlan',
    targetId: plan.id,
    meta: { title: plan.title, usedChars: packed.usedChars, fromCache: packed.fromCache },
  });
  return mapLessonPlan(plan);
}

export async function regenerateLessonContent(payload) {
  const lesson = await regenerateLesson(payload);
  return { lesson };
}

export async function generateFocusedContent(userId, { type, difficulty, documentId, lessonPlanId, prompt }) {
  let context = '';
  if (documentId) {
    const doc = await documentRepository.findOwned(userId, documentId);
    if (doc?.extractedText) context += `\nDocument:\n${doc.extractedText.slice(0, 10000)}`;
  }
  if (lessonPlanId) {
    const plan = await lessonPlanRepository.findOwned(userId, lessonPlanId);
    if (plan) context += `\nLesson plan:\n${JSON.stringify(mapLessonPlan(plan)).slice(0, 8000)}`;
  }

  const level = normalizeDifficulty(difficulty);
  const { data } = await completeJson(
    'You are an expert education assistant. Return valid JSON only.',
    `Generate ${type || 'teaching suggestions'} at ${level} level.
User request: ${prompt || 'Create useful classroom content.'}
${context}

Return JSON with keys appropriate for the content type (e.g. objectives, activities, questions, summary, suggestions).`,
  );
  return data || { error: 'AI generation failed.' };
}
