const MEASURABLE_VERBS = /\b(identify|explain|describe|demonstrate|compare|contrast|construct|analyse|analyze|apply|evaluate|create|design|calculate|implement|develop|discuss|summarise|summarize|differentiate|classify|solve|write|build|test|debug|use|perform|produce|prepare|outline|justify|interpret|organise|organize)\b/i;

const REQUIRED_STAGES = [
  'Introduction',
  'Lesson Development / Presentation',
  'Demonstration',
  'Guided Practice',
  'Independent Practice',
  'Conclusion',
];

export function parseDurationMinutes(value, fallback = 60) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  const text = String(value || '').toLowerCase();
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  let total = 0;
  if (hourMatch) total += Number(hourMatch[1]) * 60;
  if (minMatch) total += Number(minMatch[1]);
  if (!total) {
    const bare = text.match(/(\d+(?:\.\d+)?)/);
    if (bare) total = Number(bare[1]);
  }
  return total > 0 ? Math.round(total) : fallback;
}

function asList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(/\r?\n|•|;|\|/g).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function stageName(raw, index) {
  const text = String(raw || '').trim();
  if (!text) return REQUIRED_STAGES[index] || `Stage ${index + 1}`;
  const lower = text.toLowerCase();
  if (lower.includes('intro')) return 'Introduction';
  if (lower.includes('develop') || lower.includes('present')) return 'Lesson Development / Presentation';
  if (lower.includes('demo')) return 'Demonstration';
  if (lower.includes('guided')) return 'Guided Practice';
  if (lower.includes('independent') || lower.includes('individ')) return 'Independent Practice';
  if (lower.includes('conclu') || lower.includes('summary') || lower.includes('wrap')) return 'Conclusion';
  return text;
}

function normalizeProcedure(procedure, durationMinutes) {
  const incoming = Array.isArray(procedure) ? procedure : [];
  const stages = REQUIRED_STAGES.map((name, index) => {
    const found = incoming.find((item, idx) => stageName(item?.stage || item?.name, idx) === name)
      || incoming[index]
      || {};
    return {
      stage: name,
      durationMinutes: Math.max(1, parseDurationMinutes(found.durationMinutes ?? found.duration ?? found.time, 0) || 0),
      content: String(found.content || found.focus || found.description || '').trim(),
      teacherActivities: asList(found.teacherActivities || found.teacher || found.lecturerActivities),
      studentActivities: asList(found.studentActivities || found.student || found.learnerActivities),
    };
  });

  const assigned = stages.reduce((sum, stage) => sum + (stage.durationMinutes || 0), 0);
  if (!assigned || Math.abs(assigned - durationMinutes) > 2) {
    // Redistribute evenly with slightly more time for development/practice.
    const weights = [0.1, 0.3, 0.15, 0.2, 0.15, 0.1];
    let used = 0;
    stages.forEach((stage, index) => {
      if (index === stages.length - 1) {
        stage.durationMinutes = Math.max(1, durationMinutes - used);
      } else {
        stage.durationMinutes = Math.max(1, Math.round(durationMinutes * weights[index]));
        used += stage.durationMinutes;
      }
    });
  }

  return stages;
}

function flattenActivities(procedure, key) {
  return procedure.flatMap((stage) => (stage[key] || []).map((item) => `${stage.stage}: ${item}`));
}

export function normalizeLesson(raw = {}, context = {}) {
  const durationMinutes = parseDurationMinutes(
    raw.durationMinutes ?? raw.duration ?? context.lessonDuration,
    parseDurationMinutes(context.lessonDuration, 60),
  );
  const procedure = normalizeProcedure(raw.procedure || raw.lessonProcedure || raw.stages, durationMinutes);
  const learningObjectives = asList(raw.learningObjectives || raw.objectives);
  const learningOutcomes = asList(raw.learningOutcomes || raw.outcomes);
  const teachingMethods = asList(raw.teachingMethods || raw.methods);
  const learningResources = asList(raw.learningResources || raw.materials || raw.teachingMaterials);
  const assessmentMethods = asList(raw.assessmentMethods || raw.assessment || raw.assessmentMethod);
  const subtopics = asList(raw.subtopics || raw.subTopics);
  const concepts = asList(raw.concepts || raw.contentPoints || raw.keyConcepts);
  const topic = String(raw.topic || raw.title || concepts[0] || 'Lesson topic').trim();
  const subtopic = String(raw.subtopic || subtopics[0] || '').trim();
  const teacherActivities = asList(raw.teacherActivities).length
    ? asList(raw.teacherActivities)
    : flattenActivities(procedure, 'teacherActivities');
  const studentActivities = asList(raw.studentActivities).length
    ? asList(raw.studentActivities)
    : flattenActivities(procedure, 'studentActivities');
  const introduction = String(raw.introduction || procedure[0]?.content || '').trim();
  const mainContent = String(
    raw.mainContent
    || procedure.find((stage) => stage.stage.startsWith('Lesson Development'))?.content
    || concepts.join('; '),
  ).trim();
  const conclusion = String(raw.conclusion || procedure.at(-1)?.content || raw.notes || '').trim();
  const homework = String(raw.homework || raw.followUp || raw.followUpActivities || '').trim();
  const assessmentMethod = assessmentMethods.join('; ') || String(raw.assessmentMethod || '').trim();

  return {
    weekNumber: Number(raw.weekNumber) || Number(context.weekNumber) || 1,
    lessonNumber: Number(raw.lessonNumber) || Number(context.lessonNumber) || 1,
    lessonDate: String(raw.lessonDate || context.lessonDate || '').trim(),
    duration: String(raw.duration || `${durationMinutes} minutes`).trim(),
    durationMinutes,
    institution: String(raw.institution || context.institution || '').trim(),
    subject: String(raw.subject || context.courseName || '').trim(),
    level: String(raw.level || context.level || '').trim(),
    topic,
    subtopic,
    subtopics: subtopics.length ? subtopics : (subtopic ? [subtopic] : []),
    concepts,
    learningObjectives,
    learningOutcomes: learningOutcomes.length ? learningOutcomes : learningObjectives.slice(0, 3),
    learningResources,
    teachingMethods,
    procedure,
    assessmentMethods: assessmentMethods.length ? assessmentMethods : (assessmentMethod ? [assessmentMethod] : []),
    assessmentMethod,
    conclusion,
    homework,
    notes: String(raw.notes || '').trim(),
    introduction,
    mainContent,
    teacherActivities,
    studentActivities,
  };
}

