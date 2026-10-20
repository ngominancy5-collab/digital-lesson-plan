import prisma from '../config/database.js';

const SECRET_KEYS = /password|token|secret|hash|authorization|api[_-]?key/i;

function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const next = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_KEYS.test(key)) continue;
    if (value == null) continue;
    if (typeof value === 'string') next[key] = value.slice(0, 180);
    else if (typeof value === 'number' || typeof value === 'boolean') next[key] = value;
  }
  return next;
}

export function maskIdentifier(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const at = raw.indexOf('@');
  if (at > 0) {
    const name = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    return `${name.slice(0, 1)}***@${domain}`;
  }
  return `${raw.slice(0, 1)}***`;
}

export async function recordActivity({
  userId = null,
  actorRole = '',
  type,
  summary,
  targetType = '',
  targetId = '',
  outcome = 'success',
  meta = {},
} = {}) {
  try {
    if (!type || !summary) return null;
    return await prisma.activityLog.create({
      data: {
        userId: userId || null,
        actorRole: String(actorRole || '').slice(0, 40),
        type: String(type).slice(0, 80),
        summary: String(summary).slice(0, 240),
        targetType: String(targetType || '').slice(0, 40),
        targetId: String(targetId || '').slice(0, 80),
        outcome: String(outcome || 'success').slice(0, 40),
        meta: cleanMeta(meta),
      },
    });
  } catch (error) {
    console.error('Activity log was not saved.', error.code || 'failed');
    return null;
  }
}
