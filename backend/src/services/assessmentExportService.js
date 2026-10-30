import { createRequire } from 'node:module';
import { AppError } from '../utils/errors.js';
import { getAssessment } from './assessmentService.js';
import { getQuiz } from './quizService.js';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

function optionLetter(index) {
  return String.fromCharCode(65 + index);
}

function slugify(value) {
  return String(value || 'assessment')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'assessment';
}

function normalizeQuestions(raw = []) {
  return (raw || []).map((question, index) => {
    const options = (question.options || []).map((option) => (
      typeof option === 'string' ? option : (option?.optionText || option?.text || '')
    )).filter((item) => String(item || '').trim());
    return {
      id: question.id || `q${index + 1}`,
      type: String(question.type || question.questionType || (options.length ? 'multiple-choice' : 'short-answer')).toLowerCase(),
      prompt: String(question.prompt || question.question || '').trim(),
      marks: Number(question.marks || 1) || 1,
      options,
      answer: String(question.answer || question.correctAnswer || '').trim(),
    };
  }).filter((question) => question.prompt);
}

function sectionMeta(type) {
  if (type.includes('true') || type.includes('false')) {
    return { key: 'true-false', title: 'TRUE / FALSE QUESTIONS', order: 1 };
  }
  if (type.includes('multiple') || type.includes('mcq') || type.includes('choice')) {
    return { key: 'multiple-choice', title: 'MULTIPLE-CHOICE QUESTIONS', order: 2 };
  }
  if (type.includes('short')) {
    return { key: 'short-answer', title: 'SHORT-ANSWER QUESTIONS', order: 3 };
  }
  if (type.includes('scenario')) {
    return { key: 'scenario', title: 'SCENARIO-BASED QUESTIONS', order: 4 };
  }
  if (type.includes('practical') || type.includes('application')) {
    return { key: 'practical', title: 'PRACTICAL / APPLICATION QUESTIONS', order: 5 };
  }
  if (type.includes('long') || type.includes('essay')) {
    return { key: 'essay', title: 'ESSAY / LONG-ANSWER QUESTIONS', order: 6 };
  }
  return { key: 'general', title: 'QUESTIONS', order: 7 };
}

function groupSections(questions) {
  const map = new Map();
  questions.forEach((question) => {
    const meta = sectionMeta(question.type);
    if (!map.has(meta.key)) {
      map.set(meta.key, { ...meta, questions: [] });
    }
    map.get(meta.key).questions.push(question);
  });
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function ensureSpace(doc, needed = 72) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function writeWrapped(doc, text, options = {}) {
  doc.text(String(text || ''), {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    align: 'left',
    ...options,
  });
}

function buildPaperModel(source, kind = 'assessment') {
  const questions = normalizeQuestions(source.questions || []);
  const totalMarks = Number(source.totalMarks || source.marks)
    || questions.reduce((sum, item) => sum + item.marks, 0);
  const meta = source.meta || {};
  return {
    kind,
    title: source.title || 'Assessment',
    institution: meta.institution || source.institution || '',
    courseName: meta.courseName || source.courseName || source.subject || '',
    courseCode: meta.courseCode || source.courseCode || '',
    assessmentType: source.kind || source.type || kind,
    difficulty: source.difficulty || meta.difficulty || '',
    date: source.dueDate || source.createdAt || meta.date || '',
    timeAllowed: source.timeAllowed || meta.timeAllowed || '',
    totalMarks,
    instructions: source.instructions || source.description || 'Answer all questions. Show your working where required.',
    questions,
    sections: groupSections(questions),
  };
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(value);
  }
}

