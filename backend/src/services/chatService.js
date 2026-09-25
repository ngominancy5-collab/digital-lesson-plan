import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { buildAssistantSystemPrompt, generateWithGemini } from './geminiService.js';
import { runLearningTurn, runLearningTurnStream } from './learningAi.js';
import { getLlmStatus } from './llm.js';

export { getLlmStatus };

export async function listConversations(userId) {
  return prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
}

export async function getConversation(userId, id) {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) throw new AppError('Conversation not found.', 404);
  return conversation;
}

export async function createConversation(userId, title = 'New conversation') {
  return prisma.aiConversation.create({
    data: { userId, title },
    include: { messages: true },
  });
}

async function ensureConversation(userId, conversationId) {
  if (conversationId) {
    const existing = await prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
    if (existing) return existing;
  }
  return createConversation(userId);
}

async function persistMessages(conversation, userMessage, assistantMessage, titleHint) {
  await prisma.aiMessage.createMany({
    data: [
      { conversationId: conversation.id, sender: 'user', message: userMessage },
      { conversationId: conversation.id, sender: 'assistant', message: assistantMessage },
    ],
  });
  return prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      title: conversation.title === 'New conversation' && titleHint
        ? String(titleHint).slice(0, 48)
        : conversation.title,
      updatedAt: new Date(),
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function chat(userId, body, user) {
  const message = String(body.message || '').trim();
  if (!message) throw new AppError('Please enter a question or instruction.');

  const conversation = await ensureConversation(userId, body.conversationId);
  const historyRows = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });
  const history = historyRows.map((row) => ({
    role: row.sender === 'assistant' ? 'assistant' : 'user',
    content: row.message,
  }));

  const [lessonPlans, documents] = await Promise.all([
    prisma.lessonPlan.findMany({ where: { userId }, select: { id: true, title: true }, take: 20 }),
    prisma.document.findMany({ where: { userId }, select: { id: true, originalName: true }, take: 20 }),
  ]);

  let result;
  try {
    result = await runLearningTurn({
      message,
      history: body.history || history,
      materialText: body.materialText || '',
      materialName: body.materialName || '',
      difficulty: body.difficulty || 'Intermediate',
      session: body.session || {},
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

  return {
    ...result,
    conversationId: saved.id,
    conversationTitle: saved.title,
  };
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

  const conversation = await ensureConversation(userId, body.conversationId);
  const historyRows = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });
  const history = historyRows.map((row) => ({
    role: row.sender === 'assistant' ? 'assistant' : 'user',
    content: row.message,
  }));

  let finalResult = null;
  try {
    for await (const chunk of runLearningTurnStream({
      message,
      history: body.history || history,
      materialText: body.materialText || '',
      materialName: body.materialName || '',
      difficulty: body.difficulty || 'Intermediate',
      session: body.session || {},
      profile: body.profile || mapUser(user) || {},
      spec: body.spec || {},
      progress: body.progress || {},
    })) {
      if (chunk.event === 'done') finalResult = chunk.data;
      send(chunk.event, chunk.data);
    }

    if (finalResult?.reply) {
      const saved = await persistMessages(
        conversation,
        message,
        finalResult.reply,
        body.materialName || message,
      );
      send('saved', {
        conversationId: saved.id,
        conversationTitle: saved.title,
      });
    }
  } catch (error) {
    send('error', { error: error.message || 'AI stream failed.' });
  }
  res.end();
}
