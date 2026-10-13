import prisma from '../config/database.js';

export function create(data) {
  return prisma.notification.create({ data });
}

export function latestByType(userId, type) {
  return prisma.notification.findFirst({
    where: { userId, type },
    orderBy: { createdAt: 'desc' },
  });
}

export function listByUser(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
}

export function countUnread(userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export function markRead(userId, id) {
  return prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true },
  });
}

export function markAllRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
