import prisma from '../config/database.js';

export function findByUser(userId) {
  return prisma.notificationPreference.findUnique({ where: { userId } });
}

export function upsert(userId, data) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
