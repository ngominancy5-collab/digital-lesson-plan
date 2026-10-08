import prisma from '../config/database.js';

export function listByUser(userId) {
  return prisma.course.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
}

export function findOwned(userId, id) {
  return prisma.course.findFirst({ where: { id, userId } });
}

export function create(data) {
  return prisma.course.create({ data });
}

export function update(id, data) {
  return prisma.course.update({ where: { id }, data });
}

export function search(userId, query, take = 8) {
  return prisma.course.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { code: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

export function remove(id) {
  return prisma.course.delete({ where: { id } });
}
