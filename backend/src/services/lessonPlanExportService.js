import { createRequire } from 'node:module';
import { AppError } from '../utils/errors.js';
import { getLessonPlan } from './lessonPlanService.js';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

function lines(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => `• ${item}`).join('\n');
  return String(value || '').trim();
}

function writeSection(doc, title, body) {
  if (!body) return;
  doc.moveDown(0.35);
  doc.font('Helvetica-Bold').text(title);
  doc.font('Helvetica').text(body);
}

export async function exportLessonPlanPdf(userId, id) {
  const plan = await getLessonPlan(userId, id);
  if (!plan) throw new AppError('Lesson plan not found.', 404);

  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('PlanWise AI Lesson Plan', { align: 'left' });
    doc.moveDown(0.4);
    doc.fontSize(14).text(plan.courseName || plan.title || 'Lesson plan');
    doc.moveDown(0.6);
    doc.fontSize(11);
    const fields = [
      ['Institution', plan.meta?.institution || ''],
      ['Course', plan.courseName || plan.subject],
      ['Course code', plan.courseCode],
      ['Topic', plan.topic],
      ['Level', plan.gradeLevel],
      ['Duration', plan.duration],
      ['Difficulty', plan.difficulty],
      ['Status', plan.status],
    ];
    fields.forEach(([label, value]) => {
      if (!value) return;
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value);
    });

    const lessons = Array.isArray(plan.lessons) ? plan.lessons : [];
    if (!lessons.length) {
      writeSection(doc, 'Learning objectives', lines(plan.learningObjectives));
      writeSection(doc, 'Introduction', plan.introduction);
      writeSection(doc, 'Activities', lines(plan.lessonActivities));
      writeSection(doc, 'Teaching methods', lines(plan.teachingMethods));
      writeSection(doc, 'Resources', lines(plan.requiredMaterials));
      writeSection(doc, 'Assessment', plan.assessmentMethod);
      writeSection(doc, 'Conclusion', plan.conclusion);
    }

    lessons.forEach((lesson, index) => {
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text(`Lesson ${lesson.lessonNumber || index + 1}: ${lesson.topic || 'Untitled'}`);
      doc.moveDown(0.4);
      doc.fontSize(11).font('Helvetica');
      [
        ['Institution', lesson.institution || plan.meta?.institution],
        ['Subject', lesson.subject || plan.courseName],
        ['Level', lesson.level || plan.gradeLevel],
        ['Date', lesson.lessonDate],
        ['Duration', lesson.duration || `${lesson.durationMinutes || ''} minutes`],
        ['Week', lesson.weekNumber],
      ].forEach(([label, value]) => {
        if (!value) return;
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(String(value));
      });

      writeSection(doc, 'Topics / content', [
        lesson.subtopics?.length ? `Subtopics: ${lesson.subtopics.join('; ')}` : '',
        lesson.concepts?.length ? `Concepts: ${lesson.concepts.join('; ')}` : lesson.subtopic,
      ].filter(Boolean).join('\n'));
      writeSection(doc, 'Learning objectives', lines(lesson.learningObjectives));
      writeSection(doc, 'Teaching and learning materials', lines(lesson.learningResources));
      writeSection(doc, 'Teaching methods', lines(lesson.teachingMethods));

      if (Array.isArray(lesson.procedure) && lesson.procedure.length) {
        doc.moveDown(0.35);
        doc.font('Helvetica-Bold').text('Lesson procedure');
        lesson.procedure.forEach((stage) => {
          doc.moveDown(0.25);
          doc.font('Helvetica-Bold').text(`${stage.stage} (${stage.durationMinutes || '?'} min)`);
          doc.font('Helvetica');
          if (stage.content) doc.text(`Content: ${stage.content}`);
          if (stage.teacherActivities?.length) doc.text(`Lecturer: ${stage.teacherActivities.join('; ')}`);
          if (stage.studentActivities?.length) doc.text(`Students: ${stage.studentActivities.join('; ')}`);
        });
      } else {
        writeSection(doc, 'Introduction', lesson.introduction);
        writeSection(doc, 'Main content', lesson.mainContent);
        writeSection(doc, 'Teacher activities', lines(lesson.teacherActivities));
        writeSection(doc, 'Student activities', lines(lesson.studentActivities));
      }

      writeSection(doc, 'Assessment / evaluation', lines(lesson.assessmentMethods) || lesson.assessmentMethod);
      writeSection(doc, 'Conclusion', lesson.conclusion);
      writeSection(doc, 'Follow-up / homework', lesson.homework);
    });

    doc.end();
  });

  const slug = String(plan.courseName || plan.title || 'lesson-plan')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'lesson-plan';
  return { buffer, filename: `PlanWise-Lesson-Plan-${slug}.pdf` };
}
