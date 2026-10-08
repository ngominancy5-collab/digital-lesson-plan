import prisma from '../config/database.js';

export function findOpen(userId) {
  return prisma.attendance.findFirst({
    where: { userId, status: 'open' },
    orderBy: { clockIn: 'desc' },
  });
}

export function create(data) {
  return prisma.attendance.create({ data });
}

export function update(id, data) {
  return prisma.attendance.update({ where: { id }, data });
}

export function listByUser(userId) {
  return prisma.attendance.findMany({
    where: { userId },
    orderBy: { clockIn: 'desc' },
  });
}
