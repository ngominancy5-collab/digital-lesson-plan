import { AppError } from '../utils/errors.js';
import { completeJson, completeText } from './ai/aiClient.js';
import { makeId } from '../../../shared/learningEngine.js';
import * as markedPaperRepository from '../repositories/markedPaperRepository.js';
import { notify } from './notificationService.js';

const REVIEW_STATUSES = new Set(['ai_completed', 'under_review', 'draft', 'finalized']);

function emitProgress(onProgress, percent, message, { estimated = true } = {}) {
  if (typeof onProgress !== 'function') return;
  onProgress({
    percent: Math.max(0, Math.min(99, Number(percent) || 0)),
    message: String(message || ''),
    estimated: Boolean(estimated),
    done: false,
  });
}

function clampMark(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Number(max) || 0, n));
}

function statusFromMarks(awarded, available) {
  if (awarded >= available && available > 0) return 'correct';
  if (awarded > 0) return 'partial';
  return 'incorrect';
}

function normalizeQuestion(item, index) {
  const marksAvailable = Math.max(0, Number(item.marksAvailable) || 0);
  const aiMarks = clampMark(
    item.aiMarksAwarded != null ? item.aiMarksAwarded : item.marksAwarded,
    marksAvailable,
  );
  const finalMarks = clampMark(
    item.marksAwarded != null ? item.marksAwarded : aiMarks,
    marksAvailable,
  );
  const aiStatus = item.aiStatus || statusFromMarks(aiMarks, marksAvailable);
  const status = item.status || statusFromMarks(finalMarks, marksAvailable);
  return {
    id: item.id || makeId('q'),
    number: String(item.number || index + 1),
    questionText: String(item.questionText || item.question || `Question ${index + 1}`),
    studentAnswer: String(item.studentAnswer || ''),
    expectedAnswer: String(item.expectedAnswer || ''),
    marksAvailable,
    aiMarksAwarded: aiMarks,
    marksAwarded: finalMarks,
    aiStatus,
    status,
    aiFeedback: String(item.aiFeedback != null ? item.aiFeedback : item.feedback || ''),
    feedback: String(item.feedback != null ? item.feedback : item.aiFeedback || ''),
    markerComment: String(item.markerComment || ''),
    reviewed: Boolean(item.reviewed),
    adjustmentReason: item.adjustmentReason || null,
    aiExplanation: String(item.aiExplanation || item.explanation || item.feedback || ''),
  };
}

function summarizeQuestions(questions) {
  const totalMarks = questions.reduce((sum, item) => sum + item.marksAvailable, 0);
  const obtained = questions.reduce((sum, item) => sum + item.marksAwarded, 0);
  const aiObtained = questions.reduce((sum, item) => sum + item.aiMarksAwarded, 0);
  const percentage = totalMarks ? Math.round((obtained / totalMarks) * 1000) / 10 : 0;
  const aiPercentage = totalMarks ? Math.round((aiObtained / totalMarks) * 1000) / 10 : 0;
  return {
    totalMarks,
    obtained,
    percentage,
    aiObtained,
    aiPercentage,
    correct: questions.filter((item) => item.status === 'correct').length,
    partial: questions.filter((item) => item.status === 'partial').length,
    incorrect: questions.filter((item) => item.status === 'incorrect').length,
    reviewedCount: questions.filter((item) => item.reviewed).length,
  };
}

