import prisma from '../config/database.js';

export function create({ userId, tokenHash, expiresAt }) {
  return prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
}

export function invalidateOpen(userId) {
  return prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}

export function remove(id) {
  return prisma.passwordResetToken.delete({ where: { id } });
}

export function findByHash(tokenHash) {
  return prisma.passwordResetToken.findFirst({ where: { tokenHash }, orderBy: { createdAt: 'desc' } });
}

export function findValid(tokenHash) {
  return prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
}

export function markUsedAndUpdatePassword(recordId, userId, passwordHash) {
  return prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: recordId }, data: { usedAt: new Date() } }),
  ]);
}
