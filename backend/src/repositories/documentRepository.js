import prisma from '../config/database.js';

const listSelect = {
  id: true,
  originalName: true,
  fileType: true,
  fileSize: true,
  storageUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

export function listByUser(userId) {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: listSelect,
  });
}

export function findOwned(userId, id) {
  return prisma.document.findFirst({ where: { id, userId } });
}

export function findOwnedMany(userId, ids = []) {
  const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!unique.length) return Promise.resolve([]);
  return prisma.document.findMany({
    where: { userId, id: { in: unique } },
  });
}

export function create(data) {
  return prisma.document.create({ data });
}

export function update(id, data) {
  return prisma.document.update({ where: { id }, data });
}

export function remove(id) {
  return prisma.document.delete({ where: { id } });
}

export function recentForUser(userId, take = 5) {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, originalName: true, fileType: true, status: true, createdAt: true },
  });
}

export function countByUser(userId) {
  return prisma.document.count({ where: { userId } });
}

const resourceSelect = {
  id: true,
  originalName: true,
  fileType: true,
  fileSize: true,
  storageUrl: true,
  status: true,
  courseName: true,
  courseCode: true,
  description: true,
  topics: true,
  objectives: true,
  createdAt: true,
  updatedAt: true,
};

export function listResources(userId) {
  return prisma.document.findMany({
    where: { userId, status: 'ready' },
    orderBy: { createdAt: 'desc' },
    select: resourceSelect,
  });
}

export function search(userId, query, take = 8) {
  return prisma.document.findMany({
    where: {
      userId,
      status: 'ready',
      OR: [
        { originalName: { contains: query, mode: 'insensitive' } },
        { courseName: { contains: query, mode: 'insensitive' } },
        { courseCode: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: resourceSelect,
  });
}

export function titlesForUser(userId, take = 20) {
  return prisma.document.findMany({
    where: { userId },
    select: { id: true, originalName: true },
    take,
  });
}
