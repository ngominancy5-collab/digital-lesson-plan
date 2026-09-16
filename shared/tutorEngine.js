import {
  buildAssessmentFromMaterial,
  detectDifficulty,
  extractKeyPoints,
  extractTopics,
  fallbackAnalyze,
  fallbackGenerate,
  makeId,
  parseLearningIntent,
  parseScheduleRequest,
  suggestCalendarFromAssessment,
} from './learningEngine.js';

export const LEARNING_MODES = [
  { id: 'tutor', label: 'Tutor' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'revision', label: 'Revision' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'exam-prep', label: 'Exam prep' },
];

const TOPIC_LIBRARY = {
  normalization: {
    title: 'Normalization',
    keywords: ['normalization', 'normalisation', '1nf', '2nf', '3nf', 'bcnf'],
    explain: [
      'Normalization organises a relational database so that each fact is stored once, in the right place.',
      '',
      '1. First Normal Form (1NF): every field holds a single value, and repeating groups are removed.',
      '2. Second Normal Form (2NF): the table is in 1NF, and every non-key attribute depends on the whole primary key, not part of it.',
      '3. Third Normal Form (3NF): the table is in 2NF, and non-key attributes do not depend on other non-key attributes.',
      '',
      'The aim is to reduce update anomalies, duplication, and inconsistent data.',
    ].join('\n'),
    example: 'Real-world example: a student registration list that stores course name, lecturer, and lecturer office in every student row. If the lecturer moves office, you would have to update every student row. After normalization, students, courses, and lecturers live in separate tables, so the office is stored once.',
    practice: 'Try this: a table StudentCourse(studentId, studentName, courseId, courseName, lecturerName). Which attributes should move into their own tables to reach 3NF?',
  },
  joins: {
    title: 'SQL JOINs',
    keywords: ['join', 'joins', 'inner join', 'left join', 'right join', 'outer join'],
    explain: [
      'A JOIN combines rows from two or more tables using a related column.',
      '',
      '- INNER JOIN returns only matching rows in both tables.',
      '- LEFT JOIN returns all rows from the left table, and matches from the right table (or NULL if none).',
      '- RIGHT JOIN is the opposite of LEFT JOIN.',
      '- FULL OUTER JOIN returns rows when there is a match in either table.',
      '',
      'The ON clause states the relationship, usually a primary key to a foreign key.',
    ].join('\n'),
    example: 'Real-world example: Students(id, name) and Enrolments(studentId, course). INNER JOIN shows only students who enrolled. LEFT JOIN from Students shows every student, including those with no enrolment yet — useful for finding students who have not registered.',
    practice: 'Write an INNER JOIN that lists each student name with the course they enrolled in, then change it to a LEFT JOIN and explain which extra rows appear.',
  },
  sql: {
    title: 'SQL',
    keywords: ['sql', 'select', 'query', 'structured query'],
    explain: [
      'SQL (Structured Query Language) is how you ask a relational database for data or tell it to change data.',
      '',
      'Core commands:',
      '- SELECT retrieves rows.',
      '- INSERT adds rows.',
      '- UPDATE changes rows.',
      '- DELETE removes rows.',
      '- CREATE TABLE defines structure.',
      '',
      'A typical SELECT has SELECT columns, FROM a table, optional WHERE filters, JOIN related tables, GROUP BY aggregates, and ORDER BY sorting.',
    ].join('\n'),
    example: [
      'SELECT s.name, c.title',
      'FROM students s',
      'INNER JOIN enrolments e ON e.studentId = s.id',
      'INNER JOIN courses c ON c.id = e.courseId',
      "WHERE c.title LIKE '%Database%';",
    ].join('\n'),
    practice: 'Ask me to walk through SELECT, WHERE, or JOINs one at a time, or say “quiz me on SQL”.',
  },
  databases: {
    title: 'Database Management',
    keywords: ['database management', 'dbms', 'relational database', 'databases'],
    explain: 'Database Management is about storing, organising, securing and retrieving data, usually with a relational DBMS such as MySQL or PostgreSQL. Core ideas include tables, keys, relationships, SQL, normalization and transactions.',
    example: 'A university keeps students, courses and enrolments in related tables. The DBMS enforces keys so an enrolment cannot point at a student that does not exist.',
    practice: 'Name three problems that appear when student, course and lecturer details are stored in one spreadsheet-style table.',
  },
  er: {
    title: 'ER diagrams',
    keywords: ['er diagram', 'entity relationship', 'entities', 'relationships'],
    explain: 'An Entity-Relationship diagram models data before you build tables. Entities are things you store (Student, Course). Attributes describe them. Relationships show how they connect, including one-to-one, one-to-many, and many-to-many.',
    example: 'A Student enrols in many Courses, and a Course has many Students. That many-to-many relationship usually becomes an Enrolment table in the physical design.',
    practice: 'Name the entities, attributes, and relationship type for a library with books, copies, and borrowers.',
  },
};

function firstName(profile = {}) {
  return String(profile.name || 'there').split(' ')[0] || 'there';
}

function isLecturerRole(role = '') {
  return /lecturer|teacher|coordinator|administrator/i.test(role);
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function answersMatch(given, expected) {
  const a = normalize(given);
  const b = normalize(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 3 && (b.includes(a) || a.includes(b))) return true;
  if (['true', 't', 'yes'].includes(a) && ['true', 't', 'yes'].includes(b)) return true;
  if (['false', 'f', 'no'].includes(a) && ['false', 'f', 'no'].includes(b)) return true;
  const letter = a.match(/^[a-d]$/);
  return Boolean(letter);
}

function matchLibraryTopic(text) {
  const lower = String(text || '').toLowerCase();
  return Object.values(TOPIC_LIBRARY).find((topic) => topic.keywords.some((key) => lower.includes(key))) || null;
}

function extractSubject(message, session = {}) {
  const text = String(message || '');
  const patterns = [
    /want to study\s+([^?.!]{3,60})/i,
    /studying\s+([^?.!]{3,60})/i,
    /help (?:me )?(?:with|study)\s+([^?.!]{3,60})/i,
    /subject(?:\s+is)?\s+([^?.!]{3,60})/i,
    /course(?:\s+is)?\s+([^?.!]{3,60})/i,
    /\bstudy\s+(?!plan\b)([^?.!]{3,60})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/\b(please|today|now|for my exam)\b/gi, '').trim();
      if (cleaned.length > 2) return cleaned.replace(/\.$/, '');
    }
  }
  const library = matchLibraryTopic(text);
  if (library && text.length > 18 && !session.subject) return library.title;
  return session.subject || '';
}

