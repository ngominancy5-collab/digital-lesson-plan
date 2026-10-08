import { createRequire } from 'node:module';
import { AppError } from '../utils/errors.js';
import { getLessonPlan } from './lessonPlanService.js';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

function lines(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => `• ${item}`).join('\n');
  return String(value || '').trim();
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
      ['Course', plan.courseName || plan.subject],
      ['Course code', plan.courseCode],
      ['Topic', plan.topic],
      ['Level', plan.gradeLevel],
      ['Duration', plan.duration],
      ['Difficulty', plan.difficulty],
      ['Status', plan.status],
    ];
    fields.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value || 'Not recorded');
    });
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Learning objectives');
    doc.font('Helvetica').text(lines(plan.learningObjectives) || 'Not recorded');
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Introduction');
    doc.font('Helvetica').text(plan.introduction || 'Not recorded');
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Activities');
    doc.font('Helvetica').text(lines(plan.lessonActivities) || 'Not recorded');
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Teaching methods');
    doc.font('Helvetica').text(lines(plan.teachingMethods) || 'Not recorded');
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Resources');
    doc.font('Helvetica').text(lines(plan.requiredMaterials) || 'Not recorded');
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Assessment');
    doc.font('Helvetica').text(plan.assessmentMethod || 'Not recorded');
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Conclusion');
    doc.font('Helvetica').text(plan.conclusion || 'Not recorded');

    const lessons = Array.isArray(plan.lessons) ? plan.lessons : [];
    if (lessons.length) {
      doc.addPage();
      doc.fontSize(14).text('Lessons');
      lessons.forEach((lesson, index) => {
        doc.moveDown(0.6);
        doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${lesson.topic || lesson.title || 'Lesson'}`);
        doc.fontSize(11).font('Helvetica');
        if (lesson.lessonDate) doc.text(`Date: ${lesson.lessonDate}`);
        if (lesson.duration) doc.text(`Duration: ${lesson.duration}`);
        const objectives = lines(lesson.learningObjectives || lesson.learningOutcomes);
        if (objectives) {
          doc.font('Helvetica-Bold').text('Objectives');
          doc.font('Helvetica').text(objectives);
        }
        const activities = lines(lesson.studentActivities || lesson.teacherActivities);
        if (activities) {
          doc.font('Helvetica-Bold').text('Activities');
          doc.font('Helvetica').text(activities);
        }
        if (lesson.assessmentMethod) {
          doc.font('Helvetica-Bold').text('Assessment');
          doc.font('Helvetica').text(lesson.assessmentMethod);
        }
      });
    }
    doc.end();
  });

  const slug = String(plan.courseName || plan.title || 'lesson-plan')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'lesson-plan';
  return { buffer, filename: `PlanWise-Lesson-Plan-${slug}.pdf` };
}
