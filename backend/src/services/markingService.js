import { AppError } from '../utils/errors.js';
import { completeJson, completeText } from './ai/aiClient.js';
import { makeId } from '../../../shared/learningEngine.js';
import * as markedPaperRepository from '../repositories/markedPaperRepository.js';
import { notify } from './notificationService.js';

export async function listMarkedPapers(userId) {
  return markedPaperRepository.listByUser(userId);
}

export async function markPaper(userId, body) {
  const {
    markingKeyText = '',
    studentPaperText = '',
    subject = '',
    studentLabel = 'Student paper',
  } = body || {};
  if (!String(markingKeyText).trim() || !String(studentPaperText).trim()) {
    throw new AppError('Upload both a marking key and a student paper first.');
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
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  if (!questions.length) {
    throw new AppError('The AI service could not mark this paper. Please try again.', 502);
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

  const saved = await markedPaperRepository.create({
    userId,
    studentName: studentLabel,
    assessmentName: data?.subject || subject || 'General',
    score: obtained,
    totalMarks,
    percentage,
    questions: normalized,
    feedback: aiFeedback,
  });
  await notify(userId, {
    title: 'Paper marked',
    message: `${saved.studentName} scored ${obtained}/${totalMarks}.`,
    type: 'marking',
  });
  return {
    id: saved.id,
    provider: provider || 'local',
    subject: saved.assessmentName,
    studentLabel: saved.studentName,
    studentName: saved.studentName,
    assessmentName: saved.assessmentName,
    questions: normalized,
    totalMarks,
    obtained,
    score: obtained,
    percentage,
    correct: normalized.filter((item) => item.status === 'correct').length,
    partial: normalized.filter((item) => item.status === 'partial').length,
    incorrect: normalized.filter((item) => item.status === 'incorrect').length,
    aiFeedback,
    status: 'review',
    markedAt: saved.markedAt,
    createdAt: saved.createdAt,
  };
}