function extractFocusTopics(message, session = {}) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const known = Object.values(TOPIC_LIBRARY).filter((topic) => topic.keywords.some((key) => lower.includes(key))).map((topic) => topic.title);
  const struggle = text.match(/(?:struggling with|focus on|especially|topics?(?: are)?)\s+([^?.!]+)/i);
  const extra = struggle
    ? struggle[1].split(/,| and /i).map((item) => item.trim()).filter((item) => item.length > 2 && item.length < 40)
    : [];
  const combined = [];
  [...known, ...extra].forEach((item) => {
    if (!combined.some((existing) => existing.toLowerCase() === item.toLowerCase())) combined.push(item);
  });
  if (combined.includes('SQL JOINs')) {
    return combined.filter((item) => item !== 'SQL').slice(0, 6);
  }
  if (combined.length) return combined.slice(0, 6);
  return session.topics || [];
}

function pointsForTopic(materialText, topic) {
  const points = extractKeyPoints(materialText, 24);
  if (!topic) return points;
  const terms = String(topic).toLowerCase().split(/\s+/).filter((item) => item.length > 3);
  const matched = points.filter((point) => terms.some((term) => point.toLowerCase().includes(term)));
  return matched.length ? matched : points;
}

function explainFromSource(materialText, materialName, topic, difficulty) {
  const points = pointsForTopic(materialText, topic).slice(0, difficulty === 'Easy' ? 3 : 5);
  if (!points.length) return null;
  const numbered = points.map((point, index) => (index + 1) + '. ' + point).join('\n\n');
  return 'From ' + materialName + ', here is ' + (topic || 'the idea') + ' in ' + difficulty.toLowerCase() + ' terms:\n\n' + numbered;
}

function detectMode(message, session = {}) {
  const lower = String(message || '').toLowerCase();
  if (/\b(quiz me|test me|test my knowledge|switch to quiz|quiz mode)\b/.test(lower)) return 'quiz';
  if (/\b(revise|revision mode|help me revise|summarise what we have learned)\b/.test(lower)) return 'revision';
  if (/\b(exam prep|exam coming|study plan|prepare for (the |my )?exam)\b/.test(lower)) return 'exam-prep';
  if (/\b(assignment mode|create (an |a )assignment)\b/.test(lower)) return 'assignment';
  if (/\b(assessment mode|create (an |a )assessment|create (a )?test)\b/.test(lower) && !/test my knowledge/.test(lower)) return 'assessment';
  if (/\b(tutor mode|explain|teach me|help me (understand|study))\b/.test(lower)) return 'tutor';
  return session.mode || 'tutor';
}

function isControlCommand(message) {
  const lower = String(message || '').toLowerCase();
  return /\b(quiz me|now quiz me|test me|stop quiz|end quiz|make it (harder|easier|advanced|simpler|professional)|make it \d+|professional level|\d+\s*marks|add \d+|give me \d+ more|explain|switch to|create |schedule|summarise|flashcard|lesson plan|assignment|assessment|use this (file|material|document|notes)|previous answer|why was .{0,20}wrong)\b/.test(lower);
}

function naturalTopicReply(guide, { simple = false, exampleOnly = false, fromDoc = null } = {}) {
  if (exampleOnly) {
    const example = fromDoc || guide?.example;
    if (!example) return 'Tell me which idea you want an example for — for example normalization, JOINs, or a heading from your notes.';
    return `Of course. Here is a simple way to see ${guide?.title || 'this idea'} in practice.\n\n${example}\n\nWant me to walk through it more slowly, or quiz you on it?`;
  }
  if (fromDoc) {
    return `Absolutely — I will stick to your uploaded notes for this.\n\n${fromDoc}\n\nI can simplify that, give a worked example, or quiz you next. What would help?`;
  }
  if (!guide) return 'Tell me which idea you mean — for example normalization, JOINs, or a heading from your uploaded notes.';
  const body = simple ? guide.explain.split('\n').filter(Boolean)[0] : guide.explain;
  return `Absolutely. Let's work through ${guide.title} step by step.\n\n${body}\n\n${guide.example}\n\n${guide.practice}\n\nIf any part is still unclear, say which sentence to unpack, or ask me to quiz you.`;
}

function formatQuestion(quiz) {
  const question = quiz.questions[quiz.index];
  if (!question) return '';
  const options = (question.options || []).map((option, index) => String.fromCharCode(65 + index) + '. ' + option).join('\n');
  const optionBlock = options ? '\n\n' + options : '\n\nType your answer.';
  return 'Question ' + (quiz.index + 1) + ' of ' + quiz.questions.length + ':\n\n' + question.prompt + optionBlock;
}

