import dotenv from 'dotenv';
import { isReadableEducationalText, truncateText } from '../../../../shared/learningEngine.js';
import { converse } from '../../../../shared/tutorEngine.js';
import { completeJson, getLlmStatus, streamText } from './aiClient.js';

dotenv.config();

function analysisPrompt(text, fileName) {
  return `File name: ${fileName}

Source material:
${truncateText(text, 12000)}

Turn this source into a professional lesson-planning analysis for a lecturer.
Use only ideas that are actually present in the source. Never invent a different subject.
If the source is corrupted, binary, scrambled, or not readable teaching text, return {"error":"The uploaded file did not contain readable text I can teach from."} and nothing else.

Return JSON with:
{
  "topic": "clear readable topic title",
  "learningObjectives": ["By the end of the session, learners should be able to ..."],
  "keyConcepts": ["short concept names"],
  "lessonPlanOutline": [{"stage":"Connect","focus":"..."},{"stage":"Teach","focus":"..."},{"stage":"Practise","focus":"..."},{"stage":"Apply","focus":"..."},{"stage":"Review","focus":"..."}],
  "recommendedActivities": ["..."],
  "assignmentIdeas": ["..."],
  "quizIdeas": ["..."],
  "assessmentIdeas": ["..."],
  "revisionMaterial": ["short revision points"],
  "error": null
}

Write learning objectives in proper English. Do not copy encoded characters, random symbols, or PDF binary fragments.`;
}

export async function analyzeLearningMaterial({ text, fileName }) {
  if (!isReadableEducationalText(text)) {
    return {
      error: `“${fileName || 'This file'}” did not contain enough readable teaching text, so I did not generate a lesson plan. Upload a Word, PowerPoint, TXT, or text-based PDF file.`,
    };
  }

  const status = getLlmStatus();
  if (!status.configured) {
    return {
      error: 'AI is not configured. Set GEMINI_API_KEY (or AI_API_KEY / GITHUB_TOKEN) on the server to analyse materials.',
    };
  }

  try {
    const { provider, data } = await completeJson(
      'You are an expert lecturer. Analyse only the provided source. Return JSON. Never output scrambled or encoded characters.',
      analysisPrompt(text, fileName || 'Uploaded material'),
    );
    if (data?.error) return { error: data.error };
    if (data?.topic && Array.isArray(data.learningObjectives) && data.learningObjectives.length) {
      return {
        ...data,
        fileName,
        sourceReady: true,
        provider: provider || status.provider,
      };
    }
    return { error: 'The AI did not return a usable analysis. Try again or upload a clearer document.' };
  } catch (error) {
    console.error('Material analysis error:', error.response?.data || error.message);
    return {
      error: error.response?.data?.error || error.message || 'Material analysis failed. Check the AI provider configuration.',
    };
  }
}

