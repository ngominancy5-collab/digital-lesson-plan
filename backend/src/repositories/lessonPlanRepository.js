import prisma from '../config/database.js';

export function listByUser(userId) {
  return prisma.lessonPlan.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
}

export function findOwned(userId, id) {
  return prisma.lessonPlan.findFirst({ where: { id, userId } });
}

export function create(data) {
  return prisma.lessonPlan.create({ data });
}

export function update(id, data) {
  return prisma.lessonPlan.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.lessonPlan.delete({ where: { id } });
}

export function countByUser(userId, where = {}) {
  return prisma.lessonPlan.count({ where: { userId, ...where } });
}

export function recentForUser(userId, take = 5) {
  return prisma.lessonPlan.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take });
}

export function search(userId, query, take = 8) {
  return prisma.lessonPlan.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { courseName: { contains: query, mode: 'insensitive' } },
        { subject: { contains: query, mode: 'insensitive' } },
        { topic: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

export function titlesForUser(userId, take = 20) {
  return prisma.lessonPlan.findMany({ where: { userId }, select: { id: true, title: true }, take });
}