function startQuiz({ session, materialText, materialName, count = 5, difficulty, questionTypes, role }) {
  const names = [...(session.topics || []), session.subject].filter(Boolean);
  const libraryText = names.map((name) => {
    const guide = matchLibraryTopic(name);
    return guide ? `${guide.title}\n${guide.explain}\n${guide.example}` : `${name} is an important idea in ${session.subject || 'this subject'}. Learners should be able to explain and apply ${name}.`;
  }).join('\n\n');
  const sourceText = materialText || libraryText;

  const assessment = buildAssessmentFromMaterial({
    text: sourceText,
    fileName: materialName || session.subject || 'current topic',
    kind: 'quiz',
    difficulty,
    count: Math.min(10, Math.max(3, Number(count) || 5)),
    questionTypes: questionTypes?.length ? questionTypes : ['multiple-choice', 'true-false', 'short-answer'],
  });

  if (assessment.error) {
    return { error: session.subject || materialName ? assessment.error : 'What topic should I quiz you on? Name a subject, or upload your notes first.' };
  }

  const quiz = {
    id: makeId('livequiz'),
    questions: assessment.questions,
    index: 0,
    answers: [],
    score: 0,
    status: 'active',
    difficulty,
    sourceFile: materialName || '',
    subject: session.subject || assessment.title,
    interactive: true,
  };

  return {
    quiz,
    reply: `${role && isLecturerRole(role) ? 'I can also save a formal version for your class after we finish. ' : ''}Let's check your understanding of ${quiz.subject}. I will ask one question at a time.\n\n${formatQuestion(quiz)}`,
    usedSource: Boolean(materialText),
  };
}

function gradeQuiz(session, message) {
  const quiz = session.quiz;
  const question = quiz.questions[quiz.index];
  const given = String(message || '').trim();
  const letter = given.toUpperCase().match(/^([A-D])\b/);
  const selected = letter && question.options?.[letter[1].charCodeAt(0) - 65];
  const response = selected || given;
  const correct = answersMatch(response, question.answer) || (question.options || []).some((option, index) => answersMatch(response, option) && answersMatch(option, question.answer));
  const record = { questionId: question.id, prompt: question.prompt, given: response, expected: question.answer, correct, topic: question.topic };
  quiz.answers.push(record);
  if (correct) quiz.score += 1;
  quiz.index += 1;

  let reply = correct
    ? `Correct. ${question.answer}`
    : `Not quite. The expected answer is: ${question.answer}\n\nWhy: ${question.sourceExcerpt || 'That is the idea we were practising from the current topic.'}`;

  if (quiz.index >= quiz.questions.length) {
    quiz.status = 'complete';
    const percent = Math.round((quiz.score / quiz.questions.length) * 100);
    const incorrect = quiz.answers.filter((item) => !item.correct);
    const weakTopics = [...new Set(incorrect.map((item) => item.topic).filter(Boolean))];
    quiz.percent = percent;
    quiz.weakTopics = weakTopics;
    reply += `\n\nQuiz complete. You scored ${quiz.score}/${quiz.questions.length} (${percent}%).`;
    if (incorrect.length) {
      const missed = incorrect.map((item) => 'Q' + (quiz.answers.indexOf(item) + 1)).join(', ');
      reply += '\nIncorrect: ' + missed + '.';
      reply += `\nYou struggled most with: ${weakTopics.join(', ') || 'the questions you missed'}. Would you like to practise those next?`;
    } else {
      reply += '\nStrong work — no weak topics from this set. Say “make it harder” if you want a tougher round.';
    }
  } else {
    reply += `\n\nLet's move to question ${quiz.index + 1}.\n\n${formatQuestion(quiz)}`;
  }

  return { reply, quiz, usedSource: Boolean(quiz.sourceFile) };
}

function buildStudyPlan(session, message) {
  const when = parseScheduleRequest(message) || parseScheduleRequest('in two weeks') || { date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) };
  const topics = (session.topics?.length ? session.topics : extractTopics(session.materialText || session.subject || 'Core revision', 6));
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const plan = topics.slice(0, 7).map((topic, index) => ({
    day: days[index],
    focus: topic,
    minutes: index >= 5 ? 40 : 70,
  }));
  return {
    title: `Study plan · ${session.subject || 'Upcoming exam'}`,
    examDate: when.date,
    days: plan,
    notes: 'Weekends are lighter. Tell me to move a topic or give more time to a weak area.',
  };
}

