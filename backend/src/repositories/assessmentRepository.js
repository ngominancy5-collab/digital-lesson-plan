import prisma from '../config/database.js';

export function listByUser(userId) {
  return prisma.assessment.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
}

export function findOwned(userId, id) {
  return prisma.assessment.findFirst({ where: { id, userId } });
}

export function create(data) {
  return prisma.assessment.create({ data });
}

export function update(id, data) {
  return prisma.assessment.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.assessment.delete({ where: { id } });
}

export function countByUser(userId) {
  return prisma.assessment.count({ where: { userId } });
}

export function search(userId, query, take = 8) {
  return prisma.assessment.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

export function recentForUser(userId, take = 5) {
  return prisma.assessment.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take });
}
