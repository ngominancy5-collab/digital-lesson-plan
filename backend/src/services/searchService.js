import { AppError } from '../utils/errors.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as assessmentRepository from '../repositories/assessmentRepository.js';
import * as quizRepository from '../repositories/quizRepository.js';
import * as calendarRepository from '../repositories/calendarRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';
import * as courseRepository from '../repositories/courseRepository.js';

export async function searchWorkspace(userId, rawQuery) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) throw new AppError('Enter at least 2 characters to search.');
  const [lessonPlans, assessments, quizzes, calendar, resources, courses] = await Promise.all([
    lessonPlanRepository.search(userId, query),
    assessmentRepository.search(userId, query),
    quizRepository.search(userId, query),
    calendarRepository.search(userId, query),
    documentRepository.search(userId, query),
    courseRepository.search(userId, query),
  ]);
  return {
    lessonPlans: lessonPlans.map((item) => ({
      id: item.id,
      title: item.title || item.courseName,
      subtitle: item.courseCode || item.subject || '',
    })),
    assessments: assessments.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.type || '',
    })),
    quizzes: quizzes.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.difficulty || '',
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
  };
}
