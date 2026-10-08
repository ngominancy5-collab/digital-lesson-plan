import * as attendanceRepository from '../repositories/attendanceRepository.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as assessmentRepository from '../repositories/assessmentRepository.js';
import * as quizRepository from '../repositories/quizRepository.js';
import * as markedPaperRepository from '../repositories/markedPaperRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';

export async function getReport(userId) {
  const [history, lessonPlans, assessments, quizzes, papersMarked, resources] = await Promise.all([
    attendanceRepository.listByUser(userId),
    lessonPlanRepository.countByUser(userId),
    assessmentRepository.countByUser(userId),
    quizRepository.countByUser(userId),
    markedPaperRepository.countByUser(userId),
    documentRepository.countByUser(userId),
  ]);
  const completed = history.filter((item) => item.status === 'completed');
  const daysPresent = new Set(history.map((item) => item.date)).size;
  const totalMinutes = completed.reduce((sum, item) => sum + Number(item.workedMinutes || 0), 0);
  return {
    daysPresent,
    clockInCount: history.length,
    clockOutCount: completed.length,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    lessonPlans,
    assessments,
    quizzes,
    papersMarked,
    resources,
    attendance: history.slice(0, 30),
  };
}
