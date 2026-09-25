import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import * as c from '../controllers/apiControllers.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/', requireAuth, c.dashboard);

export const documentRoutes = Router();
documentRoutes.get('/', requireAuth, c.listDocuments);
documentRoutes.post('/upload', requireAuth, upload.single('file'), c.uploadDocument);
documentRoutes.delete('/:id', requireAuth, c.deleteDocument);

export const lessonPlanRoutes = Router();
lessonPlanRoutes.get('/', requireAuth, c.listLessonPlans);
lessonPlanRoutes.post('/', requireAuth, c.createLessonPlan);
lessonPlanRoutes.get('/:id', requireAuth, c.getLessonPlan);
lessonPlanRoutes.put('/:id', requireAuth, c.updateLessonPlan);
lessonPlanRoutes.delete('/:id', requireAuth, c.deleteLessonPlan);
lessonPlanRoutes.post('/generate', requireAuth, c.generateLessonPlan);
lessonPlanRoutes.post('/regenerate', requireAuth, c.regenerateLesson);

export const assessmentRoutes = Router();
assessmentRoutes.get('/', requireAuth, c.listAssessments);
assessmentRoutes.post('/', requireAuth, c.createAssessment);
assessmentRoutes.put('/:id', requireAuth, c.updateAssessment);
assessmentRoutes.delete('/:id', requireAuth, c.deleteAssessment);

export const quizRoutes = Router();
quizRoutes.get('/', requireAuth, c.listQuizzes);
quizRoutes.post('/', requireAuth, c.createQuiz);
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
aiRoutes.post('/chat', requireAuth, c.chat);
aiRoutes.post('/chat/stream', requireAuth, c.chatStream);
aiRoutes.post('/extract', requireAuth, c.extractDocument);
aiRoutes.post('/analyze', requireAuth, c.analyzeDocument);
aiRoutes.post('/generate-lesson-plan', requireAuth, c.generateLessonPlan);
aiRoutes.post('/generate-quiz', requireAuth, c.generateQuiz);
aiRoutes.post('/generate-assessment', requireAuth, c.generateAssessment);
aiRoutes.post('/generate', requireAuth, c.generateAiContent);
aiRoutes.post('/mark-paper', requireAuth, c.markPaper);
