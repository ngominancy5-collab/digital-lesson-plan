import prisma from '../config/database.js';

export function listBySection(sectionKey, { activeOnly = false } = {}) {
  return prisma.siteImage.findMany({
    where: {
      sectionKey,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export function listAll() {
  return prisma.siteImage.findMany({
    orderBy: [{ sectionKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export function findById(id) {
  return prisma.siteImage.findUnique({ where: { id } });
}

export function create(data) {
  return prisma.siteImage.create({ data });
}

export function update(id, data) {
  return prisma.siteImage.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.siteImage.delete({ where: { id } });
}
