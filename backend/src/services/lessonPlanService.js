import { AppError } from '../utils/errors.js';
import { mapLessonPlan } from '../utils/mappers.js';
import { generateLessonPlan as aiGenerateLessonPlan, regenerateLesson } from './ai/lessonPlanAi.js';
import { completeJson } from './ai/aiClient.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';
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
  const parts = notes ? [notes] : [];
  for (const documentId of documentIds) {
    const doc = await documentRepository.findOwned(userId, documentId);
    if (!doc) throw new AppError('Source document not found.', 404);
    const extracted = String(doc.extractedText || '').trim();
    if (!extracted) throw new AppError(`No readable text could be extracted from ${doc.originalName || 'that file'}.`, 422);
    parts.push(`Source file: ${doc.originalName || 'Uploaded file'}\n${extracted}`);
  }
  const materialText = parts.join('\n\n');
  const topics = (payload.topics || []).map((topic) => String(topic || '').trim()).filter(Boolean);
  if (!materialText && !topics.length) {
    throw new AppError('Add lesson notes, topics, or an uploaded file before generating a lesson plan.', 422);
  }

  let result;
  try {
    result = await aiGenerateLessonPlan({
      course: {
        courseName: payload.courseName,
        courseCode: payload.courseCode,
        programme: payload.programme,
        level: payload.level || payload.gradeLevel,
        department: payload.department,
        lecturer: payload.lecturer,
        semester: payload.semester,
        academicYear: payload.academicYear,
      },
      topics,
      schedule: {
        startDate: payload.startDate,
        endDate: payload.endDate,
        numberOfWeeks: payload.numberOfWeeks,
        lessonsPerWeek: payload.lessonsPerWeek,
        lessonDuration: payload.lessonDuration,
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
    subject: payload.courseName || '',
    topic: first.topic || (payload.topics || [])[0] || '',
    gradeLevel: payload.level || '',
    duration: payload.lessonDuration || first.duration || '',
    learningObjectives: first.learningObjectives || [],
    introduction: first.introduction || '',
    lessonActivities: first.studentActivities || first.teacherActivities || [],
    teachingMethods: first.teachingMethods || payload.teachingMethods || [],
    requiredMaterials: first.learningResources || [],
    assessmentMethod: first.assessmentMethod || '',
    conclusion: first.notes || '',
    difficulty: normalizeDifficulty(payload.difficulty),
    sourceDocumentId: payload.documentId || null,
    aiGenerated: true,
    status: 'Generated',
    courseName: result.courseName || payload.courseName,
    courseCode: result.courseCode || payload.courseCode,
    lessons: result.lessons || [],
    warnings: result.warnings || [],
    meta: { schedule: payload },
  });
  await recordActivity({
    userId,
    type: 'ai.lesson_plan',
    summary: 'AI lesson plan generated',
    targetType: 'lessonPlan',
    targetId: plan.id,
    meta: { title: plan.title },
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
