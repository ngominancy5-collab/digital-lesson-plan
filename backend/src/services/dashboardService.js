import { mapAssessment, mapCalendarEvent, mapLessonPlan } from '../utils/mappers.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as quizRepository from '../repositories/quizRepository.js';
import * as assessmentRepository from '../repositories/assessmentRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';
import * as calendarRepository from '../repositories/calendarRepository.js';

export async function getDashboard(userId) {
  const [
    lessonPlanCount,
    quizCount,
    assessmentCount,
    documentCount,
    aiGeneratedCount,
    recentPlans,
    recentAssessments,
    upcomingEvents,
    recentDocuments,
  ] = await Promise.all([
    lessonPlanRepository.countByUser(userId),
    quizRepository.countByUser(userId),
    assessmentRepository.countByUser(userId),
    documentRepository.countByUser(userId),
    lessonPlanRepository.countByUser(userId, { aiGenerated: true }),
    lessonPlanRepository.recentForUser(userId),
    assessmentRepository.recentForUser(userId),
    calendarRepository.upcomingForUser(userId),
    documentRepository.recentForUser(userId),
  ]);

  return {
    stats: {
      lessonPlans: lessonPlanCount,
      quizzes: quizCount,
      assessments: assessmentCount,
      documents: documentCount,
      aiGenerated: aiGeneratedCount,
    },
    recentLessonPlans: recentPlans.map(mapLessonPlan),
    recentAssessments: recentAssessments.map(mapAssessment),
    upcomingEvents: upcomingEvents.map(mapCalendarEvent),
    recentDocuments,
  };
}
