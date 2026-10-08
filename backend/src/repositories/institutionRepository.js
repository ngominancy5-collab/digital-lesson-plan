import prisma from '../config/database.js';

export function count() {
  return prisma.institution.count();
}

export function list(type) {
  return prisma.institution.findMany({
    where: type ? { type } : {},
    orderBy: { name: 'asc' },
  });
}

export function findByName(name) {
  return prisma.institution.findFirst({
    where: { name: { equals: String(name || '').trim(), mode: 'insensitive' } },
  });
}

export function createMany(rows) {
  return prisma.institution.createMany({ data: rows, skipDuplicates: true });
}
