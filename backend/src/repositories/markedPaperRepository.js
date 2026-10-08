import prisma from '../config/database.js';

export function create(data) {
  return prisma.markedPaper.create({ data });
}

export function listByUser(userId) {
  return prisma.markedPaper.findMany({
    where: { userId },
    orderBy: { markedAt: 'desc' },
  });
}

export function countByUser(userId) {
  return prisma.markedPaper.count({ where: { userId } });
}
