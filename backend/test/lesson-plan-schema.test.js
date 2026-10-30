import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLesson,
  validateLesson,
  validateLessonPlan,
} from '../src/services/ai/lessonPlanSchema.js';

test('normalizeLesson fills six procedure stages and balances time', () => {
  const lesson = normalizeLesson({
    topic: 'PHP File Handling',
    durationMinutes: 60,
    learningObjectives: ['Explain how fopen works', 'Demonstrate reading a text file'],
    teachingMethods: ['Lecture', 'Demonstration'],
    learningResources: ['Computer lab', 'PHP notes'],
    assessmentMethods: ['Oral questions', 'Coding exercise'],
    conclusion: 'Recap file open/read/close.',
    homework: 'Write a script that reads a CSV file.',
    procedure: [
      { stage: 'Introduction', durationMinutes: 5, content: 'Hook', teacherActivities: ['Ask prior knowledge'], studentActivities: ['Respond'] },
      { stage: 'Lesson Development / Presentation', content: 'Explain fopen', teacherActivities: ['Explain'], studentActivities: ['Take notes'] },
    ],
  }, { lessonDuration: '60 minutes' });

  assert.equal(lesson.procedure.length, 6);
  assert.equal(lesson.procedure.reduce((sum, stage) => sum + stage.durationMinutes, 0), 60);
  assert.ok(lesson.teacherActivities.length);
  assert.ok(lesson.studentActivities.length);
});

test('validateLesson requires measurable objectives and procedure activities', () => {
  const weak = normalizeLesson({
    topic: 'Files',
    durationMinutes: 60,
    learningObjectives: ['Know about files'],
    teachingMethods: ['Lecture'],
    learningResources: ['Slides'],
    assessmentMethod: 'Quiz',
    conclusion: 'Summary',
    procedure: [],
  });
  const issues = validateLesson(weak);
  assert.ok(issues.some((item) => /measurable/i.test(item) || /objectives/i.test(item)));
  assert.ok(issues.some((item) => /procedure/i.test(item)));
});

test('validateLessonPlan accepts a complete structured lesson', () => {
  const lesson = normalizeLesson({
    topic: 'PHP File Uploads',
    duration: '60 minutes',
    durationMinutes: 60,
    learningObjectives: [
      'Explain the PHP file upload lifecycle',
      'Demonstrate validating and storing an uploaded file',
    ],
    concepts: ['$_FILES', 'move_uploaded_file'],
    teachingMethods: ['Demonstration', 'Guided practice'],
    learningResources: ['Projector', 'PHP lab PCs'],
    assessmentMethods: ['Live coding check', 'Oral questions'],
    conclusion: 'Recap upload validation steps.',
    homework: 'Build a simple profile-photo upload form.',
    procedure: [
      { stage: 'Introduction', durationMinutes: 5, content: 'Why uploads matter', teacherActivities: ['Pose scenario'], studentActivities: ['Discuss'] },
      { stage: 'Lesson Development / Presentation', durationMinutes: 15, content: '$_FILES structure', teacherActivities: ['Explain fields'], studentActivities: ['Annotate diagram'] },
      { stage: 'Demonstration', durationMinutes: 10, content: 'Upload script', teacherActivities: ['Live code'], studentActivities: ['Observe and ask'] },
      { stage: 'Guided Practice', durationMinutes: 15, content: 'Build upload form', teacherActivities: ['Coach'], studentActivities: ['Code together'] },
      { stage: 'Independent Practice', durationMinutes: 10, content: 'Add validation', teacherActivities: ['Circulate'], studentActivities: ['Code independently'] },
      { stage: 'Conclusion', durationMinutes: 5, content: 'Security checklist', teacherActivities: ['Summarise'], studentActivities: ['List key checks'] },
    ],
  });
  const issues = validateLessonPlan({ lessons: [lesson] });
  assert.deepEqual(issues, []);
});