function renderPaperPdf(paper) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      autoFirstPage: true,
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('Helvetica-Bold').fontSize(16).text(paper.institution || 'PlanWise AI Assessment', {
      align: 'center',
      width: contentWidth,
    });
    doc.moveDown(0.35);
    doc.font('Helvetica-Bold').fontSize(13).text(paper.title, { align: 'center', width: contentWidth });
    doc.moveDown(0.55);

    doc.fontSize(10).font('Helvetica');
    const headerRows = [
      ['Course', [paper.courseName, paper.courseCode].filter(Boolean).join(' · ')],
      ['Assessment type', String(paper.assessmentType || '').replace(/-/g, ' ')],
      ['Difficulty', paper.difficulty],
      ['Date', formatDate(paper.date)],
      ['Time allowed', paper.timeAllowed],
      ['Total marks', paper.totalMarks ? String(paper.totalMarks) : ''],
    ];
    headerRows.forEach(([label, value]) => {
      if (!value) return;
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(String(value));
    });

    doc.moveDown(0.7);
    doc.font('Helvetica-Bold').fontSize(11).text('INSTRUCTIONS TO CANDIDATES');
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(10);
    writeWrapped(doc, paper.instructions || 'Answer all questions.');

    let globalNumber = 1;
    paper.sections.forEach((section, sectionIndex) => {
      ensureSpace(doc, 90);
      doc.moveDown(0.9);
      const sectionLabel = String.fromCharCode(65 + sectionIndex);
      doc.font('Helvetica-Bold').fontSize(12).text(`SECTION ${sectionLabel}: ${section.title}`);
      doc.moveDown(0.2);
      const sectionMarks = section.questions.reduce((sum, item) => sum + item.marks, 0);
      doc.font('Helvetica-Oblique').fontSize(10).text(
        `Answer all questions in this section. This section carries ${sectionMarks} mark${sectionMarks === 1 ? '' : 's'}.`,
      );

      section.questions.forEach((question) => {
        const promptHeight = doc.heightOfString(question.prompt, { width: contentWidth }) + 28;
        const optionsHeight = (question.options?.length || 0) * 18;
        ensureSpace(doc, Math.min(220, promptHeight + optionsHeight + 24));

        doc.moveDown(0.7);
        doc.font('Helvetica-Bold').fontSize(11).text(
          `Question ${globalNumber} (${question.marks} Mark${question.marks === 1 ? '' : 's'})`,
        );
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(10);
        writeWrapped(doc, question.prompt);

        if (question.options?.length) {
          doc.moveDown(0.35);
          question.options.forEach((option, optionIndex) => {
            ensureSpace(doc, 22);
            writeWrapped(doc, `${optionLetter(optionIndex)}. ${option}`);
            doc.moveDown(0.12);
          });
        } else {
          doc.moveDown(0.45);
          doc.font('Helvetica').fillColor('#666666').text('Answer: _______________________________________________');
          doc.fillColor('#000000');
          doc.moveDown(0.15);
          doc.font('Helvetica').fillColor('#666666').text('________________________________________________________');
          doc.fillColor('#000000');
        }
        globalNumber += 1;
      });
    });

    if (paper.questions.some((question) => question.answer)) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).text('MARKING MEMORANDUM', { align: 'center' });
      doc.moveDown(0.2);
      doc.font('Helvetica-Oblique').fontSize(9).text('For lecturer use only — do not distribute to candidates.', {
        align: 'center',
      });
      doc.moveDown(0.7);
      paper.questions.forEach((question, index) => {
        ensureSpace(doc, 48);
        doc.font('Helvetica-Bold').fontSize(10).text(`Question ${index + 1}`);
        doc.font('Helvetica').fontSize(10).text(question.answer || '—');
        doc.moveDown(0.35);
      });
    }

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#666666').text(
        `Page ${i + 1} of ${pages.count}`,
        doc.page.margins.left,
        doc.page.height - 36,
        { width: contentWidth, align: 'center' },
      );
      doc.fillColor('#000000');
    }

    doc.end();
  });
}

export async function exportAssessmentPdf(userId, id) {
  const assessment = await getAssessment(userId, id);
  if (!assessment) throw new AppError('Assessment not found.', 404);
  const paper = buildPaperModel(assessment, 'assessment');
  const buffer = await renderPaperPdf(paper);
  const filename = `PlanWise-Assessment-${slugify(paper.courseCode || paper.courseName || paper.title)}.pdf`;
  return { buffer, filename, paper };
}

export async function exportQuizPdf(userId, id) {
  const quiz = await getQuiz(userId, id);
  if (!quiz) throw new AppError('Quiz not found.', 404);
  const paper = buildPaperModel({
    ...quiz,
    kind: 'quiz',
    type: 'quiz',
    totalMarks: (quiz.questions || []).reduce((sum, item) => sum + Number(item.marks || 0), 0),
    meta: {
      ...(quiz.meta || {}),
      difficulty: quiz.difficulty,
    },
  }, 'quiz');
  const buffer = await renderPaperPdf(paper);
  const filename = `PlanWise-Assessment-${slugify(paper.courseCode || paper.courseName || paper.title)}.pdf`;
  return { buffer, filename, paper };
}

export { buildPaperModel, groupSections, normalizeQuestions, optionLetter };
