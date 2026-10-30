import dotenv from 'dotenv';
import { completeJson } from './aiClient.js';
import {
  normalizeLesson,
  normalizeLessonPlan,
  validateLessonPlan,
} from './lessonPlanSchema.js';

dotenv.config();

function compactCourse(course = {}) {
  return [
    course.institution && `Institution: ${course.institution}`,
    course.courseName && `Subject/Course: ${course.courseName}`,
    course.courseCode && `Code: ${course.courseCode}`,
    course.programme && `Programme: ${course.programme}`,
    course.level && `Class/Level: ${course.level}`,
    course.department && `Department: ${course.department}`,
    course.lecturer && `Lecturer: ${course.lecturer}`,
    course.semester && `Semester: ${course.semester}`,
    course.academicYear && `Year: ${course.academicYear}`,
  ].filter(Boolean).join('\n');
}

function buildPrompt({
  course,
  topics,
  schedule,
  preferences,
  customInstructions,
  difficulty,
  sourceMaterial,
  lessonCount,
  lessonOffset = 0,
}) {
  const duration = schedule.lessonDuration || '60 minutes';
  const topicList = (topics || []).length
    ? topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')
    : 'Derive session topics only from the source materials.';
  const holidays = (schedule.holidays || []).map((holiday) => holiday.date || holiday).join(', ') || 'None';
  const methods = (preferences.teachingMethods || []).join(', ') || 'Lecture, demonstration, guided practice, practical exercises';
  const activities = (preferences.learningActivities || []).join(', ') || 'Guided practice, independent practice, Q&A';

  return `You are an experienced university/college lecturer writing classroom-ready lesson plans.

Create ${lessonCount} complete, teachable lesson plan(s) as JSON only.
These are lesson numbers ${lessonOffset + 1} to ${lessonOffset + lessonCount} in the course sequence.

COURSE / CLASS INFORMATION
${compactCourse(course) || 'Institution and class details not fully provided — leave unavailable fields as empty strings.'}
Difficulty: ${difficulty || 'Intermediate'}
Lesson duration each: ${duration}
Schedule window: ${schedule.startDate || 'TBD'} to ${schedule.endDate || 'TBD'}
Holidays/blocked days: ${holidays}
Preferred methods: ${methods}
Preferred activities: ${activities}
Extra instructions: ${customInstructions || 'None'}

TOPICS TO COVER ACROSS THESE LESSONS
${topicList}

SOURCE MATERIALS (primary authority — do not invent unrelated topics):
${sourceMaterial ? String(sourceMaterial).slice(0, 9000) : 'NONE PROVIDED'}

Return JSON with this exact shape:
{
  "courseName": "string",
  "courseCode": "string",
  "institution": "string",
  "level": "string",
  "lessons": [
    {
      "weekNumber": 1,
      "lessonNumber": 1,
      "lessonDate": "YYYY-MM-DD or empty",
      "duration": "${duration}",
      "durationMinutes": 60,
      "institution": "string",
      "subject": "string",
      "level": "string",
      "topic": "string",
      "subtopics": ["string"],
      "concepts": ["specific concepts covered in this lesson"],
      "learningObjectives": ["Students will be able to + measurable verb + content"],
      "learningResources": ["materials actually needed for THIS lesson"],
      "teachingMethods": ["methods suited to this subject/lesson"],
      "procedure": [
        {
          "stage": "Introduction",
          "durationMinutes": 5,
          "content": "what is covered in this stage",
          "teacherActivities": ["lecturer actions"],
          "studentActivities": ["learner actions"]
        },
        {
          "stage": "Lesson Development / Presentation",
          "durationMinutes": 15,
          "content": "detailed explanation of concepts",
          "teacherActivities": ["..."],
          "studentActivities": ["..."]
        },
        {
          "stage": "Demonstration",
          "durationMinutes": 10,
          "content": "practical demonstration focus",
          "teacherActivities": ["..."],
          "studentActivities": ["..."]
        },
        {
          "stage": "Guided Practice",
          "durationMinutes": 15,
          "content": "supported practice focus",
          "teacherActivities": ["..."],
          "studentActivities": ["..."]
        },
        {
          "stage": "Independent Practice",
          "durationMinutes": 10,
          "content": "independent work focus",
          "teacherActivities": ["..."],
          "studentActivities": ["..."]
        },
        {
          "stage": "Conclusion",
          "durationMinutes": 5,
          "content": "summary and reinforcement",
          "teacherActivities": ["..."],
          "studentActivities": ["..."]
        }
      ],
      "assessmentMethods": ["how learning will be checked against the objectives"],
      "conclusion": "key learning points summary",
      "homework": "follow-up / homework where appropriate, else empty string"
    }
  ],
  "warnings": []
}

STRICT RULES
- Produce teachable lesson plans, not topic summaries.
- Every lesson MUST include all six procedure stages with lecturer activities, student activities, content, and minutes.
- durationMinutes for procedure stages MUST sum exactly to the lesson durationMinutes.
- Objectives must use measurable verbs (identify, explain, demonstrate, compare, construct, analyse, implement, etc.).
- Materials, methods, activities and assessments must fit the actual lesson content and subject (e.g. PHP lessons need coding demos/exercises).
- Do not invent topics absent from the source materials/topic list.
- Vary activities across lessons; avoid copy-paste generic filler.
- Another lecturer should be able to teach from the procedure alone.
- If a detail is unknown (e.g. institution), use an empty string — do not fabricate facts.
- Return JSON only, no markdown.
`;
}

