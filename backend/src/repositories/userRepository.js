import prisma from '../config/database.js';

const withProfile = { include: { profile: true } };

export function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export function findByEmailWithProfile(email) {
  return prisma.user.findUnique({ where: { email }, ...withProfile });
}

export function findByIdWithProfile(id) {
  return prisma.user.findUnique({ where: { id }, ...withProfile });
}

export function findOtherByEmail(email, userId) {
  return prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
}

export function createWithProfile(data) {
  return prisma.user.create({ data, ...withProfile });
}

export function updateWithProfile(id, data) {
  return prisma.user.update({ where: { id }, data, ...withProfile });
}

export function updatePassword(id, passwordHash) {
  return prisma.user.update({ where: { id }, data: { passwordHash } });
}
