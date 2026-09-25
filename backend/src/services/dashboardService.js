import prisma from '../config/database.js';
import { mapAssessment, mapCalendarEvent, mapLessonPlan } from '../utils/mappers.js';

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
    prisma.lessonPlan.count({ where: { userId } }),
    prisma.quiz.count({ where: { userId } }),
    prisma.assessment.count({ where: { userId } }),
    prisma.document.count({ where: { userId } }),
    prisma.lessonPlan.count({ where: { userId, aiGenerated: true } }),
    prisma.lessonPlan.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.assessment.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.calendarEvent.findMany({
      where: { userId, startAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      orderBy: { startAt: 'asc' },
      take: 8,
    }),
    prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        originalName: true,
        fileType: true,
        status: true,
        createdAt: true,
      },
    }),
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