async function requestLessonBatch(payload, { lessonCount, lessonOffset, topics }) {
  const durationMinutes = Number(
    String(payload.schedule?.lessonDuration || '60').match(/(\d+)/)?.[1] || 60,
  );
  const maxOutputTokens = Math.min(16000, Math.max(4500, 1800 + lessonCount * 2200));

  const { data } = await completeJson(
    'You are an expert curriculum designer and lecturer. Return complete classroom-ready lesson plans as valid JSON only.',
    buildPrompt({
      ...payload,
      topics,
      lessonCount,
      lessonOffset,
    }),
    [],
    {
      temperature: 0.35,
      maxOutputTokens,
      timeout: 90000,
      preferredModels: [
        process.env.GEMINI_LESSON_MODEL,
        'gemini-3.5-flash',
        process.env.GEMINI_MODEL,
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
      ],
    },
  );

  const normalized = normalizeLessonPlan(data || {}, {
    courseName: payload.course?.courseName,
    courseCode: payload.course?.courseCode,
    institution: payload.course?.institution,
    level: payload.course?.level,
    lessonDuration: payload.schedule?.lessonDuration || `${durationMinutes} minutes`,
    lessonsPerWeek: payload.schedule?.lessonsPerWeek || 2,
  });

  // Ensure lesson numbers continue across batches.
  normalized.lessons = normalized.lessons.map((lesson, index) => normalizeLesson(lesson, {
    courseName: payload.course?.courseName,
    courseCode: payload.course?.courseCode,
    institution: payload.course?.institution,
    level: payload.course?.level,
    lessonDuration: payload.schedule?.lessonDuration || `${durationMinutes} minutes`,
    weekNumber: lesson.weekNumber || Math.floor((lessonOffset + index) / Math.max(1, Number(payload.schedule?.lessonsPerWeek) || 2)) + 1,
    lessonNumber: lessonOffset + index + 1,
  }));

  return normalized;
}

function splitTopics(topics, lessonCount) {
  const list = (topics || []).filter(Boolean);
  if (!list.length) return Array.from({ length: lessonCount }, () => []);
  if (list.length <= lessonCount) {
    return Array.from({ length: lessonCount }, (_, index) => (list[index] ? [list[index]] : [list[index % list.length]]));
  }
  const per = Math.ceil(list.length / lessonCount);
  return Array.from({ length: lessonCount }, (_, index) => list.slice(index * per, (index + 1) * per));
}

