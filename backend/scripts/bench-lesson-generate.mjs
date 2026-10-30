import 'dotenv/config';
import { generateLessonPlan } from '../src/services/ai/lessonPlanAi.js';
import { clearSourcePackCache, packSourceMaterial } from '../src/services/ai/sourceMaterialPacker.js';

const sample = `
--- Page 1 ---
Chapter 1 Introduction to PHP
PHP is a server-side scripting language used to build dynamic web applications.
Learning objectives: explain PHP role, write a basic script, run it on a server.

--- Page 2 ---
Chapter 2 Variables and Data Types
Variables start with $. Scalar types include string, int, float, bool.
Example: $name = "Ada"; $age = 21;

--- Page 3 ---
Chapter 3 Control Structures
Use if/else, switch, while and for loops to control program flow.
Example: for ($i = 0; $i < 5; $i++) { echo $i; }

--- Page 4 ---
Chapter 4 File Handling in PHP
fopen, fread, fwrite and fclose manage files.
Always check return values and close handles.

--- Page 5 ---
Chapter 5 Forms and Request Handling
HTML forms submit via GET or POST. Use \$_POST and htmlspecialchars for safety.
`;

clearSourcePackCache();
const packed = packSourceMaterial([{ id: 'demo', name: 'php-course.pdf', text: sample }], {
  topics: [],
  totalBudget: 7000,
});

const oldStyle = (`Source file: php-course.pdf\n${sample}`).slice(0, 12000);
console.log('PACKED_CHARS', packed.usedChars);
console.log('OLD_STYLE_CHARS', oldStyle.length);

const payload = {
  course: { courseName: 'PHP Programming', courseCode: 'PHP101', level: 'Year 1' },
  topics: [],
  schedule: {
    numberOfWeeks: 4,
    lessonsPerWeek: 2,
    lessonDuration: '60 minutes',
    startDate: '2026-02-02',
    endDate: '2026-02-27',
    holidays: [],
  },
  preferences: {
    teachingMethods: ['Lecture', 'Practical'],
    learningActivities: ['Guided practice'],
  },
  customInstructions: 'Generate a practical teaching plan from the selected source files only.',
  sourceMaterial: packed.materialText,
  difficulty: 'Intermediate',
};

const t0 = Date.now();
try {
  const plan = await generateLessonPlan(payload);
  const ms = Date.now() - t0;
  console.log('AI_GENERATE_MS', ms);
  console.log('AI_GENERATE_SEC', (ms / 1000).toFixed(1));
  console.log('LESSONS', plan.lessons?.length || 0);
  console.log('FIRST_TOPIC', plan.lessons?.[0]?.topic || '');
  console.log('HAS_MAIN', Boolean(plan.lessons?.[0]?.mainContent));
} catch (error) {
  console.log('AI_GENERATE_FAIL_MS', Date.now() - t0);
  console.log('AI_GENERATE_ERR', error.message);
  process.exitCode = 1;
}
