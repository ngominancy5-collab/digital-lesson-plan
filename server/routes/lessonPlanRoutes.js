import express from 'express';
import { generateLessonPlan, regenerateLesson } from '../services/aiService.js';

const router = express.Router();

const memoryStore = {
  plans: [],
};

router.get('/', (_req, res) => {
  res.json({ plans: memoryStore.plans });
});

router.post('/generate', async (req, res) => {
  try {
    const payload = req.body;

    const required = ['courseName', 'courseCode', 'topics', 'startDate', 'endDate', 'lessonsPerWeek', 'lessonDuration'];
    const missing = required.filter((field) => {
      if (field === 'topics') return !Array.isArray(payload.topics) || payload.topics.length === 0;
      return !payload[field];
    });

    if (missing.length) {
      return res.status(400).json({ message: 'Please complete all required fields before generating the lesson plan.', missing });
    }

    const result = await generateLessonPlan({
      course: {
        courseName: payload.courseName,
        courseCode: payload.courseCode,
        programme: payload.programme,
        level: payload.level,
        department: payload.department,
        lecturer: payload.lecturer,
        semester: payload.semester,
        academicYear: payload.academicYear,
      },
      topics: payload.topics,
      schedule: {
        startDate: payload.startDate,
        endDate: payload.endDate,
        numberOfWeeks: payload.numberOfWeeks,
        lessonsPerWeek: payload.lessonsPerWeek,
        lessonDuration: payload.lessonDuration,
        holidays: payload.holidays || [],
      },
      preferences: {
        teachingMethods: payload.teachingMethods || [],
        learningActivities: payload.learningActivities || [],
      },
      customInstructions: payload.customInstructions || '',
      difficulty: payload.difficulty || 'Intermediate',
    });

    const savedPlan = {
      id: `plan-${Date.now()}`,
      courseName: result.courseName || payload.courseName,
      courseCode: result.courseCode || payload.courseCode,
      createdAt: new Date().toISOString(),
      lessons: result.lessons || [],
      warnings: result.warnings || [],
      status: 'Generated',
    };

    memoryStore.plans.unshift(savedPlan);
    return res.json(savedPlan);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to generate the lesson plan.', error: error.message });
  }
});

router.post('/regenerate', async (req, res) => {
  try {
    const { lesson, instruction } = req.body;
    if (!lesson) {
      return res.status(400).json({ message: 'Lesson content is required to regenerate.' });
    }

    const regenerated = await regenerateLesson({ lesson, instruction: instruction || 'Improve this lesson for teaching quality.' });
    return res.json({ lesson: regenerated });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to regenerate this lesson.', error: error.message });
  }
});

export default router;
