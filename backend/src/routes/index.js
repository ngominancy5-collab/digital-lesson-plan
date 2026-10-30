import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { recordUsageAfterSuccess, requireUsageAllowance } from '../middleware/usageLimits.js';
import * as c from '../controllers/apiControllers.js';
import { exportAssessment, exportLessonPlan, exportQuiz } from '../controllers/workspaceController.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/', requireAuth, c.dashboard);

export const documentRoutes = Router();
documentRoutes.get('/', requireAuth, c.listDocuments);
documentRoutes.post(
  '/upload',
  requireAuth,
  requireUsageAllowance('upload'),
  upload.single('file'),
  recordUsageAfterSuccess('upload'),
  c.uploadDocument,
);
documentRoutes.delete('/:id', requireAuth, c.deleteDocument);

export const lessonPlanRoutes = Router();
lessonPlanRoutes.get('/', requireAuth, c.listLessonPlans);
lessonPlanRoutes.post('/', requireAuth, c.createLessonPlan);
lessonPlanRoutes.get('/:id/export', requireAuth, exportLessonPlan);
lessonPlanRoutes.get('/:id', requireAuth, c.getLessonPlan);
lessonPlanRoutes.put('/:id', requireAuth, c.updateLessonPlan);
lessonPlanRoutes.delete('/:id', requireAuth, c.deleteLessonPlan);
lessonPlanRoutes.post('/generate', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.generateLessonPlan);
lessonPlanRoutes.post('/regenerate', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.regenerateLesson);

export const assessmentRoutes = Router();
assessmentRoutes.get('/', requireAuth, c.listAssessments);
assessmentRoutes.post('/', requireAuth, c.createAssessment);
assessmentRoutes.get('/:id/export', requireAuth, exportAssessment);
assessmentRoutes.put('/:id', requireAuth, c.updateAssessment);
assessmentRoutes.delete('/:id', requireAuth, c.deleteAssessment);

export const quizRoutes = Router();
quizRoutes.get('/', requireAuth, c.listQuizzes);
quizRoutes.post('/', requireAuth, c.createQuiz);
quizRoutes.get('/:id/export', requireAuth, exportQuiz);
quizRoutes.get('/:id', requireAuth, c.getQuiz);
quizRoutes.put('/:id', requireAuth, c.updateQuiz);
quizRoutes.delete('/:id', requireAuth, c.deleteQuiz);

export const calendarRoutes = Router();
calendarRoutes.get('/', requireAuth, c.listCalendar);
calendarRoutes.post('/', requireAuth, c.createCalendar);
calendarRoutes.put('/:id', requireAuth, c.updateCalendar);
calendarRoutes.delete('/:id', requireAuth, c.deleteCalendar);

export const courseRoutes = Router();
courseRoutes.get('/', requireAuth, c.listCourses);
courseRoutes.post('/', requireAuth, c.createCourse);
courseRoutes.put('/:id', requireAuth, c.updateCourse);
courseRoutes.delete('/:id', requireAuth, c.deleteCourse);

export const aiRoutes = Router();
aiRoutes.get('/status', c.aiStatus);
aiRoutes.get('/conversations', requireAuth, c.listConversations);
aiRoutes.get('/conversations/:id', requireAuth, c.getConversation);
aiRoutes.post('/conversations', requireAuth, c.createConversation);
aiRoutes.post('/chat', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.chat);
aiRoutes.post('/chat/stream', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.chatStream);
aiRoutes.post('/extract', requireAuth, c.extractDocument);
aiRoutes.post('/analyze', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.analyzeDocument);
aiRoutes.post('/generate-lesson-plan', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.generateLessonPlan);
aiRoutes.post('/generate-quiz', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.generateQuiz);
aiRoutes.post('/generate-assessment', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.generateAssessment);
aiRoutes.post('/generate', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.generateAiContent);
aiRoutes.post('/mark-paper', requireAuth, requireUsageAllowance('ai'), recordUsageAfterSuccess('ai'), c.markPaper);
aiRoutes.post('/mark-paper/stream', requireAuth, requireUsageAllowance('ai'), c.markPaperStream);
