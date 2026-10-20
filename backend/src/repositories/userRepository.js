import prisma from '../config/database.js';

const withProfile = { include: { profile: true } };

export function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export function findByEmailWithProfile(email) {
  return prisma.user.findUnique({ where: { email }, ...withProfile });
}

export function findByUsername(username) {
  return prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });
}

export function findByUsernameWithProfile(username) {
  return prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    ...withProfile,
  });
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

export function remove(id) {
  return prisma.user.delete({ where: { id } });
}

export function listWithProfiles() {
  return prisma.user.findMany({ ...withProfile, orderBy: { createdAt: 'desc' } });
}

export function countByRole(role) {
  return prisma.user.count({ where: { role } });
}
