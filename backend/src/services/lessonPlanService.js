import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { mapLessonPlan } from '../utils/mappers.js';
import { generateLessonPlan as aiGenerateLessonPlan, regenerateLesson } from './lessonPlanAi.js';
import { completeJson } from './llm.js';

function normalizeDifficulty(value) {
  const v = String(value || 'Intermediate');
  if (/easy/i.test(v)) return 'Easy';
  if (/pro/i.test(v)) return 'Professional';
  if (/adv/i.test(v)) return 'Advanced';
  return 'Intermediate';
}

export async function listLessonPlans(userId) {
  const plans = await prisma.lessonPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return plans.map(mapLessonPlan);
}

export async function getLessonPlan(userId, id) {
  const plan = await prisma.lessonPlan.findFirst({ where: { id, userId } });
  if (!plan) throw new AppError('Lesson plan not found.', 404);
  return mapLessonPlan(plan);
}

export async function createLessonPlan(userId, body) {
  const title = String(body.title || body.courseName || 'Untitled lesson plan').trim();
  const plan = await prisma.lessonPlan.create({
    data: {
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
    },
  });
  return mapLessonPlan(plan);
}

export async function updateLessonPlan(userId, id, body) {
  const existing = await prisma.lessonPlan.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Lesson plan not found.', 404);

  const plan = await prisma.lessonPlan.update({
    where: { id },
    data: {
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
    },
  });
  return mapLessonPlan(plan);
}

export async function deleteLessonPlan(userId, id) {
  const existing = await prisma.lessonPlan.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Lesson plan not found.', 404);
  await prisma.lessonPlan.delete({ where: { id } });
  return { ok: true };
}

export async function generateAndSaveLessonPlan(userId, payload) {
  let materialText = payload.materialText || '';
  if (payload.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: payload.documentId, userId } });
    if (!doc) throw new AppError('Source document not found.', 404);
    materialText = doc.extractedText || materialText;
  }

  const result = await aiGenerateLessonPlan({
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
    topics: payload.topics || [],
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
    customInstructions: [
      payload.customInstructions || '',
      materialText ? `Use this uploaded material as the primary source:\n${String(materialText).slice(0, 12000)}` : '',
    ].filter(Boolean).join('\n\n'),
    difficulty: payload.difficulty || 'Intermediate',
  });

  const first = result.lessons?.[0] || {};
  const plan = await prisma.lessonPlan.create({
    data: {
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
    },
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
    const doc = await prisma.document.findFirst({ where: { id: documentId, userId } });
    if (doc?.extractedText) context += `\nDocument:\n${doc.extractedText.slice(0, 10000)}`;
  }
  if (lessonPlanId) {
    const plan = await prisma.lessonPlan.findFirst({ where: { id: lessonPlanId, userId } });
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
