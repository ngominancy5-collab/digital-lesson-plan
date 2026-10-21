import dotenv from 'dotenv';
import { completeJson } from './aiClient.js';

dotenv.config();

function buildPrompt({ course, topics, schedule, preferences, customInstructions, difficulty, sourceMaterial }) {
  const topicList = topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n');
  const holidays = (schedule.holidays || []).map((holiday) => holiday.date || holiday).join(', ') || 'None';

  return `You are a university lesson planner. Generate a structured lesson plan.

Course information:
- Course Name: ${course.courseName}
- Course Code: ${course.courseCode}
- Programme: ${course.programme}
- Level: ${course.level}
- Department: ${course.department}
- Lecturer: ${course.lecturer}
- Semester: ${course.semester}
- Academic Year: ${course.academicYear}

Course topics:
${topicList}

Schedule:
- Start Date: ${schedule.startDate}
- End Date: ${schedule.endDate}
- Weeks: ${schedule.numberOfWeeks}
- Lessons per Week: ${schedule.lessonsPerWeek}
- Lesson Duration: ${schedule.lessonDuration}
- Holidays/Blocked Days: ${holidays}

Preferences:
- Teaching Methods: ${(preferences.teachingMethods || []).join(', ') || 'Not specified'}
- Learning Activities: ${(preferences.learningActivities || []).join(', ') || 'Not specified'}
- Difficulty: ${difficulty || 'Intermediate'}
- Custom Instructions: ${customInstructions || 'None'}

Source materials supplied by the teacher:
${sourceMaterial ? String(sourceMaterial).slice(0, 12000) : 'NONE PROVIDED'}

Return valid JSON with this exact structure:
{
  "courseName": "string",
  "courseCode": "string",
  "lessons": [
    {
      "weekNumber": 1,
      "lessonDate": "YYYY-MM-DD",
      "topic": "string",
      "subtopic": "string",
      "duration": "2 hours",
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
- Use only the course fields, topics, notes, and source materials supplied above.
- Do not invent lesson content, learning objectives, activities, examples, or facts that those materials do not support.
- If a section cannot be filled, write "Not provided in the source materials" and add a warning that names what is missing.
- Include homework only when the materials mention follow-up work.
- Do not add topics the teacher did not list and that do not appear in the source materials.
- Organize the supplied topics across the available teaching periods.
- Respect blocked dates and avoid scheduling on holidays.
- If required session count exceeds availability, include a warning string in warnings.
- Do not include markdown fences or comments.
`;
}

export async function generateLessonPlan(payload) {
  const { data } = await completeJson(
    'You are a helpful educational assistant. Create a lesson plan only from the materials the teacher supplied. Return JSON only.',
    buildPrompt(payload),
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
      `Regenerate this lesson based on the instruction. Keep structure consistent and maintain professionalism.

Instruction: ${payload.instruction}

Current lesson:
${JSON.stringify(payload.lesson, null, 2)}

Return the full lesson object with the same fields.`,
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

function fallbackLessonPlan(payload) {
  const topics = payload.topics || [];
  const weeks = Number(payload.schedule?.numberOfWeeks || 1);
  const lessonsPerWeek = Number(payload.schedule?.lessonsPerWeek || 1);
  const totalSlots = Math.max(1, weeks * lessonsPerWeek);
  const lessonList = [];

  const availableDates = buildAvailableDates(payload.schedule);

  topics.forEach((topic, idx) => {
    const slotIndex = idx % totalSlots;
    const lessonDate = availableDates[Math.min(slotIndex, availableDates.length - 1)] || new Date().toISOString().slice(0, 10);

    lessonList.push({
      weekNumber: Math.floor(slotIndex / lessonsPerWeek) + 1,
      lessonDate,
      topic,
      subtopic: topic,
      duration: payload.schedule?.lessonDuration || '2 hours',
      learningObjectives: generateObjectives(topic, payload.difficulty),
      learningOutcomes: [`Students can explain ${topic} confidently.`, `Students can apply ${topic} in practice.`],
      introduction: `This lesson introduces ${topic} in a clear and structured way.`,
      mainContent: `The class will focus on the core concepts and practical applications of ${topic}.`,
      teacherActivities: [`Introduce ${topic}.`, 'Model a worked example.', 'Facilitate guided discussion.'],
      studentActivities: ['Participate in class discussion.', 'Complete guided practice.', 'Ask and answer questions.'],
      teachingMethods: payload.preferences?.teachingMethods || ['Lecture', 'Discussion'],
      learningResources: ['Course notes', 'Projector', 'Learning materials'],
      assessmentMethod: 'Short in-class assessment and discussion participation.',
      homework: `Review and practice the key points from ${topic}.`,
      notes: 'Prepared according to the stated teaching preferences and difficulty level.',
    });
  });

  return {
    courseName: payload.course?.courseName || 'Course',
    courseCode: payload.course?.courseCode || 'COURSE',
    lessons: lessonList,
    warnings: topics.length > totalSlots ? ['There are more topics than available teaching sessions. Consider increasing lessons per week or extending the course period.'] : [],
  };
}

function fallbackRegeneratedLesson({ lesson, instruction }) {
  const copied = { ...lesson };
  copied.notes = instruction || copied.notes || 'Regenerated for improved alignment.';
  copied.teachingMethods = [...new Set([...(copied.teachingMethods || []), 'Practical'])];
  copied.studentActivities = [...(copied.studentActivities || []), 'Complete a targeted activity based on the teacher instruction.'];
  return copied;
}

function buildAvailableDates(schedule) {
  const dates = [];
  const start = schedule?.startDate ? new Date(schedule.startDate) : new Date();
  let cursor = new Date(start);
  const end = schedule?.endDate ? new Date(schedule.endDate) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 12);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
