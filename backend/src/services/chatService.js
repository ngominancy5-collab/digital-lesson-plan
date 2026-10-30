import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { recordActivity } from './activityService.js';
import { buildAssistantSystemPrompt, generateWithGemini } from './ai/geminiService.js';
import { runLearningTurn, runLearningTurnStream } from './ai/learningAi.js';
import { getLlmStatus } from './ai/aiClient.js';
import * as conversationRepository from '../repositories/conversationRepository.js';
import * as lessonPlanRepository from '../repositories/lessonPlanRepository.js';
import * as documentRepository from '../repositories/documentRepository.js';

export { getLlmStatus };

export async function listConversations(userId) {
  return conversationRepository.listByUser(userId);
}

export async function getConversation(userId, id) {
  const conversation = await conversationRepository.findOwned(userId, id);
  if (!conversation) throw new AppError('Conversation not found.', 404);
  return conversation;
}

export async function createConversation(userId, title = 'New conversation') {
  return conversationRepository.create(userId, title);
}

async function ensureConversation(userId, conversationId) {
  if (conversationId) {
    const existing = await conversationRepository.findOwnedBrief(userId, conversationId);
    if (existing) return existing;
  }
  return createConversation(userId);
}

async function persistMessages(conversation, userMessage, assistantMessage, titleHint) {
  await conversationRepository.addMessages(conversation.id, userMessage, assistantMessage);
  return conversationRepository.updateConversation(conversation.id, {
    title: conversation.title === 'New conversation' && titleHint
      ? String(titleHint).slice(0, 48)
      : conversation.title,
    updatedAt: new Date(),
  });
}

export async function chat(userId, body, user) {
  const message = String(body.message || '').trim();
  if (!message) throw new AppError('Please enter a question or instruction.');

  const conversation = await ensureConversation(userId, body.conversationId);
  const historyRows = await conversationRepository.recentMessages(conversation.id);
  const history = historyRows.map((row) => ({
    role: row.sender === 'assistant' ? 'assistant' : 'user',
    content: row.message,
  }));

  const [lessonPlans, documents] = await Promise.all([
    lessonPlanRepository.titlesForUser(userId),
    documentRepository.titlesForUser(userId),
  ]);

  let result;
  try {
    result = await runLearningTurn({
      message,
      history: body.history || history,
      materialText: body.materialText || '',
      materialName: body.materialName || '',
      difficulty: body.difficulty || 'Intermediate',
      session: {
        ...(body.session || {}),
        ownedDocumentTitles: documents.map((item) => item.title || item.originalName || item.fileName).filter(Boolean).slice(0, 20),
        ownedPlanTitles: lessonPlans.map((item) => item.title || item.courseName).filter(Boolean).slice(0, 20),
      },
      profile: body.profile || mapUser(user) || {},
      spec: body.spec || {},
      progress: body.progress || {},
    });
  } catch {
    const system = buildAssistantSystemPrompt({
      user: mapUser(user),
      lessonPlans,
      documents,
    });
    const llm = await generateWithGemini({
      system,
      user: message,
      history,
      json: false,
    });
    result = {
      reply: llm.content || 'I could not generate a response right now. Please try again.',
      session: body.session || {},
    };
  }

  const saved = await persistMessages(
    conversation,
    message,
    result.reply || '',
    result.session?.subject || body.materialName || message,
  );

  await recordActivity({
    userId,
    type: 'ai.assistant',
    summary: 'AI assistant reply saved',
    targetType: 'conversation',
    targetId: saved.id,
  });
  return {
    ...result,
    conversationId: saved.id,
    conversationTitle: saved.title,
  };
}

function withTimeout(promise, ms, label = 'Timed out') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function chatStream(userId, body, user, res) {
  const message = String(body.message || '').trim();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!message) {
    send('error', { error: 'Please enter a question or instruction.' });
    res.end();
    return;
  }

  // Acknowledge immediately so the UI is not stuck on "..." during DB cold starts.
  send('meta', { status: 'started', reply: '' });

  let conversation = null;
  let history = Array.isArray(body.history) ? body.history : [];
  let lessonPlans = [];
  let documents = [];

  try {
    conversation = await withTimeout(
      ensureConversation(userId, body.conversationId),
      6000,
      'Conversation lookup timed out',
    );
    if (!history.length) {
      const historyRows = await withTimeout(
        conversationRepository.recentMessages(conversation.id),
        5000,
        'Chat history lookup timed out',
      );
      history = historyRows.map((row) => ({
        role: row.sender === 'assistant' ? 'assistant' : 'user',
        content: row.message,
      }));
    }
  } catch (error) {
    send('meta', {
      status: 'degraded',
      detail: error.message || 'Continuing without saved chat history.',
      reply: '',
    });
  }

  try {
    const titles = await withTimeout(
      Promise.all([
        lessonPlanRepository.titlesForUser(userId),
        documentRepository.titlesForUser(userId),
      ]),
      5000,
      'Workspace titles timed out',
    );
    lessonPlans = titles[0] || [];
    documents = titles[1] || [];
  } catch {
    // Optional context only — do not block the reply.
  }

  let finalResult = null;
  try {
    for await (const chunk of runLearningTurnStream({
      message,
      history,
      materialText: body.materialText || '',
      materialName: body.materialName || '',
      difficulty: body.difficulty || 'Intermediate',
      session: {
        ...(body.session || {}),
        ownedDocumentTitles: documents.map((item) => item.title || item.originalName || item.fileName).filter(Boolean).slice(0, 20),
        ownedPlanTitles: lessonPlans.map((item) => item.title || item.courseName).filter(Boolean).slice(0, 20),
      },
      profile: body.profile || mapUser(user) || {},
      spec: body.spec || {},
      progress: body.progress || {},
    })) {
      if (chunk.event === 'done') finalResult = chunk.data;
      send(chunk.event, chunk.data);
    }

    if (finalResult?.reply && conversation?.id) {
      try {
        const saved = await withTimeout(
          persistMessages(
            conversation,
            message,
            finalResult.reply,
            body.materialName || message,
          ),
          6000,
          'Saving chat timed out',
        );
        send('saved', {
          conversationId: saved.id,
          conversationTitle: saved.title,
        });
      } catch (error) {
        send('meta', { status: 'unsaved', detail: error.message || 'Reply was not saved.' });
      }
    }
  } catch (error) {
    send('error', { error: error.message || 'AI stream failed.' });
  }
  res.end();
}
