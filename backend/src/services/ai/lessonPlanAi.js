import dotenv from 'dotenv';
import { completeJson } from './aiClient.js';

dotenv.config();

function compactCourse(course = {}) {
  return [
    course.courseName && `Name: ${course.courseName}`,
    course.courseCode && `Code: ${course.courseCode}`,
    course.programme && `Programme: ${course.programme}`,
    course.level && `Level: ${course.level}`,
    course.department && `Department: ${course.department}`,
    course.lecturer && `Lecturer: ${course.lecturer}`,
    course.semester && `Semester: ${course.semester}`,
    course.academicYear && `Year: ${course.academicYear}`,
  ].filter(Boolean).join(' | ');
}

function buildPrompt({ course, topics, schedule, preferences, customInstructions, difficulty, sourceMaterial }) {
  const weeks = Math.max(1, Number(schedule.numberOfWeeks) || 4);
  const lessonsPerWeek = Math.max(1, Number(schedule.lessonsPerWeek) || 2);
  const lessonCount = weeks * lessonsPerWeek;
  const topicList = (topics || []).length
    ? topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')
    : 'Derive topics only from the source materials.';
  const holidays = (schedule.holidays || []).map((holiday) => holiday.date || holiday).join(', ') || 'None';
  const methods = (preferences.teachingMethods || []).join(', ') || 'Lecture, discussion, practice';
  const activities = (preferences.learningActivities || []).join(', ') || 'Guided practice';

  return `Create one complete teaching plan as JSON only.

Course: ${compactCourse(course) || 'Not specified'}
Difficulty: ${difficulty || 'Intermediate'}
Schedule: ${weeks} weeks, ${lessonsPerWeek} lessons/week (= ${lessonCount} lessons), duration ${schedule.lessonDuration || '60 minutes'}, start ${schedule.startDate || 'TBD'}, end ${schedule.endDate || 'TBD'}, holidays ${holidays}
Methods: ${methods}
Activities: ${activities}
Extra instructions: ${customInstructions || 'None'}

Topics to cover:
${topicList}

Source materials (use these; do not invent unsupported facts):
${sourceMaterial ? String(sourceMaterial).slice(0, 7800) : 'NONE PROVIDED'}

Return JSON:
{
  "courseName": "string",
  "courseCode": "string",
  "lessons": [
    {
      "weekNumber": 1,
      "lessonDate": "YYYY-MM-DD",
      "topic": "string",
      "subtopic": "string",
      "duration": "60 minutes",
      "learningObjectives": ["string"],
      "learningOutcomes": ["string"],
      "introduction": "string",
      "mainContent": "string",
      "teacherActivities": ["string"],
      "studentActivities": ["string"],
      "teachingMethods": ["string"],
      "learningResources": ["string"],
      "assessmentMethod": "string",
      "homework": "string",
      "notes": "string"
    }
  ],
  "warnings": []
}

Rules:
- Exactly ${lessonCount} lessons, one AI response, no markdown.
- Base every lesson on the source materials/topics above.
- Keep prose concise: intro/mainContent/notes/assessment/homework ≤ 2 short sentences each; arrays ≤ 3 short items.
- Prefer concrete teaching content from the materials over filler.
- If a field cannot be supported by the materials, use "Not provided in the source materials" and add a short warning.
- Respect holidays; distribute topics across the ${lessonCount} sessions.
`;
}

export async function generateLessonPlan(payload) {
  const weeks = Math.max(1, Number(payload.schedule?.numberOfWeeks) || 4);
  const lessonsPerWeek = Math.max(1, Number(payload.schedule?.lessonsPerWeek) || 2);
  const lessonCount = weeks * lessonsPerWeek;
  // Bound output size so the model finishes faster without dropping structure.
  const maxOutputTokens = Math.min(8192, Math.max(2800, 900 + lessonCount * 520));

  const { data } = await completeJson(
    'You are an expert lesson planner. Return compact valid JSON only. Do not invent unsupported content.',
    buildPrompt(payload),
    [],
    {
      temperature: 0.25,
      maxOutputTokens,
      timeout: 55000,
      preferredModels: [
        process.env.GEMINI_LESSON_MODEL,
        process.env.GEMINI_MODEL,
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
      ],
    },
  );
  if (!data?.lessons?.length) {
    const error = new Error('The lesson plan could not be created from the supplied materials.');
    error.status = 422;
    throw error;
  }
  return data;
}

export async function regenerateLesson(payload) {
  try {
    const { data } = await completeJson(
      'You are regenerating one lesson in an existing lesson plan. Return the lesson as JSON only.',
      `Regenerate this lesson based on the instruction. Keep the same fields. Keep text concise (≤2 sentences per prose field, ≤3 array items).

Instruction: ${payload.instruction}

Current lesson:
${JSON.stringify(payload.lesson)}

Return the full lesson object only.`,
      [],
      {
        temperature: 0.3,
        maxOutputTokens: 1800,
        timeout: 40000,
        preferredModels: [
          process.env.GEMINI_LESSON_MODEL,
          process.env.GEMINI_MODEL,
          'gemini-3.5-flash-lite',
          'gemini-3.5-flash',
          'gemini-3.8-flash',
        ],
      },
    );
    if (data && (data.topic || data.learningOutcomes || data.mainContent)) return data;
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
    `Define and explain ${topic} clearly.`,
    `Apply the concept of ${topic} in a practical example.`,
    `Evaluate a basic scenario involving ${topic}.`,
  ];

  if (difficulty === 'Beginner') {
    return base.slice(0, 2);
  }

  return base;
}

export function generateActivities(topic, methods) {
  return {
    teacherActivities: [
      `Introduce ${topic} using a clear explanation and examples.`,
      `Demonstrate the topic with a short worked example.`,
    ],
    studentActivities: [
      `Participate in a short discussion on ${topic}.`,
      `Complete a guided activity using ${methods.join(', ') || 'practical exercises'}.`,
    ],
  };
}