export async function runLearningTurn({
  message,
  history = [],
  materialText = '',
  materialName = '',
  difficulty = 'Intermediate',
  session = {},
  profile = {},
  spec = {},
  progress = {},
}) {
  const local = converse({
    message,
    history,
    profile,
    session,
    materialText: isReadableEducationalText(materialText) ? materialText : '',
    materialName: isReadableEducationalText(materialText) ? materialName : '',
    difficulty,
    spec,
    progress,
  });

  const status = getLlmStatus();
  if (local.kind === 'quiz-live') {
    if (!status.configured) {
      return {
        reply: 'AI is not configured. Set GEMINI_API_KEY (or AI_API_KEY / GITHUB_TOKEN) on the server before using the assistant.',
        kind: 'error',
        provider: null,
        session: local.session || session,
        difficulty: local.difficulty || difficulty,
      };
    }
    return { ...local, provider: status.provider };
  }

  if (!status.configured) {
    return {
      reply: 'AI is not configured. Set GEMINI_API_KEY (or AI_API_KEY / GITHUB_TOKEN) on the server before using the assistant.',
      kind: 'error',
      provider: null,
      session: local.session || session,
      difficulty: local.difficulty || difficulty,
    };
  }

  try {
    const { provider, data } = await completeJson(
      `You are PlanWise AI, a personal tutor and teaching assistant for ${profile.name || 'the user'} (${profile.role || 'educator'}).
Have a natural conversation. Remember this session. Ask a clarifying question when the request is vague.
Do not invent files, scores, or previous chats. If notes are uploaded, prefer them.
Write in clear English. Never copy scrambled PDF characters into the reply.
If the user wants to be quizzed, say you will start an interactive quiz; do not dump every question at once.
Return JSON only.`,
      `User message: ${message}

Difficulty: ${local.difficulty || difficulty}
Mode: ${local.mode || session.mode || 'tutor'}
Subject in session: ${local.session?.subject || session.subject || 'none'}
Topics in session: ${(local.session?.topics || session.topics || []).join(', ') || 'none'}
Source file: ${materialName || 'none'}
Source excerpt:
${isReadableEducationalText(materialText) ? truncateText(materialText, 8000) : 'NO SOURCE MATERIAL'}
Known progress: ${JSON.stringify(progress || {})}

Current section: ${session.activeSection || 'general'}
Section focus: ${session.sectionHint || 'General PlanWise help. The user can still ask about other supported tasks.'}
Saved materials this user owns: ${(session.ownedDocumentTitles || []).join(', ') || 'none'}
Saved lesson plans: ${(session.ownedPlanTitles || []).join(', ') || 'none'}
Calendar events already saved: ${JSON.stringify(session.calendarEvents || []).slice(0, 4000)}

Return JSON:
{
  "reply": "natural conversational reply",
  "mode": "tutor|quiz|revision|assessment|assignment|exam-prep",
  "difficulty": "${local.difficulty || difficulty}",
  "usedSource": false,
  "askClarification": false,
  "calendarSuggestion": null
}

Section rules:
- Prioritise the current section, and still answer other supported requests.
- On lesson plans, assessments, and paper marking, use only the supplied notes, uploaded files, and this user's saved materials. If the source is missing, ask for it. Do not invent objectives, questions, marks, or facts.
- On the calendar, help with events, deadlines, and schedules. Never say an event was created. If the user wants a new event and gave a title and date, set calendarSuggestion to {"title","date","startTime","endTime","type"} and ask them to confirm. Otherwise set calendarSuggestion to null.
- Use dates as YYYY-MM-DD. Do not use another person's materials.`,
      history,
    );

    if (!data?.reply) {
      return {
        reply: 'The AI did not return a usable reply. Please try again.',
        kind: 'error',
        provider: provider || status.provider,
        session: local.session || session,
        difficulty: local.difficulty || difficulty,
      };
    }

    return {
      ...local,
      reply: data.reply,
      mode: data.mode || local.mode,
      difficulty: data.difficulty || local.difficulty,
      usedSource: Boolean(data.usedSource || local.usedSource),
      calendarSuggestion: data.calendarSuggestion && data.calendarSuggestion.title && data.calendarSuggestion.date
        ? data.calendarSuggestion
        : null,
      provider: provider || status.provider,
    };
  } catch (error) {
    console.error('Learning AI error:', error.response?.data || error.message);
    return {
      reply: error.response?.data?.error || error.message || 'The AI service failed. Please try again.',
      kind: 'error',
      provider: status.provider,
      session: local.session || session,
      difficulty: local.difficulty || difficulty,
    };
  }
}

function conversationSystem(profile, local) {
  const section = local.session?.activeSection || 'general';
  const hint = local.session?.sectionHint || 'General PlanWise help.';
  return `You are PlanWise AI, a real conversational tutor and teaching assistant for ${profile.name || 'the user'} (${profile.role || 'educator'}).
Speak naturally in paragraphs. Use short headings, bullets, numbered lists, or a tiny table only when they help.
Ask one follow-up question when you still need a subject, marks, question types, or a file.
Keep the same subject, quiz, assignment, and uploaded file unless the user changes them.
Never invent scores, files, previous chats, lesson facts, questions, or marks. If the source material is missing, ask for it.
Do not dump rigid "Topic:/Definition:/Questions:" blocks.
If the planner already started a live quiz, do not replace the quiz question; you may add a short natural lead-in.
Current section: ${section}. ${hint}
Prioritise that section, and still answer other supported PlanWise requests.
On the calendar, never say an event was saved. If the user wants a new event and has given a title and a date, end the reply with one line exactly:
CALENDAR_SUGGESTION: {"title":"Event title","date":"YYYY-MM-DD","startTime":"09:00","endTime":"10:00","type":"lesson"}
Ask them to confirm in the same reply. Do not include that line for any other request.
Current planner hint: kind=${local.kind}, mode=${local.mode}, subject=${local.session?.subject || 'none'}.`;
}