function mapMarkedPaper(row) {
  if (!row) return null;
  const questions = (Array.isArray(row.questions) ? row.questions : []).map(normalizeQuestion);
  const summary = summarizeQuestions(questions);
  const reviewStatus = REVIEW_STATUSES.has(row.reviewStatus) ? row.reviewStatus : 'ai_completed';
  return {
    id: row.id,
    subject: row.assessmentName,
    assessmentName: row.assessmentName,
    studentLabel: row.studentName,
    studentName: row.studentName,
    questions,
    totalMarks: summary.totalMarks || row.totalMarks || 0,
    obtained: summary.obtained,
    score: summary.obtained,
    percentage: summary.percentage,
    aiScore: row.aiScore != null ? row.aiScore : summary.aiObtained,
    aiTotalMarks: row.aiTotalMarks != null ? row.aiTotalMarks : summary.totalMarks,
    aiPercentage: row.aiPercentage != null ? row.aiPercentage : summary.aiPercentage,
    correct: summary.correct,
    partial: summary.partial,
    incorrect: summary.incorrect,
    reviewedCount: summary.reviewedCount,
    unreviewedCount: Math.max(0, questions.length - summary.reviewedCount),
    aiFeedback: row.aiFeedback || row.feedback || '',
    feedback: row.feedback || row.aiFeedback || '',
    reviewStatus,
    status: reviewStatus,
    markedAt: row.markedAt,
    reviewedAt: row.reviewedAt,
    finalizedAt: row.finalizedAt,
    lastSavedAt: row.lastSavedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listMarkedPapers(userId) {
  const rows = await markedPaperRepository.listByUser(userId);
  return rows.map(mapMarkedPaper);
}

export async function getMarkedPaper(userId, id) {
  const row = await markedPaperRepository.findByIdForUser(id, userId);
  if (!row) throw new AppError('Marked paper not found.', 404);
  return mapMarkedPaper(row);
}

function validateQuestionUpdates(existingQuestions, incoming) {
  if (!Array.isArray(incoming)) {
    throw new AppError('Questions payload is required.');
  }
  const byId = new Map(existingQuestions.map((item) => [item.id, item]));
  return incoming.map((raw, index) => {
    const current = byId.get(raw.id) || normalizeQuestion(raw, index);
    const marksAvailable = current.marksAvailable;
    const marksAwarded = clampMark(raw.marksAwarded, marksAvailable);
    return {
      ...current,
      marksAwarded,
      status: statusFromMarks(marksAwarded, marksAvailable),
      feedback: String(raw.feedback != null ? raw.feedback : current.feedback),
      markerComment: String(raw.markerComment != null ? raw.markerComment : current.markerComment),
      reviewed: Boolean(raw.reviewed),
      adjustmentReason: raw.adjustmentReason || current.adjustmentReason || null,
      questionText: String(raw.questionText != null ? raw.questionText : current.questionText),
    };
  });
}

export async function saveMarkingDraft(userId, id, body = {}) {
  const row = await markedPaperRepository.findByIdForUser(id, userId);
  if (!row) throw new AppError('Marked paper not found.', 404);
  if (row.reviewStatus === 'finalized') {
    throw new AppError('This marking is finalized. Reopen it before editing.', 409);
  }
  const existing = (Array.isArray(row.questions) ? row.questions : []).map(normalizeQuestion);
  const questions = validateQuestionUpdates(existing, body.questions || existing);
  const summary = summarizeQuestions(questions);
  const now = new Date();
  const updated = await markedPaperRepository.updateForUser(id, userId, {
    questions,
    score: summary.obtained,
    totalMarks: summary.totalMarks,
    percentage: summary.percentage,
    feedback: body.feedback != null ? String(body.feedback) : row.feedback,
    reviewStatus: 'draft',
    reviewedAt: row.reviewedAt || now,
    lastSavedAt: now,
  });
  return mapMarkedPaper(updated);
}

export async function finalizeMarking(userId, id, body = {}) {
  const row = await markedPaperRepository.findByIdForUser(id, userId);
  if (!row) throw new AppError('Marked paper not found.', 404);
  if (row.reviewStatus === 'finalized') {
    return mapMarkedPaper(row);
  }
  const existing = (Array.isArray(row.questions) ? row.questions : []).map(normalizeQuestion);
  const questions = validateQuestionUpdates(existing, body.questions || existing).map((item) => ({
    ...item,
    reviewed: true,
  }));
  const summary = summarizeQuestions(questions);
  const now = new Date();
  const updated = await markedPaperRepository.updateForUser(id, userId, {
    questions,
    score: summary.obtained,
    totalMarks: summary.totalMarks,
    percentage: summary.percentage,
    feedback: body.feedback != null ? String(body.feedback) : row.feedback,
    reviewStatus: 'finalized',
    reviewedAt: row.reviewedAt || now,
    finalizedAt: now,
    lastSavedAt: now,
  });
  await notify(userId, {
    title: 'Marking finalized',
    message: `${updated.studentName} finalized at ${summary.obtained}/${summary.totalMarks} (${summary.percentage}%).`,
    type: 'marking',
  });
  return mapMarkedPaper(updated);
}

export async function reopenMarking(userId, id) {
  const row = await markedPaperRepository.findByIdForUser(id, userId);
  if (!row) throw new AppError('Marked paper not found.', 404);
  if (row.reviewStatus !== 'finalized') {
    return mapMarkedPaper(row);
  }
  const updated = await markedPaperRepository.updateForUser(id, userId, {
    reviewStatus: 'under_review',
    lastSavedAt: new Date(),
  });
  return mapMarkedPaper(updated);
}

/** Update student/subject metadata for the owning lecturer/teacher only. */
export async function updateMarkedPaperMeta(userId, id, body = {}) {
  const row = await markedPaperRepository.findByIdForUser(id, userId);
  if (!row) throw new AppError('Marked paper not found.', 404);

  const studentName = String(body.studentLabel || body.studentName || '').trim();
  const assessmentName = String(body.subject || body.assessmentName || '').trim();
  if (!studentName) throw new AppError('Student / paper ID is required.');
  if (!assessmentName) throw new AppError('Subject / assessment name is required.');

  const data = {
    studentName,
    assessmentName,
    lastSavedAt: new Date(),
  };
  if (body.feedback != null) data.feedback = String(body.feedback);
  if (Array.isArray(body.questions) && row.reviewStatus !== 'finalized') {
    const existing = (Array.isArray(row.questions) ? row.questions : []).map(normalizeQuestion);
    const questions = validateQuestionUpdates(existing, body.questions);
    const summary = summarizeQuestions(questions);
    Object.assign(data, {
      questions,
      score: summary.obtained,
      totalMarks: summary.totalMarks,
      percentage: summary.percentage,
      reviewStatus: row.reviewStatus === 'ai_completed' ? 'draft' : row.reviewStatus,
    });
  }

  const updated = await markedPaperRepository.updateForUser(id, userId, data);
  if (!updated) throw new AppError('Marked paper not found.', 404);
  return mapMarkedPaper(updated);
}

/**
 * Delete/archive a marking record owned by the user.
 * Finalized academic results are soft-deleted (archived). Drafts may be hard-deleted.
 */
export async function deleteMarkedPaper(userId, id) {
  const row = await markedPaperRepository.findByIdForUser(id, userId);
  if (!row) throw new AppError('Marked paper not found.', 404);

  if (row.reviewStatus === 'finalized') {
    const result = await markedPaperRepository.softDeleteForUser(id, userId);
    if (!result.count) throw new AppError('Marked paper not found.', 404);
    return {
      ok: true,
      archived: true,
      id,
      message: 'Finalized marking was archived and removed from your active history.',
    };
  }

  const hard = await markedPaperRepository.hardDeleteForUser(id, userId);
  if (!hard.count) {
    // Fallback soft-delete if status changed concurrently.
    await markedPaperRepository.softDeleteForUser(id, userId);
    return { ok: true, archived: true, id, message: 'Marking record was archived.' };
  }
  return { ok: true, archived: false, id, message: 'Marking record deleted.' };
}

export async function markPaper(userId, body, { onProgress } = {}) {
  const {
    markingKeyText = '',
    studentPaperText = '',
    subject = '',
    studentLabel = 'Student paper',
  } = body || {};
  if (!String(markingKeyText).trim() || !String(studentPaperText).trim()) {
    throw new AppError('Upload both a marking key and a student paper first.');
  }

  emitProgress(onProgress, 5, 'Preparing assessment for marking.');
  emitProgress(onProgress, 20, 'Reading the submitted answers and marking scheme.');

  const system = `You are an education marking assistant for lecturers and school teachers.
Return ONLY valid JSON with this shape:
{
  "questions": [
    {
      "number": "1",
      "questionText": "the question if known",
      "studentAnswer": "...",
      "expectedAnswer": "...",
      "marksAvailable": 5,
      "marksAwarded": 4,
      "status": "correct" | "partial" | "incorrect",
      "feedback": "short note explaining the evaluation",
      "aiExplanation": "why these marks were suggested"
    }
  ],
  "aiFeedback": "overall feedback paragraph",
  "subject": "subject if known"
}
Be fair. Prefer partial credit when the student is close. These are suggestions only; a teacher will review.`;

  const userPrompt = `Subject: ${subject || 'Not specified'}
Student label: ${studentLabel}

MARKING KEY / SCHEME:
${String(markingKeyText).slice(0, 10000)}

STUDENT PAPER ANSWERS:
${String(studentPaperText).slice(0, 10000)}

Mark the paper against the key.`;

  emitProgress(onProgress, 40, 'Analyzing answers against the marking scheme...');

  let provider = 'local';
  let data;
  try {
    const result = await completeJson(system, userPrompt);
    provider = result.provider;
    data = result.data;
  } catch (error) {
    throw new AppError(
      error.message || 'The AI service could not mark this paper. Please try again.',
      error.status || 502,
    );
  }

  emitProgress(onProgress, 60, 'Evaluating answers and awarding marks...');

  const rawQuestions = Array.isArray(data?.questions) ? data.questions : [];
  if (!rawQuestions.length) {
    throw new AppError('The AI service could not mark this paper. Please try again.', 502);
  }

  const normalized = rawQuestions.map((item, index) => {
    const base = normalizeQuestion({
      ...item,
      aiMarksAwarded: item.marksAwarded,
      marksAwarded: item.marksAwarded,
      aiFeedback: item.feedback,
      feedback: item.feedback,
      aiExplanation: item.aiExplanation || item.feedback,
      reviewed: false,
    }, index);
    return base;
  });

  emitProgress(onProgress, 75, 'Calculating the final score and percentage...');
  const summary = summarizeQuestions(normalized);

  emitProgress(onProgress, 85, 'Preparing the marking report...');

  let aiFeedback = String(data?.aiFeedback || '').trim();
  if (!aiFeedback) {
    try {
      const text = await completeText(
        'You are a supportive teaching coach. Write 2-3 sentences of marking feedback.',
        `Subject: ${subject || data?.subject || 'General'}. Suggested score ${summary.aiObtained}/${summary.totalMarks} (${summary.aiPercentage}%). Summarize strengths and improvement areas.`,
      );
      aiFeedback = text.content || 'Review each question carefully before finalising marks.';
    } catch {
      aiFeedback = 'Review each question carefully before finalising marks.';
    }
  }

  emitProgress(onProgress, 92, 'Saving AI suggestions for teacher review...');

  const now = new Date();
  const saved = await markedPaperRepository.create({
    userId,
    studentName: studentLabel,
    assessmentName: data?.subject || subject || 'General',
    score: summary.obtained,
    totalMarks: summary.totalMarks,
    percentage: summary.percentage,
    aiScore: summary.aiObtained,
    aiTotalMarks: summary.totalMarks,
    aiPercentage: summary.aiPercentage,
    questions: normalized,
    aiQuestions: normalized.map((item) => ({
      id: item.id,
      number: item.number,
      questionText: item.questionText,
      studentAnswer: item.studentAnswer,
      expectedAnswer: item.expectedAnswer,
      marksAvailable: item.marksAvailable,
      marksAwarded: item.aiMarksAwarded,
      status: item.aiStatus,
      feedback: item.aiFeedback,
    })),
    feedback: aiFeedback,
    aiFeedback,
    reviewStatus: 'ai_completed',
    lastSavedAt: now,
  });

  await notify(userId, {
    title: 'AI marking ready for review',
    message: `${saved.studentName} — review suggested marks before finalising.`,
    type: 'marking',
  });

  const payload = {
    ...mapMarkedPaper(saved),
    provider: provider || 'local',
  };

  if (typeof onProgress === 'function') {
    onProgress({
      percent: 100,
      message: 'Marking completed successfully!',
      estimated: false,
      done: true,
      result: payload,
    });
  }

  return payload;
}

export async function markPaperStream(userId, body, user, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('progress', {
      percent: 0,
      message: 'Preparing assessment for marking.',
      estimated: true,
      done: false,
    });

    const result = await markPaper(userId, body, {
      onProgress: (update) => {
        if (update.done) return;
        send('progress', {
          percent: update.percent,
          message: update.message,
          estimated: update.estimated,
          done: false,
        });
      },
    });

    if (userId && user?.role !== 'admin') {
      try {
        const { recordUsage } = await import('./subscriptionService.js');
        await recordUsage(userId, 'ai');
      } catch (error) {
        console.error('Could not record marking usage.', error.message || error);
      }
    }

    send('progress', {
      percent: 100,
      message: 'Marking completed successfully!',
      estimated: false,
      done: true,
    });
    send('done', { result });
    res.end();
  } catch (error) {
    send('error', {
      error: error.message || 'Marking failed.',
      detail: error.detail || '',
      code: error.code || '',
      percent: null,
      done: false,
    });
    res.end();
  }
}
