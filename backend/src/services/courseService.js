import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';

export async function listCourses(userId) {
  return prisma.course.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getCourse(userId, id) {
  const course = await prisma.course.findFirst({ where: { id, userId } });
  if (!course) throw new AppError('Course not found.', 404);
  return course;
}

export async function createCourse(userId, body) {
  return prisma.course.create({
    data: {
      userId,
      name: String(body.name || 'Untitled course').trim(),
      code: body.code || '',
      description: body.description || '',
      fileName: body.fileName || '',
      semester: body.semester || '',
      duration: body.duration || '',
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      modules: body.modules || [],
      meta: {
        assessments: body.assessments || [],
        ...(body.meta || {}),
      },
    },
  });
}

export async function updateCourse(userId, id, body) {
  const existing = await prisma.course.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Course not found.', 404);
  return prisma.course.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      code: body.code ?? existing.code,
      description: body.description ?? existing.description,
      fileName: body.fileName ?? existing.fileName,
      semester: body.semester ?? existing.semester,
      duration: body.duration ?? existing.duration,
      startDate: body.startDate ?? existing.startDate,
      endDate: body.endDate ?? existing.endDate,
      modules: body.modules ?? existing.modules,
      meta: body.meta ?? existing.meta,
    },
  });
}

export async function deleteCourse(userId, id) {
  const existing = await prisma.course.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Course not found.', 404);
  await prisma.course.delete({ where: { id } });
  return { ok: true };
}
