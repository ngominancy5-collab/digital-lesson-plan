import dotenv from 'dotenv';
import { fallbackAnalyze, isReadableEducationalText, truncateText } from '../../../../shared/learningEngine.js';
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

  const local = fallbackAnalyze(text, fileName);
  const status = getLlmStatus();

  try {
    const { provider, data } = await completeJson(
      'You are an expert lecturer. Analyse only the provided source. Return JSON. Never output scrambled or encoded characters.',
      analysisPrompt(text, fileName || 'Uploaded material'),
    );
    if (data?.error) return { error: data.error };
    if (data?.topic && Array.isArray(data.learningObjectives) && data.learningObjectives.length) {
      return {
        ...(local.error ? {} : local),
        ...data,
        fileName,
        sourceReady: true,
        provider: provider || status.provider,
      };
    }
  } catch (error) {
    console.error('Material analysis error:', error.response?.data || error.message);
  }

  if (local.error) return local;
  return { ...local, provider: 'local' };
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

  if (local.kind === 'quiz-live') {
    return { ...local, provider: getLlmStatus().configured ? 'hybrid' : 'local' };
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

Return JSON:
{
  "reply": "natural conversational reply",
  "mode": "tutor|quiz|revision|assessment|assignment|exam-prep",
  "difficulty": "${local.difficulty || difficulty}",
  "usedSource": false,
  "askClarification": false
}`,
      history,
    );

    if (!data?.reply) return { ...local, provider: 'local' };

    return {
      ...local,
      reply: data.reply,
      mode: data.mode || local.mode,
      difficulty: data.difficulty || local.difficulty,
      usedSource: Boolean(data.usedSource || local.usedSource),
      provider: provider || 'openai',
    };
  } catch (error) {
    console.error('Learning AI error:', error.response?.data || error.message);
    return { ...local, provider: 'local' };
  }
}

function conversationSystem(profile, local) {
  return `You are PlanWise AI, a real conversational tutor and teaching assistant for ${profile.name || 'the user'} (${profile.role || 'learner'}).
Speak naturally in paragraphs. Use short headings, bullets, numbered lists, or a tiny table only when they help.
Ask one follow-up question when you still need a subject, marks, question types, or a file.
Keep the same subject, quiz, assignment, and uploaded file unless the user changes them.
Never invent scores, files, or previous chats. If you do not know, ask.
Do not dump rigid "Topic:/Definition:/Questions:" blocks.
If the planner already started a live quiz, do not replace the quiz question; you may add a short natural lead-in.
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
  const base = { ...local, provider: status.configured ? status.provider : 'local' };
  yield { event: 'meta', data: { ...base, reply: '' } };

  const keepLocalVoice = local.kind === 'quiz-live' || !status.configured;
  if (keepLocalVoice) {
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
      yield { event: 'delta', data: local.reply };
      yield { event: 'done', data: { ...local, provider: 'local' } };
      return;
    }
    yield { event: 'done', data: { ...local, reply: full.trim(), provider: status.provider } };
  } catch (error) {
    console.error('Stream AI error:', error.response?.data || error.message);
    const detail = error.response?.data?.error?.message
      || error.response?.data?.message
      || error.message
      || 'AI request failed';
    yield {
      event: 'delta',
      data: `I could not reach the live AI service (${detail}). Falling back to the local tutor for this reply.\n\n${local.reply}`,
    };
    yield { event: 'done', data: { ...local, provider: 'local', llmError: detail } };
  }
}
