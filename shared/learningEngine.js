export const DIFFICULTY_LEVELS = ['Easy', 'Intermediate', 'Advanced', 'Professional'];
export const QUESTION_TYPES = [
  { id: 'multiple-choice', label: 'Multiple choice' },
  { id: 'true-false', label: 'True/False' },
  { id: 'short-answer', label: 'Short answer' },
  { id: 'long-answer', label: 'Long answer' },
  { id: 'scenario', label: 'Scenario-based' },
  { id: 'practical', label: 'Practical/application' },
];

export const CONTENT_KINDS = [
  { id: 'analysis', label: 'Learning analysis' },
  { id: 'lesson-plan', label: 'Lesson plan' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'test', label: 'Test' },
  { id: 'practice', label: 'Practice questions' },
  { id: 'notes', label: 'Study notes' },
  { id: 'summary', label: 'Summary' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'revision', label: 'Revision material' },
  { id: 'activities', label: 'Learning activities' },
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function makeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function truncateText(text, max = 12000) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[Source truncated for processing.]`;
}

export function looksLikeReadablePhrase(text) {
  const value = String(text || '').trim();
  if (value.length < 8) return false;
  if (/[¦§¨³¶¼½¾ðÐþÞ�]/.test(value)) return false;
  const letters = (value.match(/[A-Za-z]/g) || []).length;
  if (letters < 8) return false;
  const weird = (value.match(/[^\w\s.,;:'"()?!+\-/%]/g) || []).length;
  if (weird > letters * 0.22) return false;
  const words = value.split(/\s+/).filter(Boolean);
  const real = words.filter((word) => /^[A-Za-z][A-Za-z'-]{1,}$/.test(word.replace(/[.,;:!?()"']+$/g, '')));
  if (words.length === 1) {
    return real.length === 1 && real[0].length >= 4;
  }
  return real.length >= Math.max(2, Math.floor(words.length * 0.45));
}

export function isReadableEducationalText(text) {
  const sample = String(text || '').replace(/\u0000/g, ' ').slice(0, 8000);
  if (!sample.trim()) return false;
  const tokens = sample.split(/\s+/).filter(Boolean);
  const realWords = tokens.filter((word) => /^[A-Za-z][A-Za-z'-]{2,24}$/.test(word.replace(/[.,;:!?()"']+$/g, '')));
  const ratio = realWords.length / Math.max(1, tokens.length);
  const mojibake = (sample.match(/[¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿À-ÿ�]/g) || []).length;
  if (realWords.length < 16) return false;
  if (ratio < 0.28) return false;
  if (mojibake / sample.length > 0.08) return false;
  return true;
}

export function readableWordCount(text) {
  return String(text || '')
    .split(/\s+/)
    .filter((word) => /^[A-Za-z][A-Za-z'-]{2,}$/.test(word.replace(/[.,;:!?()"']+$/g, ''))).length;
}

export function extractKeyPoints(text, limit = 24) {
  const raw = String(text || '').replace(/\u0000/g, ' ');
  if (!raw.trim()) return [];

  const sentences = raw
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 28 && item.length <= 360 && looksLikeReadablePhrase(item));

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-*\d.)]+/, '').trim())
    .filter((line) => line.length >= 18 && line.length <= 220 && looksLikeReadablePhrase(line));

  const combined = [];
  const seen = new Set();
  for (const item of [...sentences, ...lines]) {
    const key = item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    combined.push(item.replace(/\s+/g, ' ').trim());
    if (combined.length >= limit) break;
  }
  return combined;
}

export function extractTopics(text, limit = 10) {
  const raw = String(text || '');
  const headingLike = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length < 4 || line.length > 90) return false;
      if (/^https?:/i.test(line)) return false;
      return /^(unit|topic|chapter|module|lesson|week|\d+[.)])\b/i.test(line) || (/[A-Z]/.test(line[0]) && line.split(' ').length <= 10 && !/[.!?]$/.test(line));
    });

  const points = extractKeyPoints(raw, 16);
  const fromPoints = points.map((point) => {
    const clipped = point.split(/[:.–-]/)[0].trim();
    return clipped.length > 4 && clipped.length < 70 ? clipped : point.slice(0, 68);
  });

  const combined = [];
  const seen = new Set();
  for (const item of [...headingLike, ...fromPoints]) {
    const cleaned = item.replace(/^[\d.)\s-]+/, '').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key) || !looksLikeReadablePhrase(cleaned)) continue;
    seen.add(key);
    combined.push(cleaned);
    if (combined.length >= limit) break;
  }
  return combined;
}

export function detectDifficulty(message, fallback = 'Intermediate') {
  const text = String(message || '').toLowerCase();
  if (/\b(easy|beginner|introductory|basic)\b/.test(text)) return 'Easy';
  if (/\b(intermediate|standard|moderate)\b/.test(text)) return 'Intermediate';
  if (/\b(advanced|harder|more difficult|challenging)\b/.test(text)) return 'Advanced';
  if (/\b(professional|expert|industry|workplace)\b/.test(text)) return 'Professional';
  return DIFFICULTY_LEVELS.includes(fallback) ? fallback : 'Intermediate';
}

function nextWeekday(name, from = new Date()) {
  const target = WEEKDAYS.indexOf(name);
  if (target < 0) return null;
  const date = new Date(from);
  date.setHours(9, 0, 0, 0);
  const current = date.getDay();
  const daysAhead = (target + 7 - current) % 7 || 7;
  date.setDate(date.getDate() + daysAhead);
  return date;
}

export function parseScheduleRequest(message, from = new Date()) {
  const text = String(message || '').toLowerCase();
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return { date: iso[1], startTime: '09:00', endTime: '11:00', label: iso[1] };

  const tomorrow = /\btomorrow\b/.test(text);
  if (tomorrow) {
    const date = new Date(from);
    date.setDate(date.getDate() + 1);
    return formatScheduleDate(date, 'tomorrow');
  }

  const weekdayMatch = text.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const date = nextWeekday(weekdayMatch[2], from);
    if (date) return formatScheduleDate(date, weekdayMatch[0]);
  }

  if (/\bschedule|calendar|next week|book this|add to calendar\b/.test(text)) {
    const date = new Date(from);
    date.setDate(date.getDate() + 7);
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
    return formatScheduleDate(date, 'next teaching day');
  }

  return null;
}

function formatScheduleDate(date, label) {
  return {
    date: date.toISOString().slice(0, 10),
    startTime: '09:00',
    endTime: '11:00',
    label,
  };
}

export function parseLearningIntent(message, session = {}) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const difficulty = detectDifficulty(text, session.difficulty || 'Intermediate');
  const countMatch = lower.match(/(\d{1,3})\s*(question|questions|item|items|flashcard|flashcards|card|cards)?/);
  const count = countMatch ? Math.min(40, Math.max(1, Number(countMatch[1]))) : session.lastCount || 10;
  const marksMatch = lower.match(/(\d{1,3})\s*(marks?|points?)\s*(each|per question)?/);
  const totalMarksMatch = lower.match(/total(?:\s+of)?\s+(\d{1,3})\s*(marks?|points?)/);
  const timeMatch = lower.match(/(\d{1,3})\s*(minutes?|mins?|hours?)/);
  const includeMatch = lower.match(/include(?:s|ing)?\s+([^.]{3,80})/i);
  const excludeMatch = lower.match(/exclude(?:s|ing)?\s+([^.]{3,80})/i);

  const selectedTypes = QUESTION_TYPES.filter((type) => {
    if (type.id === 'multiple-choice') return /multiple choice|mcq|multi-choice/.test(lower);
    if (type.id === 'true-false') return /true\/?false|t\/f|true or false/.test(lower);
    if (type.id === 'short-answer') return /short answer/.test(lower);
    if (type.id === 'long-answer') return /long answer|essay/.test(lower);
    if (type.id === 'scenario') return /scenario/.test(lower);
    if (type.id === 'practical') return /practical|application/.test(lower);
    return false;
  }).map((type) => type.id);

  let kind = 'chat';
  if (/\b(make (it|this|them) (more )?(easy|advanced|professional|intermediate)|change .{0,40}(easy|advanced|professional|intermediate)|regenerate)\b/.test(lower) && session.lastKind) {
    kind = 'adjust-difficulty';
  } else if (/\badd\s+\d+/.test(lower) && session.lastKind) {
    kind = 'add-items';
  } else if (parseScheduleRequest(text) && /\b(schedule|calendar|friday|monday|tuesday|wednesday|thursday|sunday|tomorrow|next week)\b/.test(lower)) {
    kind = 'schedule';
  } else if (/flashcard/.test(lower)) kind = 'flashcards';
  else if (/\b(create (a |an )?(test|exam)|generate (a |an )?(test|exam)|formal exam)\b/.test(lower)) kind = 'test';
  else if (/\b(quiz me|test my knowledge|switch to quiz)\b/.test(lower)) kind = 'quiz';
  else if (/\b(create (a |an )?quiz|generate (a |an )?quiz)\b/.test(lower)) kind = 'quiz';
  else if (/\b(create (a |an )?assessment|generate (a |an )?assessment)\b/.test(lower)) kind = 'assessment';
  else if (/\bassignment\b/.test(lower)) kind = 'assignment';
  else if (/\blesson plan\b/.test(lower)) kind = 'lesson-plan';
  else if (/\brevision\b/.test(lower)) kind = 'revision';
  else if (/\bsummar/.test(lower)) kind = 'summary';
  else if (/\b(study )?notes\b/.test(lower)) kind = 'notes';
  else if (/\b(activit|practice question)/.test(lower)) kind = 'activities';
  else if (/\b(analy[sz]e|learning objective|key concept)\b/.test(lower)) kind = 'analysis';

  const questionTypes = selectedTypes.length
    ? selectedTypes
    : session.lastQuestionTypes || ['multiple-choice', 'true-false', 'short-answer'];

  return {
    kind,
    difficulty,
    count,
    marksPerQuestion: marksMatch ? Number(marksMatch[1]) : session.lastMarksPerQuestion || 2,
    totalMarks: totalMarksMatch ? Number(totalMarksMatch[1]) : null,
    timeAllowed: timeMatch ? `${timeMatch[1]} ${timeMatch[2]}` : session.lastTimeAllowed || `${Math.max(15, count * 2)} minutes`,
    topicsInclude: includeMatch ? includeMatch[1].trim() : session.lastInclude || '',
    topicsExclude: excludeMatch ? excludeMatch[1].trim() : session.lastExclude || '',
    questionTypes,
    schedule: parseScheduleRequest(text),
    raw: text,
  };
}

function difficultyInstruction(level) {
  switch (level) {
    case 'Easy':
      return 'Use plain language, definitions, recognition, and straightforward recall.';
    case 'Advanced':
      return 'Require analysis, comparison, justification, and multi-step thinking.';
    case 'Professional':
      return 'Frame tasks as workplace, teaching, or professional practice problems.';
    default:
      return 'Balance comprehension with application and short problem-solving.';
  }
}

function filterTopics(points, include, exclude) {
  let next = points;
  if (include) {
    const terms = include.toLowerCase().split(/,|\band\b/).map((item) => item.trim()).filter(Boolean);
    const filtered = next.filter((point) => terms.some((term) => point.toLowerCase().includes(term)));
    if (filtered.length) next = filtered;
  }
  if (exclude) {
    const terms = exclude.toLowerCase().split(/,|\band\b/).map((item) => item.trim()).filter(Boolean);
    next = next.filter((point) => !terms.some((term) => point.toLowerCase().includes(term)));
  }
  return next;
}

function wrapPrompt(point, type, difficulty, index) {
  const core = point.replace(/[.!?]+$/, '');
  if (type === 'true-false') return `True or false: ${core}.`;
  if (type === 'short-answer') {
    if (difficulty === 'Easy') return `In one or two sentences, explain: ${core}.`;
    return `Briefly explain the significance of this idea from the material: ${core}.`;
  }
  if (type === 'long-answer') return `Write a structured response discussing this idea from the source material: ${core}. Support your answer with details from the notes.`;
  if (type === 'scenario') return `Scenario ${index + 1}: A learner is working with this idea from the uploaded material: “${core}”. Describe how they should apply it and what mistakes to avoid.`;
  if (type === 'practical') return `Practical task: Using only the uploaded material, demonstrate how you would apply this point in a real teaching or work activity: ${core}.`;
  if (difficulty === 'Professional') return `Which professional implication best matches this statement from the current topic: “${core}”?`;
  if (difficulty === 'Advanced') return `Which statement best captures the deeper implication of this idea: “${core}”?`;
  return `Which option best matches this idea: “${core}”?`;
}

function makeOptions(point, bank, difficulty) {
  const correct = point.length > 110 ? `${point.slice(0, 107)}...` : point;
  const distractors = bank
    .filter((item) => item !== point)
    .slice(0, 6)
    .map((item) => (item.length > 110 ? `${item.slice(0, 107)}...` : item));
  while (distractors.length < 3) {
    distractors.push(difficulty === 'Easy'
      ? 'This idea is not covered in the uploaded material.'
      : 'The material only mentions this as an optional extension.');
  }
  const options = [correct, ...distractors.slice(0, 3)];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { options, answer: correct };
}

export function buildAssessmentFromMaterial({
  text,
  fileName,
  kind = 'quiz',
  difficulty = 'Intermediate',
  count = 10,
  questionTypes = ['multiple-choice', 'true-false', 'short-answer'],
  marksPerQuestion = 2,
  totalMarks = null,
  timeAllowed = '',
  topicsInclude = '',
  topicsExclude = '',
  extraItems = [],
}) {
  const points = filterTopics(extractKeyPoints(text, Math.max(count + 8, 16)), topicsInclude, topicsExclude);
  if (!points.length) {
    return {
      error: 'The uploaded material did not contain enough readable text to generate questions. Please try a different file or a text-based export.',
    };
  }

  const types = questionTypes.length ? questionTypes : ['multiple-choice'];
  const marks = Number(marksPerQuestion || 2);
  const questions = [];
  const needed = Math.max(1, Number(count || 10));

  for (let i = 0; needed > i; i += 1) {
    const point = points[i % points.length];
    const type = types[i % types.length];
    const base = {
      id: makeId('q'),
      type,
      prompt: wrapPrompt(point, type, difficulty, i),
      marks,
      topic: extractTopics(point, 1)[0] || fileName || 'Uploaded material',
      sourceExcerpt: point,
    };
    if (type === 'multiple-choice') {
      const { options, answer } = makeOptions(point, points, difficulty);
      questions.push({ ...base, options, answer });
    } else if (type === 'true-false') {
      questions.push({ ...base, options: ['True', 'False'], answer: 'True' });
    } else {
      questions.push({ ...base, options: [], answer: point });
    }
  }

  extraItems.forEach((item, index) => {
    questions.push({
      id: makeId('q'),
      type: item.type || 'scenario',
      prompt: item.prompt,
      options: item.options || [],
      answer: item.answer || item.sourceExcerpt || '',
      marks,
      topic: item.topic || 'Follow-up',
      sourceExcerpt: item.sourceExcerpt || '',
    });
    void index;
  });

  const computedTotal = Number(totalMarks || questions.reduce((sum, question) => sum + Number(question.marks || 0), 0));
  const titleKind = kind === 'test' ? 'Test' : kind === 'assessment' ? 'Assessment' : kind === 'practice' ? 'Practice set' : 'Quiz';

  return {
    id: makeId(kind),
    title: `${titleKind} from ${fileName || 'uploaded material'}`,
    kind,
    difficulty,
    questionTypes: types,
    questions,
    marksPerQuestion: marks,
    totalMarks: computedTotal,
    timeAllowed: timeAllowed || `${Math.max(15, questions.length * 2)} minutes`,
    topicsInclude,
    topicsExclude,
    sourceFile: fileName || '',
    status: 'draft',
    warning: needed > points.length ? `The source only provided ${points.length} distinct ideas, so some questions revisit the same concepts.` : '',
    createdAt: new Date().toISOString(),
  };
}

export function fallbackAnalyze(text, fileName = 'Uploaded material') {
  if (!isReadableEducationalText(text)) {
    return {
      error: `“${fileName}” did not contain enough readable teaching text. This often happens with scanned PDFs, image-only slides, or files whose text is encoded. Save it as Word, PowerPoint, or a text-based PDF and upload again. I will not publish scrambled characters as a lesson plan.`,
    };
  }
  const points = extractKeyPoints(text, 12);
  const topics = extractTopics(text, 8);
  const topic = topics[0] || fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  if (!points.length || !looksLikeReadablePhrase(topic)) {
    return {
      error: `“${fileName}” could not be analysed because no readable text was found. If this is a scanned PDF or an old .doc file, export it as PDF, DOCX, PPTX, or TXT and try again.`,
    };
  }

  const objectives = points.slice(0, 4).map((point) => {
    const clipped = point.length > 140 ? `${point.slice(0, 137)}...` : point;
    return `By the end of the session, learners should be able to explain: ${clipped}`;
  });

  return {
    topic,
    fileName,
    wordCount: readableWordCount(text),
    learningObjectives: objectives,
    keyConcepts: topics.slice(0, 8),
    lessonPlanOutline: topics.slice(0, 6).map((item, index) => ({
      stage: ['Connect', 'Teach', 'Practise', 'Apply', 'Review', 'Extend'][index] || `Stage ${index + 1}`,
      focus: item,
    })),
    recommendedActivities: [
      `Short discussion on ${topic}`,
      'Guided worked example drawn from the uploaded notes',
      'Paired activity using two key concepts from the file',
      'Exit ticket checking one idea from the material',
    ],
    assignmentIdeas: [
      `Summarise the core argument of ${topic} in 250 words using only the uploaded material.`,
      `Create a one-page teaching aid for the most important concept in ${fileName}.`,
    ],
    quizIdeas: points.slice(0, 5).map((point, index) => `Q${index + 1}. ${wrapPrompt(point, index % 2 ? 'short-answer' : 'multiple-choice', 'Intermediate', index)}`),
    assessmentIdeas: [
      'A short mixed quiz checking recall and application of the uploaded notes.',
      'A scenario task that asks learners to use one concept from the material in a realistic setting.',
    ],
    revisionMaterial: points.slice(0, 6),
    sourceReady: true,
  };
}

export function fallbackGenerate(kind, text, intent = {}, session = {}) {
  const fileName = session.materialName || 'uploaded material';
  const difficulty = intent.difficulty || session.difficulty || 'Intermediate';
  const points = extractKeyPoints(text, 18);
  if (!String(text || '').trim() && ['quiz', 'test', 'assessment', 'practice', 'notes', 'summary', 'flashcards', 'revision', 'lesson-plan', 'assignment', 'activities', 'analysis'].includes(kind)) {
    return {
      kind: 'chat',
      reply: 'Please upload a readable learning file first. I can only generate quizzes, notes, and lesson content from material I have actually processed.',
      usedSource: false,
    };
  }
  if (!points.length && kind !== 'chat' && kind !== 'schedule') {
    return {
      kind: 'chat',
      reply: `I could not extract usable teaching content from ${fileName}. I will not invent a generic quiz. Please upload a PDF, Word, PowerPoint, or text file with selectable text.`,
      usedSource: false,
    };
  }

  if (kind === 'analysis') {
    const analysis = fallbackAnalyze(text, fileName);
    return {
      kind: 'analysis',
      difficulty,
      analysis,
      reply: analysis.error || `I analysed ${fileName}. The main topic appears to be “${analysis.topic}”. Review the suggested learning plan, then choose an assessment, lesson, or revision option.`,
      usedSource: true,
    };
  }

  if (['quiz', 'test', 'assessment', 'practice'].includes(kind)) {
    const assessment = buildAssessmentFromMaterial({
      text,
      fileName,
      kind,
      difficulty,
      count: intent.count,
      questionTypes: intent.questionTypes,
      marksPerQuestion: intent.marksPerQuestion,
      totalMarks: intent.totalMarks,
      timeAllowed: intent.timeAllowed,
      topicsInclude: intent.topicsInclude,
      topicsExclude: intent.topicsExclude,
    });
    if (assessment.error) {
      return { kind: 'chat', reply: assessment.error, usedSource: false };
    }
    const article = /^[aeiou]/i.test(difficulty) ? 'an' : 'a';
    const warningText = assessment.warning ? ' ' + assessment.warning : '';
    return {
      kind,
      difficulty,
      assessment,
      reply: `I created ${article} ${difficulty.toLowerCase()} ${kind} with ${assessment.questions.length} questions from ${fileName}. ${difficultyInstruction(difficulty)} You can edit any question before publishing.${warningText}`,
      usedSource: true,
    };
  }

  if (kind === 'flashcards') {
    const cards = points.slice(0, intent.count || 10).map((point, index) => ({
      id: makeId('card'),
      front: extractTopics(point, 1)[0] || `Idea ${index + 1}`,
      back: point,
    }));
    return {
      kind: 'flashcards',
      difficulty,
      content: { title: `Flashcards from ${fileName}`, items: cards },
      reply: `I made ${cards.length} flashcards using phrases taken from ${fileName}.`,
      usedSource: true,
    };
  }

  if (kind === 'summary' || kind === 'notes' || kind === 'revision') {
    const topics = extractTopics(text, 8);
    const content = {
      title: `${kind === 'summary' ? 'Summary' : kind === 'revision' ? 'Revision sheet' : 'Study notes'} · ${fileName}`,
      overview: points.slice(0, 3).join(' '),
      sections: topics.map((topic, index) => ({
        heading: topic,
        body: points[index] || points[0],
      })),
      checklist: points.slice(0, 6).map((point) => point.replace(/[.!?]+$/, '')),
    };
    return {
      kind,
      difficulty,
      content,
      reply: `I prepared ${kind.replace('-', ' ')} from ${fileName} at ${difficulty.toLowerCase()} level. Nothing here was invented outside the source.`,
      usedSource: true,
    };
  }

  if (kind === 'lesson-plan') {
    const analysis = fallbackAnalyze(text, fileName);
    const plan = {
      title: `Lesson plan · ${analysis.topic}`,
      duration: '2 hours',
      difficulty,
      objectives: analysis.learningObjectives,
      stages: analysis.lessonPlanOutline,
      activities: analysis.recommendedActivities,
      assessment: analysis.assessmentIdeas[0],
      homework: analysis.assignmentIdeas[0],
    };
    return {
      kind: 'lesson-plan',
      difficulty,
      analysis,
      content: plan,
      reply: `I drafted a lesson plan on “${analysis.topic}” from ${fileName}. Review, edit, or approve it before publishing and scheduling.`,
      usedSource: true,
    };
  }

  if (kind === 'assignment' || kind === 'activities') {
    const analysis = fallbackAnalyze(text, fileName);
    const content = {
      title: kind === 'assignment' ? `Assignment · ${analysis.topic}` : `Learning activities · ${analysis.topic}`,
      items: kind === 'assignment' ? analysis.assignmentIdeas : analysis.recommendedActivities,
      successCriteria: analysis.learningObjectives.slice(0, 3),
    };
    return {
      kind,
      difficulty,
      content,
      analysis,
      reply: `Here are ${kind === 'assignment' ? 'assignment ideas' : 'learning activities'} drawn from ${fileName}.`,
      usedSource: true,
    };
  }

  if (kind === 'schedule') {
    const when = intent.schedule || parseScheduleRequest('next week');
    const title = session.lastTitle || session.lastAssessment?.title || session.lastContent?.title || `Teaching session · ${fileName}`;
    return {
      kind: 'schedule',
      calendarSuggestions: [{
        id: makeId('event'),
        title,
        description: session.lastReply || `Scheduled from the AI learning session using ${fileName}.`,
        type: session.lastKind === 'quiz' || session.lastKind === 'test' || session.lastKind === 'assessment' ? 'assessment' : 'lesson',
        date: when.date,
        startTime: when.startTime,
        endTime: when.endTime,
        status: 'suggested',
        source: 'ai',
      }],
      reply: `I proposed a calendar entry for ${when.label || when.date} at ${when.startTime}. It is only a suggestion until you approve it, and you can still change the date, time, or title.`,
      usedSource: Boolean(text),
    };
  }

  const analysis = text ? fallbackAnalyze(text, fileName) : null;
  const help = analysis && !analysis.error
    ? `I have ${fileName} ready. Ask me to create a quiz, test, assignment, notes, flashcards, lesson plan, or to schedule the work.`
    : 'Ask a teaching question, or upload lecture notes, a PDF, Word document, or PowerPoint so I can generate content from that material.';

  return {
    kind: 'chat',
    difficulty,
    analysis: analysis && !analysis.error ? analysis : null,
    reply: /^(hi|hello|hey)\b/i.test(intent.raw || '') ? `Hello. ${help}` : help,
    usedSource: Boolean(analysis && !analysis.error),
  };
}

export function applyFollowUp(intent, session, text) {
  if (intent.kind === 'adjust-difficulty') {
    const lastKind = ['quiz', 'test', 'assessment', 'practice'].includes(session.lastKind) ? session.lastKind : (session.lastAssessment ? 'quiz' : session.lastKind || 'quiz');
    return fallbackGenerate(lastKind === 'chat' ? 'quiz' : lastKind, text, { ...intent, kind: lastKind }, session);
  }

  if (intent.kind === 'add-items' && session.lastAssessment) {
    const extraCount = intent.count || 5;
    const extraType = intent.questionTypes[0] || 'scenario';
    const extra = buildAssessmentFromMaterial({
      text,
      fileName: session.materialName,
      kind: session.lastAssessment.kind || 'quiz',
      difficulty: intent.difficulty,
      count: extraCount,
      questionTypes: [extraType],
      marksPerQuestion: session.lastAssessment.marksPerQuestion,
      timeAllowed: session.lastAssessment.timeAllowed,
    });
    if (extra.error) return { kind: 'chat', reply: extra.error, usedSource: false };
    const merged = {
      ...session.lastAssessment,
      difficulty: intent.difficulty,
      questions: [...session.lastAssessment.questions, ...extra.questions],
    };
    merged.totalMarks = merged.questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
    return {
      kind: merged.kind || 'quiz',
      difficulty: intent.difficulty,
      assessment: merged,
      reply: `I added ${extra.questions.length} ${extraType.replace('-', ' ')} questions from the same source material. The set now has ${merged.questions.length} questions.`,
      usedSource: true,
    };
  }

  if (intent.kind === 'schedule') {
    return fallbackGenerate('schedule', text, intent, {
      ...session,
      lastTitle: session.lastAssessment?.title || session.lastContent?.title,
    });
  }

  return fallbackGenerate(intent.kind, text, intent, session);
}

export function suggestCalendarFromPlan(plan, courseMeta = {}) {
  const lessons = plan?.lessons || [];
  return lessons.slice(0, 24).map((lesson) => ({
    id: makeId('event'),
    title: `${plan.courseCode || courseMeta.courseCode || 'Lesson'} · ${lesson.topic}`,
    description: lesson.mainContent || lesson.introduction || lesson.topic,
    type: 'lesson',
    date: lesson.lessonDate,
    startTime: '09:00',
    endTime: '11:00',
    status: 'suggested',
    source: 'lesson-plan',
  })).filter((event) => event.date);
}

export function suggestCalendarFromAssessment(assessment, dateInfo) {
  if (!assessment) return [];
  const when = dateInfo || parseScheduleRequest('next friday') || parseScheduleRequest('next week');
  return [{
    id: makeId('event'),
    title: assessment.title,
    description: `${assessment.questions?.length || 0} questions · ${assessment.totalMarks} marks · ${assessment.timeAllowed}`,
    type: assessment.kind === 'test' ? 'exam' : 'assessment',
    date: when.date,
    startTime: when.startTime,
    endTime: when.endTime,
    status: 'suggested',
    source: 'ai',
    relatedId: assessment.id,
  }];
}
