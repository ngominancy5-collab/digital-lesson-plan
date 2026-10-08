import prisma from '../config/database.js';

export function listByUser(userId) {
  return prisma.calendarEvent.findMany({ where: { userId }, orderBy: { startAt: 'asc' } });
}

export function findOwned(userId, id) {
  return prisma.calendarEvent.findFirst({ where: { id, userId } });
}

export function create(data) {
  return prisma.calendarEvent.create({ data });
}

export function update(id, data) {
  return prisma.calendarEvent.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.calendarEvent.delete({ where: { id } });
}

export function clearManual(userId) {
  return prisma.calendarEvent.deleteMany({ where: { userId, source: { in: ['manual', 'suggested'] } } });
}

export function search(userId, query, take = 8) {
  return prisma.calendarEvent.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { startAt: 'asc' },
    take,
  });
}

export function upcomingForUser(userId, take = 8) {
  return prisma.calendarEvent.findMany({
    where: { userId, startAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    orderBy: { startAt: 'asc' },
    take,
  });
}