export function normalizeLessonPlan(data = {}, context = {}) {
  const lessons = Array.isArray(data.lessons) ? data.lessons : [];
  const normalizedLessons = lessons.map((lesson, index) => normalizeLesson(lesson, {
    ...context,
    weekNumber: lesson?.weekNumber || Math.floor(index / Math.max(1, Number(context.lessonsPerWeek) || 2)) + 1,
    lessonNumber: lesson?.lessonNumber || index + 1,
  }));
  return {
    courseName: String(data.courseName || context.courseName || '').trim(),
    courseCode: String(data.courseCode || context.courseCode || '').trim(),
    institution: String(data.institution || context.institution || '').trim(),
    level: String(data.level || context.level || '').trim(),
    lessons: normalizedLessons,
    warnings: asList(data.warnings),
  };
}

export function validateLesson(lesson, options = {}) {
  const issues = [];
  if (!lesson?.topic || /not provided/i.test(lesson.topic)) {
    issues.push('Missing lesson topic.');
  }
  if (!lesson.learningObjectives?.length) {
    issues.push('Missing learning objectives.');
  } else {
    const measurable = lesson.learningObjectives.filter((item) => MEASURABLE_VERBS.test(item));
    if (!measurable.length) {
      issues.push('Learning objectives need measurable action verbs (e.g. explain, demonstrate, analyse).');
    }
  }
  if (!lesson.procedure?.length || lesson.procedure.length < 4) {
    issues.push('Lesson procedure is incomplete.');
  } else {
    const missingTeacher = lesson.procedure.some((stage) => !stage.teacherActivities?.length);
    const missingStudent = lesson.procedure.some((stage) => !stage.studentActivities?.length);
    if (missingTeacher) issues.push('Every procedure stage needs lecturer/teacher activities.');
    if (missingStudent) issues.push('Every procedure stage needs student/learner activities.');
    const sum = lesson.procedure.reduce((total, stage) => total + Number(stage.durationMinutes || 0), 0);
    if (Math.abs(sum - Number(lesson.durationMinutes || 0)) > 2) {
      issues.push(`Procedure time (${sum} min) does not match lesson duration (${lesson.durationMinutes} min).`);
    }
  }
  if (!lesson.teachingMethods?.length) issues.push('Missing teaching methods.');
  if (!lesson.learningResources?.length) issues.push('Missing teaching and learning materials.');
  if (!lesson.assessmentMethods?.length && !lesson.assessmentMethod) {
    issues.push('Missing assessment / evaluation methods.');
  }
  if (!lesson.conclusion && !lesson.homework) {
    issues.push('Missing conclusion or follow-up activities.');
  }
  if (options.requireSourceGrounding && options.sourceMaterial) {
    const haystack = String(options.sourceMaterial).toLowerCase();
    const topicWords = String(lesson.topic || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 4)
      .slice(0, 4);
    if (topicWords.length && !topicWords.some((word) => haystack.includes(word))) {
      issues.push(`Topic "${lesson.topic}" does not appear grounded in the uploaded materials.`);
    }
  }
  return issues;
}

export function validateLessonPlan(plan, options = {}) {
  const issues = [];
  if (!plan?.lessons?.length) {
    return ['No lessons were generated.'];
  }
  plan.lessons.forEach((lesson, index) => {
    validateLesson(lesson, options).forEach((issue) => {
      issues.push(`Lesson ${index + 1}: ${issue}`);
    });
  });
  return issues;
}

export { REQUIRED_STAGES, MEASURABLE_VERBS };
