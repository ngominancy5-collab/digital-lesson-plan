import express from 'express';
import { parseUploadedDocument } from '../services/documentParser.js';
import { analyzeLearningMaterial, runLearningTurn, runLearningTurnStream } from '../services/learningAi.js';
import { getLlmStatus } from '../services/llm.js';
import { getConversation, getProgress, listConversations, saveConversation, saveProgress } from '../store/aiStore.js';
import { makeId } from '../../shared/learningEngine.js';

const router = express.Router();

function userIdFrom(req) {
  return String(req.body?.userId || req.query.userId || '').trim();
}

router.get('/status', (_req, res) => {
  return res.json(getLlmStatus());
});

router.get('/conversations', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Sign in to load your conversations.' });
  return res.json({ conversations: listConversations(userId), progress: getProgress(userId) });
});

router.get('/conversations/:id', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Sign in to load this conversation.' });
  const conversation = getConversation(userId, req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json({ conversation, progress: getProgress(userId) });
});

router.post('/conversations', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Sign in to start a conversation.' });
  const conversation = saveConversation(userId, {
    id: makeId('convo'),
    title: 'New conversation',
    messages: [],
    session: { mode: 'tutor', difficulty: 'Intermediate', topics: [] },
    createdAt: new Date().toISOString(),
  });
  return res.json({ conversation });
});

router.post('/extract', async (req, res) => {
  try {
    const result = await parseUploadedDocument(req.body || {});
    if (!result.ok) return res.status(422).json({ ok: false, error: result.error });
    return res.json(result);
  } catch {
    return res.status(500).json({
      ok: false,
      error: 'The file could not be processed. I did not analyse it.',
    });
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const { text, fileName } = req.body || {};
    if (!String(text || '').trim()) {
      return res.status(400).json({ error: 'No readable text was provided, so analysis was not performed.' });
    }
    const analysis = await analyzeLearningMaterial({ text, fileName });
    if (analysis.error) return res.status(422).json(analysis);
    return res.json(analysis);
  } catch {
    return res.status(500).json({ error: 'Unable to analyse this material.' });
  }
});

function persistTurn({ userId, conversationId, existing, message, result, materialName }) {
  const messages = [
    ...(existing?.messages || []),
    { role: 'user', content: message, time: new Date().toISOString() },
    { role: 'assistant', content: result.reply, time: new Date().toISOString() },
  ].slice(-80);
  const titleSource = result.session?.subject || materialName || message;
  return saveConversation(userId, {
    id: existing?.id || conversationId || makeId('convo'),
    title: String(titleSource).slice(0, 48),
    messages,
    session: result.session || {},
    materialName: materialName || existing?.materialName || '',
    createdAt: existing?.createdAt || new Date().toISOString(),
  });
}

router.post('/chat', async (req, res) => {
  try {
    const {
      message,
      history,
      materialText,
      materialName,
      difficulty,
      session,
      userId,
      conversationId,
      profile,
      spec,
    } = req.body || {};
    if (!String(message || '').trim()) {
      return res.status(400).json({ error: 'Please enter a question or instruction.' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Sign in to use the AI assistant.' });
    }

    const existing = conversationId ? getConversation(userId, conversationId) : null;
    const progress = getProgress(userId);
    const result = await runLearningTurn({
      message,
      history: history || existing?.messages || [],
      materialText: materialText || existing?.materialText || '',
      materialName: materialName || existing?.materialName || '',
      difficulty: difficulty || existing?.session?.difficulty || 'Intermediate',
      session: { ...(existing?.session || {}), ...(session || {}) },
      profile: profile || {},
      spec: spec || {},
      progress,
    });

    const saved = persistTurn({
      userId,
      conversationId,
      existing,
      message,
      result,
      materialName: materialName || existing?.materialName || '',
    });

    const progressState = result.progressUpdate ? saveProgress(userId, result.progressUpdate) : progress;

    return res.json({
      ...result,
      conversationId: saved.id,
      conversationTitle: saved.title,
      progress: progressState,
    });
  } catch {
    return res.status(500).json({ error: 'The AI assistant could not complete that request. Please try again.' });
  }
});

router.post('/chat/stream', async (req, res) => {
  const {
    message,
    history,
    materialText,
    materialName,
    difficulty,
    session,
    userId,
    conversationId,
    profile,
    spec,
  } = req.body || {};
  if (!String(message || '').trim()) {
    return res.status(400).json({ error: 'Please enter a question or instruction.' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Sign in to use the AI assistant.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const existing = conversationId ? getConversation(userId, conversationId) : null;
    const progress = getProgress(userId);
    let finalResult = null;
    for await (const piece of runLearningTurnStream({
      message,
      history: history || existing?.messages || [],
      materialText: materialText || existing?.materialText || '',
      materialName: materialName || existing?.materialName || '',
      difficulty: difficulty || existing?.session?.difficulty || 'Intermediate',
      session: { ...(existing?.session || {}), ...(session || {}) },
      profile: profile || {},
      spec: spec || {},
      progress,
    })) {
      if (piece.event === 'done') finalResult = piece.data;
      send(piece.event, piece.data);
    }
    if (finalResult) {
      const saved = persistTurn({
        userId,
        conversationId,
        existing,
        message,
        result: finalResult,
        materialName: materialName || existing?.materialName || '',
      });
      const progressState = finalResult.progressUpdate ? saveProgress(userId, finalResult.progressUpdate) : progress;
      send('saved', {
        conversationId: saved.id,
        conversationTitle: saved.title,
        progress: progressState,
      });
    }
    res.end();
  } catch {
    send('error', { error: 'The AI assistant could not complete that request. Please try again.' });
    res.end();
  }
});

export default router;
