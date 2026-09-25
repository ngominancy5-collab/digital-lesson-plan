import { completeJson, completeText } from '../services/llm.js';
import { makeId } from '../../../shared/learningEngine.js';
import { asyncHandler } from '../utils/errors.js';
import * as documentService from '../services/documentService.js';
import * as lessonPlanService from '../services/lessonPlanService.js';
import * as assessmentService from '../services/assessmentService.js';
import * as quizService from '../services/quizService.js';
import * as calendarService from '../services/calendarService.js';
import * as courseService from '../services/courseService.js';
import * as dashboardService from '../services/dashboardService.js';
import * as chatService from '../services/chatService.js';
import { parseUploadedDocument } from '../services/documentParser.js';
import { analyzeLearningMaterial } from '../services/learningAi.js';

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
  const {
    markingKeyText = '',
    studentPaperText = '',
    subject = '',
    studentLabel = 'Student paper',
  } = req.body || {};
  if (!String(markingKeyText).trim() || !String(studentPaperText).trim()) {
    return res.status(400).json({ error: 'Upload both a marking key and a student paper first.' });
  }

  const system = `You are an education marking assistant for lecturers and school teachers.
Return ONLY valid JSON with this shape:
{
  "questions": [
    {
      "number": "1",
      "studentAnswer": "...",
      "expectedAnswer": "...",
      "marksAvailable": 5,
      "marksAwarded": 4,
      "status": "correct" | "partial" | "incorrect",
      "feedback": "short note"
    }
  ],
  "aiFeedback": "overall feedback paragraph",
  "subject": "subject if known"
}
Be fair. Prefer partial credit when the student is close.`;

  const userPrompt = `Subject: ${subject || 'Not specified'}
Student label: ${studentLabel}

MARKING KEY / SCHEME:
${String(markingKeyText).slice(0, 10000)}

STUDENT PAPER ANSWERS:
${String(studentPaperText).slice(0, 10000)}

Mark the paper against the key.`;

  const { provider, data } = await completeJson(system, userPrompt);
  let questions = Array.isArray(data?.questions) ? data.questions : [];
  if (!questions.length) {
    const keyLines = String(markingKeyText).split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
    questions = keyLines.map((line, index) => {
      const marksAvailable = Number((line.match(/(\d+)\s*marks?/i) || [])[1] || 5);
      const expectedAnswer = line.replace(/^\d+[\).:-]?\s*/, '').slice(0, 180);
      const hay = String(studentPaperText).toLowerCase();
      const needle = expectedAnswer.toLowerCase().slice(0, 40);
      const hit = needle && hay.includes(needle.slice(0, 18));
      const marksAwarded = hit ? marksAvailable : Math.round(marksAvailable * 0.4);
      return {
        number: String(index + 1),
        studentAnswer: hit ? expectedAnswer : 'Answer detected with limited match — review manually.',
        expectedAnswer,
        marksAvailable,
        marksAwarded,
        status: hit ? 'correct' : 'partial',
        feedback: hit ? 'Matches the marking key closely.' : 'Needs teacher review.',
      };
    });
  }

  const normalized = questions.map((item, index) => {
    const marksAvailable = Math.max(0, Number(item.marksAvailable) || 0);
    const marksAwarded = Math.max(0, Math.min(marksAvailable, Number(item.marksAwarded) || 0));
    let status = item.status;
    if (!status) {
      if (marksAwarded >= marksAvailable) status = 'correct';
      else if (marksAwarded > 0) status = 'partial';
      else status = 'incorrect';
    }
    return {
      id: makeId('q'),
      number: String(item.number || index + 1),
      studentAnswer: String(item.studentAnswer || ''),
      expectedAnswer: String(item.expectedAnswer || ''),
      marksAvailable,
      marksAwarded,
      status,
      feedback: String(item.feedback || ''),
    };
  });

  const totalMarks = normalized.reduce((sum, item) => sum + item.marksAvailable, 0);
  const obtained = normalized.reduce((sum, item) => sum + item.marksAwarded, 0);
  const percentage = totalMarks ? Math.round((obtained / totalMarks) * 1000) / 10 : 0;
  let aiFeedback = String(data?.aiFeedback || '').trim();
  if (!aiFeedback) {
    try {
      const text = await completeText(
        'You are a supportive teaching coach. Write 2-3 sentences of marking feedback.',
        `Subject: ${subject || data?.subject || 'General'}. Score ${obtained}/${totalMarks} (${percentage}%). Summarize strengths and improvement areas.`,
      );
      aiFeedback = text.content || 'Review each question carefully before finalising marks.';
    } catch {
      aiFeedback = 'Review each question carefully before finalising marks.';
    }
  }

  return res.json({
    id: makeId('marking'),
    provider: provider || 'local',
    subject: data?.subject || subject || 'General',
    studentLabel,
    questions: normalized,
    totalMarks,
    obtained,
    percentage,
    correct: normalized.filter((item) => item.status === 'correct').length,
    partial: normalized.filter((item) => item.status === 'partial').length,
    incorrect: normalized.filter((item) => item.status === 'incorrect').length,
    aiFeedback,
    status: 'review',
    createdAt: new Date().toISOString(),
  });
});