function pendingTimeFromMessage(message) {
  const match = String(message || '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] || '00';
  const mer = (match[3] || '').toLowerCase();
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

export function converse({
  message,
  history = [],
  profile = {},
  session = {},
  materialText = '',
  materialName = '',
  difficulty = 'Intermediate',
  spec = {},
  progress = {},
}) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const role = profile.role || 'Lecturer';
  const intent = parseLearningIntent(text, session);
  const nextDifficulty = detectDifficulty(text, session.difficulty || difficulty);
  const nextSession = {
    ...session,
    difficulty: nextDifficulty,
    subject: extractSubject(text, session) || session.subject || '',
    topics: extractFocusTopics(text, session),
    mode: detectMode(text, session),
    materialName: materialName || session.materialName || '',
  };

  if (session.pending?.type === 'assessment-marks' || session.pending?.type === 'work-spec') {
    const marks = Number((lower.match(/\b(\d+)\s*(marks?|points?)?\b/) || [])[1]);
    if (!marks && session.pending.type === 'assessment-marks') {
      return { kind: 'chat', mode: 'assessment', difficulty: nextDifficulty, reply: 'How many marks should it be in total?', session: nextSession, pending: session.pending };
    }
    if (session.pending.type === 'assessment-marks' && marks && !/multiple|short-answer|scenario|mixture/.test(lower)) {
      nextSession.pending = { type: 'assessment-types', marks };
      return { kind: 'chat', mode: 'assessment', difficulty: nextDifficulty, reply: 'Perfect. Would you like a mixture of multiple-choice, short-answer and scenario-based questions?', session: nextSession, pending: nextSession.pending };
    }
    const types = /mixture|multiple|short-answer|scenario/.test(lower)
      ? ['multiple-choice', 'short-answer', 'scenario']
      : spec.questionTypes;
    const source = materialText || matchLibraryTopic(nextSession.subject)?.explain || nextSession.subject;
    const generated = fallbackGenerate('assessment', source, { ...intent, totalMarks: session.pending.marks || marks, questionTypes: types, difficulty: nextDifficulty }, { ...nextSession, materialName: materialName || nextSession.subject });
    nextSession.pending = null;
    nextSession.lastKind = generated.kind;
    nextSession.lastAssessment = generated.assessment;
    return { ...generated, mode: 'assessment', session: nextSession };
  }

  if (session.pending?.type === 'assessment-types') {
    const types = /mixture|multiple|short-answer|scenario/.test(lower)
      ? ['multiple-choice', 'short-answer', 'scenario']
      : spec.questionTypes;
    const source = materialText || matchLibraryTopic(nextSession.subject)?.explain || nextSession.subject;
    const generated = fallbackGenerate('assessment', source, { ...intent, totalMarks: session.pending.marks, questionTypes: types, difficulty: nextDifficulty }, { ...nextSession, materialName: materialName || nextSession.subject });
    nextSession.pending = null;
    nextSession.lastKind = generated.kind;
    nextSession.lastAssessment = generated.assessment;
    return { ...generated, mode: 'assessment', session: nextSession };
  }

  if (session.pending?.type === 'schedule-time') {
    const time = pendingTimeFromMessage(text);
    if (!time) {
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: 'What time should it start? For example, 10:00 AM.', session: nextSession, pending: session.pending };
    }
    const suggestion = {
      id: makeId('event'),
      title: session.pending.title,
      description: session.pending.description || 'Suggested from the AI assistant. Fully editable.',
      type: session.pending.eventType || 'assessment',
      date: session.pending.date,
      startTime: time,
      endTime: `${String(Math.min(23, Number(time.slice(0, 2)) + 2)).padStart(2, '0')}${time.slice(2)}`,
      status: 'suggested',
      source: 'ai',
    };
    nextSession.pending = null;
    return {
      kind: 'schedule',
      mode: nextSession.mode,
      difficulty: nextDifficulty,
      reply: `I have prepared “${suggestion.title}” for ${suggestion.date} at ${suggestion.startTime}. Please review it on the calendar and confirm. You can still change the date, time, title, or delete it.`,
      calendarSuggestions: [suggestion],
      session: nextSession,
      usedSource: Boolean(materialText),
    };
  }

  if (session.quiz?.status === 'active' && !isControlCommand(text)) {
    const graded = gradeQuiz({ ...session, quiz: { ...session.quiz, questions: session.quiz.questions, answers: [...session.quiz.answers] } }, text);
    nextSession.quiz = graded.quiz;
    nextSession.mode = 'quiz';
    const current = graded.quiz.status === 'active' ? graded.quiz.questions[graded.quiz.index] : null;
    return {
      kind: 'quiz-live',
      mode: 'quiz',
      difficulty: nextDifficulty,
      reply: graded.reply,
      quiz: graded.quiz,
      quizPrompt: current ? { index: graded.quiz.index, total: graded.quiz.questions.length, prompt: current.prompt, options: current.options || [], type: current.type } : null,
      quizSummary: graded.quiz.status === 'complete' ? graded.quiz : null,
      progressUpdate: graded.quiz.status === 'complete' ? {
        quizId: graded.quiz.id,
        score: graded.quiz.score,
        total: graded.quiz.questions.length,
        percent: graded.quiz.percent,
        weakTopics: graded.quiz.weakTopics,
        subject: graded.quiz.subject,
        at: new Date().toISOString(),
      } : null,
      session: nextSession,
      usedSource: graded.usedSource,
    };
  }

  if (session.quiz?.status === 'complete') {
    nextSession.lastQuiz = session.quiz;
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text) && text.length < 24) {
    return {
      kind: 'chat',
      mode: 'tutor',
      difficulty: nextDifficulty,
      reply: `Hello ${firstName(profile)} - of course I can help. What subject are you studying today?`,
      session: { ...nextSession, mode: 'tutor' },
    };
  }

  if (/^(i need help|help|can you help|i need assistance)\b/i.test(text) && !nextSession.subject) {
    return {
      kind: 'chat',
      mode: 'tutor',
      difficulty: nextDifficulty,
      reply: `I'm here, ${firstName(profile)}. What do you need help with — a subject, an upcoming exam, an assignment, or a topic you are stuck on?`,
      session: nextSession,
    };
  }

  if (/\b(what should i study next|topics am i struggling)\b/.test(lower)) {
    const weak = progress.weakTopics || session.lastWeakTopics || [];
    if (!weak.length) {
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: 'I do not have a saved quiz result for you yet, so I will not invent weak topics. Take a quiz with me first, or tell me which area feels hardest.', session: nextSession };
    }
    return { kind: 'chat', mode: 'revision', difficulty: nextDifficulty, reply: `From your last quiz, the areas to practise are: ${weak.join(', ')}. Would you like an explanation, examples, or a short quiz on those?`, session: nextSession };
  }

  if (/^(can you help me study|i want to study|help me study)\b/i.test(text) && !matchLibraryTopic(text) && !nextSession.subject) {
    return {
      kind: 'chat',
      mode: 'tutor',
      difficulty: nextDifficulty,
      reply: `Of course! What subject are you studying?`,
      session: { ...nextSession, mode: 'tutor' },
    };
  }

  if (/\b(use this (file|material|document|notes)|use the uploaded|from (this|the) (file|notes|document|material) instead)\b/.test(lower)) {
    if (!materialText) {
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: 'I do not have a file in this chat yet. Upload your lecture notes and I will use them as the source.', session: nextSession };
    }
    nextSession.useMaterial = true;
    nextSession.subject = nextSession.subject || materialName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    return {
      kind: 'chat',
      mode: nextSession.mode,
      difficulty: nextDifficulty,
      reply: `I've switched to “${materialName}” as the source for this conversation. Ask me to explain a topic, give an example, quiz you, or create an assignment from it.`,
      session: nextSession,
      usedSource: true,
    };
  }

  if (/\b(i don'?t understand|i do not understand|confused about|struggling to understand|help me understand)\b/.test(lower)) {
    const guide = matchLibraryTopic(text) || matchLibraryTopic(nextSession.topics[0]) || matchLibraryTopic(nextSession.subject);
    const topicName = guide?.title || nextSession.topics[0] || nextSession.subject;
    if (guide) nextSession.topics = [...new Set([guide.title, ...(nextSession.topics || [])])];
    const fromDoc = materialText ? explainFromSource(materialText, materialName, topicName, 'Easy') : null;
    return { kind: 'chat', mode: 'tutor', difficulty: 'Easy', reply: naturalTopicReply(guide, { simple: true, fromDoc }), session: { ...nextSession, mode: 'tutor', subject: nextSession.subject || guide?.title }, usedSource: Boolean(fromDoc) };
  }

  if (/\b(give me (a |an )?(simple )?example|can you give me (a |an )?(simple )?example|another example|real-world example)\b/.test(lower)) {
    const topicName = nextSession.topics[0] || nextSession.subject;
    const guide = matchLibraryTopic(topicName) || matchLibraryTopic(text) || matchLibraryTopic(history.map((item) => item.content).join(' '));
    const fromDoc = materialText ? explainFromSource(materialText, materialName, topicName, 'Easy') : null;
    return { kind: 'chat', mode: 'tutor', difficulty: nextDifficulty, reply: naturalTopicReply(guide, { exampleOnly: true, fromDoc }), session: nextSession, usedSource: Boolean(fromDoc) };
  }

  if (/\bwhy (did i get|is) (number |question )?(\d+)/.test(lower) || /\bquestion (\d+) wrong\b/.test(lower) || /\bwhy (was|is) (my )?(previous|last|that) answer wrong\b/.test(lower) || /\bwhy was my previous answer wrong\b/.test(lower)) {
    const number = Number((lower.match(/question (\d+)/) || lower.match(/number (\d+)/) || [])[1]);
    const quiz = session.quiz || session.lastQuiz;
    const item = Number.isFinite(number) && number > 0
      ? quiz?.answers?.[number - 1]
      : [...(quiz?.answers || [])].reverse().find((entry) => !entry.correct) || quiz?.answers?.[(quiz?.answers?.length || 1) - 1];
    if (!item) {
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: 'I do not have that question result in this session, so I will not guess. If we just finished a quiz, ask about a question number from that quiz.', session: nextSession };
    }
    return { kind: 'chat', mode: 'quiz', difficulty: nextDifficulty, reply: `Your previous answer was “${item.given}”. The expected idea was: ${item.expected}. ${item.correct ? 'That one was actually marked correct.' : 'It was marked incorrect because it did not match the idea we were practising.'} Want me to explain that point again, or continue the quiz?`, session: nextSession };
  }

  if (/\b(quiz me|test me|test my knowledge|quiz mode|now quiz me)\b/.test(lower)) {
    const started = startQuiz({
      session: nextSession,
      materialText,
      materialName,
      count: spec.count || 5,
      difficulty: nextDifficulty,
      questionTypes: spec.questionTypes,
      role,
    });
    if (started.error) return { kind: 'chat', mode: 'quiz', difficulty: nextDifficulty, reply: started.error, session: nextSession };
    nextSession.quiz = started.quiz;
    const current = started.quiz.questions[0];
    return {
      kind: 'quiz-live',
      mode: 'quiz',
      difficulty: nextDifficulty,
      reply: started.reply,
      quiz: started.quiz,
      quizPrompt: { index: 0, total: started.quiz.questions.length, prompt: current.prompt, options: current.options || [], type: current.type },
      session: nextSession,
      usedSource: started.usedSource,
    };
  }

  if (/\b(make (it|this|the quiz) (harder|easier|advanced|professional|intermediate)|make it advanced|these questions are too easy|increase the difficulty)\b/.test(lower) && (session.quiz || session.lastQuiz || session.lastAssessment)) {
    const harder = /harder|advanced|professional|increase/.test(lower);
    const level = detectDifficulty(text, harder ? 'Advanced' : 'Easy');
    nextSession.difficulty = level;
    if (session.quiz || session.lastQuiz || session.mode === 'quiz' || /\bquiz\b/.test(lower) || /^make it advanced/.test(lower)) {
      const started = startQuiz({ session: nextSession, materialText, materialName, count: session.quiz?.questions?.length || 5, difficulty: level, questionTypes: spec.questionTypes, role });
      if (!started.error) {
        nextSession.quiz = started.quiz;
        const current = started.quiz.questions[0];
        return { kind: 'quiz-live', mode: 'quiz', difficulty: level, reply: `I changed the live quiz to ${level.toLowerCase()} level, still on ${nextSession.subject || 'the same topic'}.\n\n${started.reply}`, quiz: started.quiz, quizPrompt: { index: 0, total: started.quiz.questions.length, prompt: current.prompt, options: current.options || [], type: current.type }, session: nextSession, usedSource: started.usedSource };
      }
    }
    const generated = fallbackGenerate(session.lastKind || 'quiz', materialText, { ...intent, difficulty: level, kind: session.lastKind || 'quiz' }, { ...nextSession, lastAssessment: session.lastAssessment });
    return { ...generated, mode: nextSession.mode, difficulty: level, session: { ...nextSession, lastKind: generated.kind, lastAssessment: generated.assessment || session.lastAssessment } };
  }

  if (/\b(give me|add)\s+(\d+)\s+more\b/.test(lower) && (session.quiz || session.lastQuiz || session.lastAssessment)) {
    const extra = Number((lower.match(/\b(\d+)\s+more\b/) || [])[1] || 5);
    if (session.quiz || session.lastQuiz) {
      const started = startQuiz({ session: nextSession, materialText, materialName, count: extra, difficulty: nextDifficulty, questionTypes: spec.questionTypes, role });
      if (!started.error) {
        const base = session.quiz?.status === 'active' ? session.quiz : session.lastQuiz || session.quiz;
        const merged = {
          ...(base || started.quiz),
          questions: [...(base?.questions || []), ...started.quiz.questions],
          status: 'active',
          index: base?.status === 'active' ? base.index : (base?.questions?.length || 0),
          answers: base?.answers || [],
          score: base?.score || 0,
        };
        nextSession.quiz = merged;
        const current = merged.questions[merged.index];
        return {
          kind: 'quiz-live',
          mode: 'quiz',
          difficulty: nextDifficulty,
          reply: `I added ${extra} more questions on ${nextSession.subject || 'the same topic'}. Let's keep going.\n\n${formatQuestion(merged)}`,
          quiz: merged,
          quizPrompt: current ? { index: merged.index, total: merged.questions.length, prompt: current.prompt, options: current.options || [], type: current.type } : null,
          session: nextSession,
          usedSource: started.usedSource,
        };
      }
    }
    const generated = fallbackGenerate('add-items', materialText, { ...intent, count: extra }, { ...nextSession, lastKind: session.lastKind, lastAssessment: session.lastAssessment });
    return { ...generated, mode: nextSession.mode, session: { ...nextSession, lastAssessment: generated.assessment || session.lastAssessment } };
  }

  if (/\blast three\b/.test(lower) && /scenario/.test(lower) && session.lastAssessment?.questions?.length) {
    const questions = session.lastAssessment.questions.map((question, index, list) => (
      index >= list.length - 3
        ? { ...question, type: 'scenario', prompt: `Scenario: Using this idea — ${question.sourceExcerpt || question.prompt} — describe how a learner should apply it and what mistakes to avoid.` }
        : question
    ));
    const assessment = { ...session.lastAssessment, questions };
    nextSession.lastAssessment = assessment;
    return { kind: 'assessment', mode: nextSession.mode, difficulty: nextDifficulty, assessment, reply: 'Done — the last three questions are now scenario-based. You can still edit any of them before publishing.', session: nextSession };
  }

  if ((session.lastAssessment || session.lastContent) && (/\b(\d+)\s*marks\b/.test(lower) || /\bprofessional level\b/.test(lower))) {
    const marks = Number((lower.match(/\b(\d+)\s*marks\b/) || [])[1]);
    const level = /professional/.test(lower) ? 'Professional' : nextDifficulty;
    if (session.lastAssessment) {
      const source = materialText || session.lastAssessment.questions.map((item) => item.sourceExcerpt || item.prompt).join('\n');
      const generated = fallbackGenerate(session.lastKind || 'assignment', source, {
        ...intent,
        difficulty: level,
        kind: session.lastKind || 'assignment',
        totalMarks: marks || session.lastAssessment.totalMarks,
        count: session.lastAssessment.questions?.length || intent.count,
      }, { ...nextSession, lastAssessment: session.lastAssessment, materialName: materialName || nextSession.subject });
      if (generated.assessment && marks) {
        generated.assessment.totalMarks = marks;
        const each = Math.max(1, Math.round(marks / Math.max(1, generated.assessment.questions.length)));
        generated.assessment.questions = generated.assessment.questions.map((question) => ({ ...question, marks: each }));
        generated.assessment.marksPerQuestion = each;
      }
      nextSession.lastAssessment = generated.assessment || session.lastAssessment;
      nextSession.lastKind = generated.kind || session.lastKind;
      nextSession.difficulty = level;
      return { ...generated, difficulty: level, reply: generated.reply || `I updated it to ${level.toLowerCase()} level${marks ? ` and ${marks} marks` : ''}, keeping the same topic.`, session: nextSession };
    }
    const content = {
      ...session.lastContent,
      difficulty: level,
      totalMarks: marks || session.lastContent.totalMarks || 30,
      professionalBrief: level === 'Professional' ? 'Frame the task as a workplace or teaching-practice problem. Include marking guidelines.' : session.lastContent.professionalBrief,
    };
    if (marks) content.markingGuidelines = `Total ${marks} marks. Award credit for accuracy, justification, and professional application.`;
    nextSession.lastContent = content;
    nextSession.difficulty = level;
    return {
      kind: session.lastKind || 'assignment',
      difficulty: level,
      content,
      reply: `I kept the same assignment on ${nextSession.subject || 'this topic'} and updated it to ${level.toLowerCase()} level${marks ? ` with ${marks} marks` : ''}, including marking guidelines. You can still edit it.`,
      session: nextSession,
    };
  }

  if (/\b(i want to study|let'?s study|studying)\b/.test(lower) && nextSession.subject && !/\b(explain|quiz|understand|example)\b/.test(lower)) {
    return {
      kind: 'chat',
      mode: 'tutor',
      difficulty: nextDifficulty,
      reply: `Great! What topic in ${nextSession.subject} would you like to start with?`,
      session: { ...nextSession, mode: 'tutor' },
    };
  }

  if (nextSession.mode === 'exam-prep' || /\b(exam coming|study plan|prepare for (the |my )?exam)\b/.test(lower)) {
    if (!nextSession.subject && !materialText) {
      return { kind: 'chat', mode: 'exam-prep', difficulty: nextDifficulty, reply: `I can help you prepare, ${firstName(profile)}. Which subject is the exam in, and which topics are you least confident about?`, session: { ...nextSession, mode: 'exam-prep' } };
    }
    if (nextSession.subject && nextSession.topics.length < 2 && !/\bstudy plan\b/.test(lower) && !/\b(normalization|join|sql)\b/.test(lower)) {
      return { kind: 'chat', mode: 'exam-prep', difficulty: nextDifficulty, reply: `Absolutely — I can help you prepare for ${nextSession.subject}. Which topics are you currently struggling with?`, session: { ...nextSession, mode: 'exam-prep' } };
    }
    if (nextSession.topics.length && !/\bstudy plan\b/.test(lower) && !/\bquiz me\b/.test(lower)) {
      return {
        kind: 'chat',
        mode: 'exam-prep',
        difficulty: nextDifficulty,
        reply: `Great. Let's focus on ${nextSession.topics.join(' and ')} in ${nextSession.subject || 'this subject'}. Would you like me to explain them first, practise examples, or test your knowledge?`,
        session: { ...nextSession, mode: 'exam-prep' },
      };
    }
    if (/\bstudy plan\b/.test(lower)) {
      const plan = buildStudyPlan({ ...nextSession, materialText }, text);
      nextSession.lastContent = plan;
      const planLines = plan.days.map((day) => day.day + ': ' + day.focus + ' (' + day.minutes + ' min)').join('\n');
      return { kind: 'study-plan', mode: 'exam-prep', difficulty: nextDifficulty, reply: 'Here is a study plan toward ' + plan.examDate + ' for ' + (nextSession.subject || 'your exam') + '.\n\n' + planLines + '\n\n' + plan.notes, content: plan, session: nextSession, usedSource: Boolean(materialText) };
    }
  }

  if (/\b(change this into an assignment|turn this into a test|create revision notes|create flashcards|create a lesson plan|summarise)\b/.test(lower) || ['flashcards', 'notes', 'summary', 'revision', 'lesson-plan', 'assignment', 'assessment', 'test', 'activities', 'quiz'].includes(intent.kind)) {
    if (intent.kind === 'assessment' && !materialText && !nextSession.subject) {
      return { kind: 'chat', mode: 'assessment', difficulty: nextDifficulty, reply: 'Sure! What subject or topic should the assessment cover?', session: nextSession };
    }
    if (intent.kind === 'assessment' && (nextSession.subject || materialText) && !intent.totalMarks && !/\b\d+\s*marks\b/.test(lower)) {
      return { kind: 'chat', mode: 'assessment', difficulty: nextDifficulty, reply: `Got it. How many marks would you like the assessment to be?`, session: { ...nextSession, pending: { type: 'assessment-marks', kind: 'assessment' } } };
    }
    if (intent.kind === 'assignment' && !materialText && !nextSession.subject) {
      return { kind: 'chat', mode: 'assignment', difficulty: nextDifficulty, reply: 'Sure. What subject or topic should the assignment cover?', session: nextSession };
    }
    if (['quiz', 'test', 'assessment', 'practice', 'flashcards', 'notes', 'summary', 'revision', 'lesson-plan', 'assignment', 'activities'].includes(intent.kind) && !materialText && !nextSession.subject) {
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: 'I can do that. Should I use lecture notes you upload, or a topic we are discussing? Right now I do not have a document in this session.', session: nextSession };
    }
    if (intent.kind === 'quiz' && /\bquiz me\b/.test(lower)) {
      // handled earlier; fall through only for generate-quiz
    } else {
      const source = materialText || (matchLibraryTopic(nextSession.subject || text)?.explain || '');
      if (!source && intent.kind !== 'chat') {
        return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: 'I need a topic or an uploaded file before I generate that. I will not invent unrelated content.', session: nextSession };
      }
      const generated = fallbackGenerate(intent.kind === 'chat' ? 'notes' : intent.kind, source, { ...intent, difficulty: nextDifficulty }, { ...nextSession, materialName: materialName || nextSession.subject });
      nextSession.lastKind = generated.kind;
      nextSession.lastAssessment = generated.assessment || nextSession.lastAssessment;
      nextSession.lastContent = generated.content || nextSession.lastContent;
      return { ...generated, mode: nextSession.mode, session: nextSession };
    }
  }

  if (/\bschedule|\bcalendar\b/.test(lower)) {
    const when = parseScheduleRequest(text);
    const title = session.lastAssessment?.title || session.lastContent?.title || nextSession.subject || 'Scheduled learning activity';
    if (when && !pendingTimeFromMessage(text)) {
      nextSession.pending = { type: 'schedule-time', date: when.date, title, description: 'Suggested from the AI assistant.', eventType: /assess|quiz|test|exam/.test(lower) ? 'assessment' : 'lesson' };
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: `I can put ${title} on ${when.label || when.date}. What time should it start?`, session: nextSession, pending: nextSession.pending };
    }
    if (when) {
      const suggestions = suggestCalendarFromAssessment(session.lastAssessment || { title, questions: [], totalMarks: 0, timeAllowed: '2 hours', kind: 'assessment' }, { ...when, startTime: pendingTimeFromMessage(text) || when.startTime });
      suggestions.forEach((item) => { item.startTime = pendingTimeFromMessage(text) || item.startTime; item.status = 'suggested'; });
      return { kind: 'schedule', mode: nextSession.mode, difficulty: nextDifficulty, reply: `I prepared a calendar suggestion for ${when.date} at ${suggestions[0]?.startTime}. Review and confirm it — nothing is locked.`, calendarSuggestions: suggestions, session: nextSession };
    }
  }

  if (/\b(move .+ to monday|more time for|weekends lighter)\b/.test(lower) && session.lastContent?.days) {
    const days = session.lastContent.days.map((day) => ({ ...day }));
    if (/weekends lighter/.test(lower)) {
      days.forEach((day) => { if (/sat|sun/i.test(day.day)) day.minutes = 25; });
    }
    const move = lower.match(/move (.+) to (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (move) {
      const target = days.find((day) => day.day.toLowerCase() === move[2]);
      if (target) target.focus = move[1].trim();
    }
    const more = lower.match(/more time for ([a-z0-9 ]+)/i);
    if (more) {
      const target = days.find((day) => day.focus.toLowerCase().includes(more[1].trim()));
      if (target) target.minutes += 20;
    }
    const content = { ...session.lastContent, days };
    nextSession.lastContent = content;
    const updatedLines = days.map((day) => day.day + ': ' + day.focus + ' (' + day.minutes + ' min)').join('\n');
    return { kind: 'study-plan', mode: 'exam-prep', difficulty: nextDifficulty, reply: 'Updated plan:\n\n' + updatedLines, content, session: nextSession };
  }

  const askedTopic = matchLibraryTopic(text) || matchLibraryTopic(nextSession.topics[0]) || matchLibraryTopic(nextSession.subject);
  const lastBot = [...history].reverse().find((item) => item.role === 'assistant' || item.role === 'bot');
  if (askedTopic && lastBot && /what topic|start with/i.test(lastBot.content || lastBot.text || '')) {
    nextSession.topics = [...new Set([askedTopic.title, ...(nextSession.topics || [])])];
    const fromDoc = materialText ? explainFromSource(materialText, materialName, askedTopic.title, nextDifficulty) : null;
    return { kind: 'chat', mode: 'tutor', difficulty: nextDifficulty, reply: naturalTopicReply(askedTopic, { fromDoc }), session: { ...nextSession, subject: nextSession.subject || askedTopic.title }, usedSource: Boolean(fromDoc) };
  }
  if ((askedTopic || nextSession.topics.length) && /\b(explain|what is|teach|let's focus|explain them|start with)\b/.test(lower)) {
    const topicsToExplain = nextSession.topics.length ? nextSession.topics : [askedTopic?.title].filter(Boolean);
    const parts = topicsToExplain.map((name) => {
      const guide = matchLibraryTopic(name);
      const fromDoc = materialText ? explainFromSource(materialText, materialName, name, nextDifficulty) : null;
      if (fromDoc) return fromDoc;
      if (guide) return naturalTopicReply(guide, { simple: nextDifficulty === 'Easy' });
      return null;
    }).filter(Boolean);
    if (parts.length) {
      return { kind: 'chat', mode: 'tutor', difficulty: nextDifficulty, reply: parts.join('\n\n---\n\n') + (materialText ? '' : '\n\nIf you upload lecture notes, I will prefer those over this general explanation.'), session: { ...nextSession, subject: nextSession.subject || askedTopic?.title }, usedSource: Boolean(materialText) };
    }
  }

  if (materialText && /\b(what('s| is) in (the )?(file|notes|document|pdf)|topics did you find)\b/.test(lower)) {
    const analysis = fallbackAnalyze(materialText, materialName);
    return { kind: 'analysis', mode: 'tutor', difficulty: nextDifficulty, analysis, reply: analysis.error || `I analysed ${materialName}. I found ${analysis.topic}, including ${(analysis.keyConcepts || []).slice(0, 6).join(', ')}. What would you like to study first?`, session: nextSession, usedSource: true };
  }

  if (progress.weakTopics?.length && /\b(practise that|practice that|help me practise)\b/.test(lower)) {
    nextSession.topics = progress.weakTopics;
    const started = startQuiz({ session: nextSession, materialText, materialName, count: 4, difficulty: nextDifficulty, questionTypes: ['short-answer', 'practical'], role });
    if (!started.error) {
      nextSession.quiz = started.quiz;
      const current = started.quiz.questions[0];
      return { kind: 'quiz-live', mode: 'quiz', difficulty: nextDifficulty, reply: `Let's practise ${progress.weakTopics.join(' and ')}.\n\n${started.reply}`, quiz: started.quiz, quizPrompt: { index: 0, total: started.quiz.questions.length, prompt: current.prompt, options: current.options || [], type: current.type }, session: nextSession, usedSource: started.usedSource };
    }
  }

  if (nextSession.subject && history.filter((item) => item.role === 'user').length <= 2 && !askedTopic) {
    return {
      kind: 'chat',
      mode: nextSession.mode,
      difficulty: nextDifficulty,
      reply: `I can work with ${nextSession.subject}. Tell me the topics you want to focus on, or upload your notes and I will pull the topics from there.`,
      session: nextSession,
    };
  }

  const recentUser = history.filter((item) => item.role === 'user').slice(-3).map((item) => item.content).join(' ');
  if (materialText) {
    const fromDoc = explainFromSource(materialText, materialName, text, nextDifficulty);
    if (fromDoc) {
      return { kind: 'chat', mode: nextSession.mode, difficulty: nextDifficulty, reply: `${fromDoc}\n\nWould you like an example, a simpler version, or a quiz on this?`, session: nextSession, usedSource: true };
    }
  }

  if (text.length < 40 && !nextSession.subject) {
    return {
      kind: 'chat',
      mode: 'tutor',
      difficulty: nextDifficulty,
      reply: `Could you tell me a little more? For example: the subject, whether this is for an exam or class, and whether you want an explanation, practice, or a quiz.`,
      session: nextSession,
    };
  }

  const focusBit = nextSession.topics.length ? ', focusing on ' + nextSession.topics.join(', ') : '';
  const nextAction = isLecturerRole(role) ? 'draft a lesson/assignment for your class' : 'build a study plan';
  return {
    kind: 'chat',
    mode: nextSession.mode,
    difficulty: nextDifficulty,
    reply: nextSession.subject
      ? 'We are on ' + nextSession.subject + focusBit + '. I can explain, give examples, quiz you, make notes, or ' + nextAction + '. What would you like to do next?'
      : 'I can help with that. Name the subject or topic, or upload notes. Recent message I have is: “' + (recentUser || text) + '”.',
    session: nextSession,
    usedSource: Boolean(materialText),
  };
}