export async function generateLessonPlan(payload) {
  const weeks = Math.max(1, Number(payload.schedule?.numberOfWeeks) || 4);
  const lessonsPerWeek = Math.max(1, Number(payload.schedule?.lessonsPerWeek) || 2);
  const lessonCount = Math.min(weeks * lessonsPerWeek, 8);
  const topicSlices = splitTopics(payload.topics || [], lessonCount);

  // Detailed procedure plans are large — generate in small batches for completeness.
  const batchSize = lessonCount > 3 ? 2 : lessonCount;
  const lessons = [];
  const warnings = [];
  let courseName = payload.course?.courseName || '';
  let courseCode = payload.course?.courseCode || '';
  let institution = payload.course?.institution || '';
  let level = payload.course?.level || '';

  for (let offset = 0; offset < lessonCount; offset += batchSize) {
    const count = Math.min(batchSize, lessonCount - offset);
    const batchTopics = topicSlices
      .slice(offset, offset + count)
      .flat()
      .filter(Boolean);
    const uniqueTopics = [...new Set(batchTopics.length ? batchTopics : (payload.topics || []))];

    const batch = await requestLessonBatch(payload, {
      lessonCount: count,
      lessonOffset: offset,
      topics: uniqueTopics,
    });

    courseName = batch.courseName || courseName;
    courseCode = batch.courseCode || courseCode;
    institution = batch.institution || institution;
    level = batch.level || level;
    warnings.push(...(batch.warnings || []));
    lessons.push(...(batch.lessons || []).slice(0, count));
  }

  const plan = normalizeLessonPlan({
    courseName,
    courseCode,
    institution,
    level,
    lessons,
    warnings,
  }, {
    courseName,
    courseCode,
    institution,
    level,
    lessonDuration: payload.schedule?.lessonDuration,
    lessonsPerWeek,
  });

  const issues = validateLessonPlan(plan, {
    requireSourceGrounding: Boolean(payload.sourceMaterial),
    sourceMaterial: payload.sourceMaterial,
  });

  // Hard-fail only on critical structural gaps; keep mild grounding notes as warnings.
  const critical = issues.filter((issue) => !/does not appear grounded/i.test(issue));
  if (critical.length) {
    const error = new Error(`The generated lesson plan was incomplete: ${critical.slice(0, 3).join(' ')}`);
    error.status = 422;
    error.details = critical;
    throw error;
  }
  if (issues.length) {
    plan.warnings = [...new Set([...(plan.warnings || []), ...issues])];
  }

  if (!plan.lessons.length) {
    const error = new Error('The lesson plan could not be created from the supplied materials.');
    error.status = 422;
    throw error;
  }

  return plan;
}

export async function regenerateLesson(payload) {
  try {
    const { data } = await completeJson(
      'You are regenerating one classroom-ready lesson plan. Return the full lesson JSON only.',
      `Regenerate this lesson based on the instruction.
Keep the full professional structure: lesson information, topics/concepts, measurable objectives, materials, methods, 6-stage procedure (with teacher activities, student activities, content, minutes that sum to duration), assessment, conclusion and homework.

Instruction: ${payload.instruction}

Current lesson:
${JSON.stringify(payload.lesson)}

Return one complete lesson object with the same structured fields (including procedure).`,
      [],
      {
        temperature: 0.35,
        maxOutputTokens: 4500,
        timeout: 70000,
        preferredModels: [
          process.env.GEMINI_LESSON_MODEL,
          'gemini-3.5-flash',
          process.env.GEMINI_MODEL,
          'gemini-3.8-flash',
          'gemini-3.5-flash-lite',
        ],
      },
    );
    const lesson = normalizeLesson(data?.lesson || data || {}, {
      lessonDuration: payload.lesson?.duration || '60 minutes',
      courseName: payload.lesson?.subject,
      institution: payload.lesson?.institution,
      level: payload.lesson?.level,
    });
    const issues = validateLessonPlan({ lessons: [lesson] });
    const critical = issues.filter((issue) => !/does not appear grounded/i.test(issue));
    if (critical.length) {
      const error = new Error(`Regenerated lesson was incomplete: ${critical[0]}`);
      error.status = 422;
      throw error;
    }
    if (lesson.topic || lesson.learningObjectives?.length || lesson.procedure?.length) return lesson;
    const error = new Error('The AI did not return a usable regenerated lesson.');
    error.status = 502;
    throw error;
  } catch (error) {
    console.error('Lesson regeneration error:', error.response?.data || error.message);
    if (error.status) throw error;
    const failure = new Error(error.response?.data?.error || error.message || 'Lesson regeneration failed.');
    failure.status = 502;
    throw failure;
  }
}

export function generateObjectives(topic, difficulty) {
  const base = [
    `Explain the key ideas of ${topic} clearly.`,
    `Demonstrate a practical application of ${topic}.`,
    `Analyse a basic scenario involving ${topic}.`,
  ];
  if (difficulty === 'Beginner') return base.slice(0, 2);
  return base;
}

export function generateActivities(topic, methods) {
  return {
    teacherActivities: [
      `Introduce ${topic} with a clear explanation and worked example.`,
      `Demonstrate the topic using ${methods.join(', ') || 'practical exercises'}.`,
    ],
    studentActivities: [
      `Discuss ${topic} and ask clarifying questions.`,
      `Complete a guided activity on ${topic}.`,
    ],
  };
}
