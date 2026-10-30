import 'dotenv/config';
import { generateLessonPlan } from '../src/services/ai/lessonPlanAi.js';
import { validateLessonPlan } from '../src/services/ai/lessonPlanSchema.js';

const sourceMaterial = `
Source file: PHP-File-Handling.pdf
Chapter 4 File Handling in PHP
Students learn to open, read, write and close files using fopen, fread, fwrite and fclose.
Always check return values. Use modes such as r, w, a and b.

Chapter 5 File Uploads
HTML forms can upload files with enctype multipart/form-data.
PHP exposes upload data through $_FILES. Validate size and MIME type, then use move_uploaded_file.
Security: never trust original filenames; store generated names outside the web root when possible.
Example workflow: build upload form → receive file → validate → move → confirm success.
`;

const t0 = Date.now();
try {
  const plan = await generateLessonPlan({
    course: {
      institution: 'PlanWise Demo College',
      courseName: 'PHP Programming',
      courseCode: 'PHP101',
      level: 'Year 1',
      lecturer: 'Dr Demo',
    },
    topics: ['PHP File Handling', 'PHP File Uploads'],
    schedule: {
      numberOfWeeks: 1,
      lessonsPerWeek: 2,
      lessonDuration: '60 minutes',
      startDate: '2026-03-02',
      endDate: '2026-03-06',
      holidays: [],
    },
    preferences: {
      teachingMethods: ['Lecture', 'Demonstration', 'Guided practice'],
      learningActivities: ['Coding exercises', 'Q&A'],
    },
    customInstructions: 'Create classroom-ready plans for File Handling and File Uploads.',
    sourceMaterial,
    difficulty: 'Intermediate',
  });

  const ms = Date.now() - t0;
  const issues = validateLessonPlan(plan, { requireSourceGrounding: true, sourceMaterial });
  const first = plan.lessons[0] || {};
  console.log('STATUS OK');
  console.log('GENERATE_MS', ms);
  console.log('GENERATE_SEC', (ms / 1000).toFixed(1));
  console.log('LESSONS', plan.lessons.length);
  console.log('FIRST_TOPIC', first.topic);
  console.log('HAS_PROCEDURE', Array.isArray(first.procedure) && first.procedure.length === 6);
  console.log('PROCEDURE_STAGES', (first.procedure || []).map((stage) => stage.stage).join(' | '));
  console.log('TIME_SUM', (first.procedure || []).reduce((sum, stage) => sum + Number(stage.durationMinutes || 0), 0));
  console.log('OBJECTIVES', (first.learningObjectives || []).length);
  console.log('METHODS', (first.teachingMethods || []).join('; '));
  console.log('ASSESSMENT', (first.assessmentMethods || first.assessmentMethod || '').toString().slice(0, 120));
  console.log('VALIDATION_ISSUES', issues.length ? issues.join(' || ') : 'none');
} catch (error) {
  console.log('STATUS FAIL');
  console.log('GENERATE_FAIL_MS', Date.now() - t0);
  console.log('ERROR', error.message);
  process.exitCode = 1;
}
