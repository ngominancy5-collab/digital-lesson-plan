import prisma from '../config/database.js';

const withQuestions = {
  include: { questions: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
};

export function listByUser(userId) {
  return prisma.quiz.findMany({
    where: { userId },
    ...withQuestions,
    orderBy: { createdAt: 'desc' },
  });
}

export function findOwned(userId, id, includeQuestions = false) {
  return prisma.quiz.findFirst({
    where: { id, userId },
    ...(includeQuestions ? withQuestions : {}),
  });
}

export function createWithQuestions(data) {
  return prisma.quiz.create({ data, ...withQuestions });
}

export function updateQuiz(id, data) {
  return prisma.quiz.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.quiz.delete({ where: { id } });
}

export function clearQuestions(quizId) {
  return prisma.$transaction([
    prisma.quizOption.deleteMany({ where: { question: { quizId } } }),
    prisma.quizQuestion.deleteMany({ where: { quizId } }),
  ]);
}

export function addQuestion(data) {
  return prisma.quizQuestion.create({ data });
}

export function search(userId, query, take = 8) {
  return prisma.quiz.findMany({
    where: { userId, title: { contains: query, mode: 'insensitive' } },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

export function countByUser(userId) {
  return prisma.quiz.count({ where: { userId } });
}
