import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const storePath = path.join(dataDir, 'ai-store.json');

function emptyStore() {
  return { conversations: {}, progress: {} };
}

function readStore() {
  try {
    if (!fs.existsSync(storePath)) return emptyStore();
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(storePath, 'utf8')) };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function scopedUser(userId) {
  return String(userId || '').trim() || 'anonymous';
}

export function listConversations(userId) {
  const store = readStore();
  const items = store.conversations[scopedUser(userId)] || [];
  return items
    .map(({ messages, session, materialText, ...rest }) => ({
      ...rest,
      preview: messages?.filter((item) => item.role === 'user').slice(-1)[0]?.content || rest.title,
      messageCount: messages?.length || 0,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getConversation(userId, conversationId) {
  const store = readStore();
  return (store.conversations[scopedUser(userId)] || []).find((item) => item.id === conversationId) || null;
}

export function saveConversation(userId, conversation) {
  const store = readStore();
  const key = scopedUser(userId);
  const list = store.conversations[key] || [];
  const index = list.findIndex((item) => item.id === conversation.id);
  const record = {
    ...conversation,
    userId: key,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) list[index] = record;
  else list.unshift(record);
  store.conversations[key] = list.slice(0, 40);
  writeStore(store);
  return record;
}

export function getProgress(userId) {
  const store = readStore();
  return store.progress[scopedUser(userId)] || { quizzes: [], weakTopics: [], topicsStudied: [] };
}

export function saveProgress(userId, update) {
  if (!update) return getProgress(userId);
  const store = readStore();
  const key = scopedUser(userId);
  const current = store.progress[key] || { quizzes: [], weakTopics: [], topicsStudied: [] };
  const quizzes = [update, ...(current.quizzes || [])].slice(0, 50);
  const weakTopics = [...new Set([...(update.weakTopics || []), ...(current.weakTopics || [])])].slice(0, 20);
  const topicsStudied = [...new Set([update.subject, ...(current.topicsStudied || [])].filter(Boolean))].slice(0, 30);
  store.progress[key] = { quizzes, weakTopics, topicsStudied };
  writeStore(store);
  return store.progress[key];
}
