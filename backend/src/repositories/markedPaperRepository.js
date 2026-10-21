import prisma from '../config/database.js';

export function create(data) {
  return prisma.markedPaper.create({ data });
}

export function listByUser(userId) {
  return prisma.markedPaper.findMany({
    where: { userId, deletedAt: null },
    orderBy: { markedAt: 'desc' },
  });
}

export function findByIdForUser(id, userId, { includeDeleted = false } = {}) {
  return prisma.markedPaper.findFirst({
    where: {
      id,
      userId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
  });
}

export function updateForUser(id, userId, data) {
  return prisma.markedPaper.updateMany({
    where: { id, userId, deletedAt: null },
    data,
  }).then(async (result) => {
    if (!result.count) return null;
    return prisma.markedPaper.findFirst({ where: { id, userId } });
  });
}

export function softDeleteForUser(id, userId) {
  return prisma.markedPaper.updateMany({
    where: { id, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export function hardDeleteForUser(id, userId) {
  return prisma.markedPaper.deleteMany({
    where: {
      id,
      userId,
      reviewStatus: { not: 'finalized' },
      deletedAt: null,
    },
  });
}

export function countByUser(userId) {
  return prisma.markedPaper.count({ where: { userId, deletedAt: null } });
}