function conversationUser(message, local, extras) {
  return `User said: ${message}

Session subject: ${local.session?.subject || 'none'}
Session topics: ${(local.session?.topics || []).join(', ') || 'none'}
Difficulty: ${local.difficulty}
Source file: ${extras.materialName || 'none'}
Source excerpt:
${extras.materialText || 'NO SOURCE MATERIAL'}
Last assessment: ${extras.lastAssessment || 'none'}
Last quiz: ${extras.lastQuiz || 'none'}
This user's saved files: ${(local.session?.ownedDocumentTitles || []).join(', ') || 'none'}
This user's lesson plans: ${(local.session?.ownedPlanTitles || []).join(', ') || 'none'}
Calendar events already saved: ${JSON.stringify(local.session?.calendarEvents || []).slice(0, 4000)}

Planner draft reply (use as factual backing, rewrite naturally if this is a chat turn):
${local.reply}`;
}

export async function* runLearningTurnStream(args) {
  const local = converse({
    message: args.message,
    history: args.history,
    profile: args.profile,
    session: args.session,
    materialText: isReadableEducationalText(args.materialText) ? args.materialText : '',
    materialName: isReadableEducationalText(args.materialText) ? args.materialName : '',
    difficulty: args.difficulty,
    spec: args.spec,
    progress: args.progress,
  });
  const status = getLlmStatus();
  if (!status.configured) {
    const message = 'AI is not configured. Set GEMINI_API_KEY (or AI_API_KEY / GITHUB_TOKEN) on the server before using the assistant.';
    yield { event: 'delta', data: message };
    yield {
      event: 'done',
      data: {
        reply: message,
        kind: 'error',
        provider: null,
        session: local.session || args.session,
        difficulty: local.difficulty || args.difficulty,
      },
    };
    return;
  }

  const base = { ...local, provider: status.provider };
  yield { event: 'meta', data: { ...base, reply: '' } };

  if (local.kind === 'quiz-live') {
    yield { event: 'delta', data: local.reply };
    yield { event: 'done', data: base };
    return;
  }

  try {
    const extras = {
      materialName: args.materialName || '',
      materialText: isReadableEducationalText(args.materialText) ? truncateText(args.materialText, 6000) : '',
      lastAssessment: args.session?.lastAssessment?.title || '',
      lastQuiz: args.session?.quiz?.subject || args.session?.lastQuiz?.subject || '',
    };
    let full = '';
    for await (const token of streamText(conversationSystem(args.profile || {}, local), conversationUser(args.message, local, extras), args.history || [])) {
      full += token;
      yield { event: 'delta', data: token };
    }
    if (!full.trim()) {
      const message = 'The AI did not return a usable reply. Please try again.';
      yield { event: 'delta', data: message };
      yield { event: 'done', data: { ...local, reply: message, kind: 'error', provider: status.provider } };
      return;
    }
    yield { event: 'done', data: { ...local, reply: full.trim(), provider: status.provider } };
  } catch (error) {
    console.error('Stream AI error:', error.response?.data || error.message);
    const detail = error.response?.data?.error?.message
      || error.response?.data?.message
      || error.message
      || 'AI request failed';
    const message = `I could not reach the AI service (${detail}). Please try again.`;
    yield { event: 'delta', data: message };
    yield { event: 'done', data: { reply: message, kind: 'error', provider: status.provider, llmError: detail, session: local.session || args.session } };
  }
}
