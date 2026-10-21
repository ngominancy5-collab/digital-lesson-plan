import { asyncHandler } from '../utils/errors.js';
import * as documentService from '../services/documentService.js';
import * as lessonPlanService from '../services/lessonPlanService.js';
import * as assessmentService from '../services/assessmentService.js';
import * as quizService from '../services/quizService.js';
import * as calendarService from '../services/calendarService.js';
import * as courseService from '../services/courseService.js';
import * as dashboardService from '../services/dashboardService.js';
import * as chatService from '../services/chatService.js';
import * as markingService from '../services/markingService.js';
import { parseUploadedDocument } from '../services/documentParser.js';
import { analyzeLearningMaterial } from '../services/ai/learningAi.js';

export const dashboard = asyncHandler(async (req, res) => {
  res.json(await dashboardService.getDashboard(req.userId));
});

export const listDocuments = asyncHandler(async (req, res) => {
  res.json({ documents: await documentService.listDocuments(req.userId) });
});

export const uploadDocument = asyncHandler(async (req, res) => {
  const doc = await documentService.uploadDocument(req.userId, req.file);
  res.status(201).json({ document: doc });
});

export const deleteDocument = asyncHandler(async (req, res) => {
  res.json(await documentService.deleteDocument(req.userId, req.params.id));
});

export const extractDocument = asyncHandler(async (req, res) => {
  const result = await parseUploadedDocument(req.body || {});
  if (!result.ok) return res.status(422).json(result);
  return res.json(result);
});

export const analyzeDocument = asyncHandler(async (req, res) => {
  const analysis = await analyzeLearningMaterial(req.body || {});
  if (analysis.error) return res.status(422).json(analysis);
  return res.json(analysis);
});

export const listLessonPlans = asyncHandler(async (req, res) => {
  res.json({ plans: await lessonPlanService.listLessonPlans(req.userId) });
});

export const getLessonPlan = asyncHandler(async (req, res) => {
  res.json({ plan: await lessonPlanService.getLessonPlan(req.userId, req.params.id) });
});

export const createLessonPlan = asyncHandler(async (req, res) => {
  res.status(201).json({ plan: await lessonPlanService.createLessonPlan(req.userId, req.body || {}) });
});

export const updateLessonPlan = asyncHandler(async (req, res) => {
  res.json({ plan: await lessonPlanService.updateLessonPlan(req.userId, req.params.id, req.body || {}) });
});

export const deleteLessonPlan = asyncHandler(async (req, res) => {
  res.json(await lessonPlanService.deleteLessonPlan(req.userId, req.params.id));
});

export const generateLessonPlan = asyncHandler(async (req, res) => {
  const plan = await lessonPlanService.generateAndSaveLessonPlan(req.userId, req.body || {});
  res.status(201).json(plan);
});

export const regenerateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonPlanService.regenerateLessonContent(req.body || {});
  res.json(lesson);
});

export const generateAiContent = asyncHandler(async (req, res) => {
  const data = await lessonPlanService.generateFocusedContent(req.userId, req.body || {});
  res.json({ data });
});

export const listAssessments = asyncHandler(async (req, res) => {
  res.json({ assessments: await assessmentService.listAssessments(req.userId) });
});

export const createAssessment = asyncHandler(async (req, res) => {
  res.status(201).json({ assessment: await assessmentService.createAssessment(req.userId, req.body || {}) });
});

export const updateAssessment = asyncHandler(async (req, res) => {
  res.json({ assessment: await assessmentService.updateAssessment(req.userId, req.params.id, req.body || {}) });
});

export const deleteAssessment = asyncHandler(async (req, res) => {
  res.json(await assessmentService.deleteAssessment(req.userId, req.params.id));
});

export const generateAssessment = asyncHandler(async (req, res) => {
  res.status(201).json({ assessment: await assessmentService.generateAssessment(req.userId, req.body || {}) });
});

export const listQuizzes = asyncHandler(async (req, res) => {
  res.json({ quizzes: await quizService.listQuizzes(req.userId) });
});

export const getQuiz = asyncHandler(async (req, res) => {
  res.json({ quiz: await quizService.getQuiz(req.userId, req.params.id) });
});

export const createQuiz = asyncHandler(async (req, res) => {
  res.status(201).json({ quiz: await quizService.createQuiz(req.userId, req.body || {}) });
});

export const updateQuiz = asyncHandler(async (req, res) => {
  res.json({ quiz: await quizService.updateQuiz(req.userId, req.params.id, req.body || {}) });
});

export const deleteQuiz = asyncHandler(async (req, res) => {
  res.json(await quizService.deleteQuiz(req.userId, req.params.id));
});

export const generateQuiz = asyncHandler(async (req, res) => {
  res.status(201).json({ quiz: await quizService.generateQuiz(req.userId, req.body || {}) });
});

export const listCalendar = asyncHandler(async (req, res) => {
  res.json({ events: await calendarService.listEvents(req.userId) });
});

export const createCalendar = asyncHandler(async (req, res) => {
  res.status(201).json({ event: await calendarService.createEvent(req.userId, req.body || {}) });
});

export const updateCalendar = asyncHandler(async (req, res) => {
  res.json({ event: await calendarService.updateEvent(req.userId, req.params.id, req.body || {}) });
});

export const deleteCalendar = asyncHandler(async (req, res) => {
  res.json(await calendarService.deleteEvent(req.userId, req.params.id));
});

export const listCourses = asyncHandler(async (req, res) => {
  res.json({ courses: await courseService.listCourses(req.userId) });
});

export const createCourse = asyncHandler(async (req, res) => {
  res.status(201).json({ course: await courseService.createCourse(req.userId, req.body || {}) });
});

export const updateCourse = asyncHandler(async (req, res) => {
  res.json({ course: await courseService.updateCourse(req.userId, req.params.id, req.body || {}) });
});

export const deleteCourse = asyncHandler(async (req, res) => {
  res.json(await courseService.deleteCourse(req.userId, req.params.id));
});

export const aiStatus = asyncHandler(async (_req, res) => {
  res.json(chatService.getLlmStatus());
});

export const listConversations = asyncHandler(async (req, res) => {
  res.json({ conversations: await chatService.listConversations(req.userId) });
});

export const getConversation = asyncHandler(async (req, res) => {
  res.json({ conversation: await chatService.getConversation(req.userId, req.params.id) });
});

export const createConversation = asyncHandler(async (req, res) => {
  res.status(201).json({ conversation: await chatService.createConversation(req.userId, req.body?.title) });
});

export const chat = asyncHandler(async (req, res) => {
  res.json(await chatService.chat(req.userId, req.body || {}, req.user));
});

export const chatStream = asyncHandler(async (req, res) => {
  await chatService.chatStream(req.userId, req.body || {}, req.user, res);
});

export const markPaper = asyncHandler(async (req, res) => {
  res.json(await markingService.markPaper(req.userId, req.body || {}));
});

export const markPaperStream = asyncHandler(async (req, res) => {
  await markingService.markPaperStream(req.userId, req.body || {}, req.user, res);
});
