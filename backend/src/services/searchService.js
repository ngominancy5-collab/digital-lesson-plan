import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as assessmentRepository from '../repositories/assessmentRepository.js';
import * as quizRepository from '../repositories/quizRepository.js';
import * as calendarRepository from '../repositories/calendarRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';
import * as courseRepository from '../repositories/courseRepository.js';
import * as userRepository from '../repositories/userRepository.js';

function mapWorkspaceResults({ lessonPlans, assessments, quizzes, calendar, resources, courses, users = [] }) {
  return {
    lessonPlans: lessonPlans.map((item) => ({
      id: item.id,
      title: item.title || item.courseName,
      subtitle: [item.courseCode || item.subject, item.user?.fullName].filter(Boolean).join(' · ') || '',
    })),
    assessments: assessments.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: [item.type, item.user?.fullName].filter(Boolean).join(' · ') || '',
    })),
    quizzes: quizzes.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: [item.difficulty, item.user?.fullName].filter(Boolean).join(' · ') || '',
    })),
    calendar: calendar.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.date || '',
    })),
    resources: resources.map((item) => ({
      id: item.id,
      title: item.courseName || item.originalName,
      subtitle: item.courseCode || item.fileType || '',
    })),
    courses: courses.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: item.code || '',
    })),
    users: users.map((item) => ({
      id: item.id,
      title: item.fullName || item.email,
      subtitle: [item.email, item.role, item.profile?.institution].filter(Boolean).join(' · '),
    })),
  };
}

async function searchAdminWorkspace(query) {
  const [lessonPlans, assessments, quizzes, users] = await Promise.all([
    prisma.lessonPlan.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { subject: { contains: query, mode: 'insensitive' } },
          { topic: { contains: query, mode: 'insensitive' } },
          { courseName: { contains: query, mode: 'insensitive' } },
          { courseCode: { contains: query, mode: 'insensitive' } },
          { user: { fullName: { contains: query, mode: 'insensitive' } } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.assessment.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { user: { fullName: { contains: query, mode: 'insensitive' } } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.quiz.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { user: { fullName: { contains: query, mode: 'insensitive' } } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    userRepository.searchUsers(query, 8),
  ]);

  return mapWorkspaceResults({
    lessonPlans,
    assessments,
    quizzes,
    calendar: [],
    resources: [],
    courses: [],
    users,
  });
}

export async function searchWorkspace(userId, rawQuery, role = '') {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) throw new AppError('Enter at least 2 characters to search.');

  if (String(role || '').toLowerCase() === 'admin') {
    return searchAdminWorkspace(query);
  }

  const [lessonPlans, assessments, quizzes, calendar, resources, courses] = await Promise.all([
    lessonPlanRepository.search(userId, query),
    assessmentRepository.search(userId, query),
    quizRepository.search(userId, query),
    calendarRepository.search(userId, query),
    documentRepository.search(userId, query),
    courseRepository.search(userId, query),
  ]);
  return mapWorkspaceResults({
    lessonPlans,
    assessments,
    quizzes,
    calendar,
    resources,
    courses,
  });
}
