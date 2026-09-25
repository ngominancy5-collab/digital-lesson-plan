import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { completeJson } from './llm.js';

function mapQuiz(quiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    instructions: quiz.instructions || '',
    difficulty: quiz.difficulty,
    lessonPlanId: quiz.lessonPlanId,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: (quiz.questions || []).map((q) => ({
      id: q.id,
      question: q.question,
      questionType: q.questionType,
      marks: q.marks,
      correctAnswer: q.correctAnswer,
      options: (q.options || []).map((o) => ({
        id: o.id,
        optionText: o.optionText,
        optionLabel: o.optionLabel,
        isCorrect: o.isCorrect,
      })),
    })),
  };
}

export async function listQuizzes(userId) {
  const quizzes = await prisma.quiz.findMany({
    where: { userId },
    include: { questions: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return quizzes.map(mapQuiz);
}

export async function getQuiz(userId, id) {
  const quiz = await prisma.quiz.findFirst({
    where: { id, userId },
    include: { questions: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!quiz) throw new AppError('Quiz not found.', 404);
  return mapQuiz(quiz);
}

async function createQuizWithQuestions(userId, body) {
  const quiz = await prisma.quiz.create({
    data: {
      userId,
      lessonPlanId: body.lessonPlanId || null,
      title: String(body.title || 'Untitled quiz').trim(),
      instructions: body.instructions || '',
      difficulty: /easy/i.test(body.difficulty || '') ? 'Easy'
        : /pro/i.test(body.difficulty || '') ? 'Professional'
          : /adv/i.test(body.difficulty || '') ? 'Advanced'
            : 'Intermediate',
      questions: {
        create: (body.questions || []).map((q, index) => ({
          question: q.question || q.prompt || '',
          questionType: q.questionType || q.type || 'multiple-choice',
          marks: Number(q.marks || 1),
          correctAnswer: q.correctAnswer || q.answer || '',
          sortOrder: index,
          options: {
            create: (q.options || []).map((opt, optIndex) => {
              if (typeof opt === 'string') {
                return {
                  optionText: opt,
                  optionLabel: String.fromCharCode(65 + optIndex),
                  isCorrect: String(q.correctAnswer || q.answer || '') === opt,
                };
              }
              return {
                optionText: opt.optionText || opt.text || '',
                optionLabel: opt.optionLabel || String.fromCharCode(65 + optIndex),
                isCorrect: Boolean(opt.isCorrect),
              };
            }),
          },
        })),
      },
    },
    include: { questions: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return mapQuiz(quiz);
}

export async function createQuiz(userId, body) {
  return createQuizWithQuestions(userId, body);
}

export async function updateQuiz(userId, id, body) {
  const existing = await prisma.quiz.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Quiz not found.', 404);

  await prisma.quizOption.deleteMany({ where: { question: { quizId: id } } });
  await prisma.quizQuestion.deleteMany({ where: { quizId: id } });

  await prisma.quiz.update({
    where: { id },
    data: {
      title: body.title ?? existing.title,
      instructions: body.instructions ?? existing.instructions,
      difficulty: body.difficulty || existing.difficulty,
      lessonPlanId: body.lessonPlanId !== undefined ? body.lessonPlanId : existing.lessonPlanId,
    },
  });

  if (Array.isArray(body.questions)) {
    for (const [index, q] of body.questions.entries()) {
      await prisma.quizQuestion.create({
        data: {
          quizId: id,
          question: q.question || q.prompt || '',
          questionType: q.questionType || q.type || 'multiple-choice',
          marks: Number(q.marks || 1),
          correctAnswer: q.correctAnswer || q.answer || '',
          sortOrder: index,
          options: {
            create: (q.options || []).map((opt, optIndex) => (
              typeof opt === 'string'
                ? {
                  optionText: opt,
                  optionLabel: String.fromCharCode(65 + optIndex),
                  isCorrect: String(q.correctAnswer || q.answer || '') === opt,
                }
                : {
                  optionText: opt.optionText || opt.text || '',
                  optionLabel: opt.optionLabel || String.fromCharCode(65 + optIndex),
                  isCorrect: Boolean(opt.isCorrect),
                }
            )),
          },
        },
      });
    }
  }

  return getQuiz(userId, id);
}

export async function deleteQuiz(userId, id) {
  const existing = await prisma.quiz.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Quiz not found.', 404);
  await prisma.quiz.delete({ where: { id } });
  return { ok: true };
}

export async function generateQuiz(userId, body) {
  let materialText = body.materialText || '';
  if (body.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: body.documentId, userId } });
    if (doc?.extractedText) materialText = doc.extractedText;
  }
  if (body.lessonPlanId) {
    const plan = await prisma.lessonPlan.findFirst({ where: { id: body.lessonPlanId, userId } });
    if (plan) materialText += `\n\n${JSON.stringify(plan.lessons || []).slice(0, 6000)}`;
  }
  if (!String(materialText).trim()) {
    throw new AppError('Provide a document or lesson plan to generate a quiz from.');
  }

  const count = Number(body.count || 8);
  const { data } = await completeJson(
    'You are an expert quiz designer. Return JSON only.',
    `Create a quiz with ${count} questions at ${body.difficulty || 'Intermediate'} difficulty.

Source:
${String(materialText).slice(0, 12000)}

Return JSON:
{
  "title": "string",
  "instructions": "string",
  "difficulty": "Easy|Intermediate|Advanced|Professional",
  "questions": [
    {
      "question": "string",
      "questionType": "multiple-choice|true-false|short-answer",
      "marks": 1,
      "correctAnswer": "string",
      "options": ["A text","B text","C text","D text"]
    }
  ]
}`,
  );

  if (!data?.questions?.length) throw new AppError('AI could not generate the quiz.', 502);
  return createQuizWithQuestions(userId, {
    ...data,
    lessonPlanId: body.lessonPlanId || null,
  });
}
