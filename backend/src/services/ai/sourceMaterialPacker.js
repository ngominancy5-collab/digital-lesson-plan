/**
 * Packs already-extracted document text into a compact, high-signal prompt payload.
 * Does not re-parse files — callers pass Document.extractedText from the DB.
 */

const HEADING_RE = /^(?:#{1,6}\s+|[A-Z0-9][A-Z0-9 \-/:]{6,}$|(?:\d+(?:\.\d+){0,3}|[IVXLC]+)[.)]\s+\S+|chapter\s+\d+|unit\s+\d+|lesson\s+\d+|topic\s+\d+)/i;
const SIGNAL_RE = /\b(objective|outcome|learning|definition|example|exercise|practice|assessment|summary|introduction|conclusion|method|algorithm|syntax|concept|week|module|chapter|unit|topic)\b/i;

const packCache = new Map();
const PACK_CACHE_TTL_MS = 10 * 60 * 1000;
const PACK_CACHE_MAX = 40;

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cacheKey(files, topics, totalBudget) {
  const ids = files.map((file) => `${file.id || file.name}:${String(file.text || '').length}`).join('|');
  return `${totalBudget}::${(topics || []).join(',').toLowerCase()}::${ids}`;
}

function readCache(key) {
  const hit = packCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PACK_CACHE_TTL_MS) {
    packCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value) {
  packCache.set(key, { at: Date.now(), value });
  if (packCache.size > PACK_CACHE_MAX) {
    const oldest = packCache.keys().next().value;
    packCache.delete(oldest);
  }
}

export function clearSourcePackCache() {
  packCache.clear();
}

function splitChunks(text) {
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw) return [];

  const pageSplit = raw.split(/\n\s*---\s*Page\s+\d+\s*---\s*\n/i).map((part) => part.trim()).filter(Boolean);
  const blocks = pageSplit.length > 1 ? pageSplit : raw.split(/\n{2,}/);

  const chunks = [];
  for (const block of blocks) {
    const cleaned = block.replace(/[ \t]+\n/g, '\n').trim();
    if (cleaned.length < 40) continue;
    if (cleaned.length <= 900) {
      chunks.push(cleaned);
      continue;
    }
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    let bucket = '';
    for (const sentence of sentences) {
      if ((bucket + ' ' + sentence).trim().length > 850 && bucket) {
        chunks.push(bucket.trim());
        bucket = sentence;
      } else {
        bucket = `${bucket} ${sentence}`.trim();
      }
    }
    if (bucket.trim()) chunks.push(bucket.trim());
  }
  return chunks;
}

function scoreChunk(chunk, topics = [], fileName = '') {
  const text = String(chunk || '');
  const lower = text.toLowerCase();
  let score = 0;
  const firstLine = text.split('\n')[0] || '';
  if (HEADING_RE.test(firstLine.trim())) score += 8;
  if (SIGNAL_RE.test(text)) score += 5;
  if (/^[A-Z].{0,80}$/m.test(firstLine) && firstLine.length < 90) score += 2;

  for (const topic of topics) {
    const needle = String(topic || '').trim().toLowerCase();
    if (needle.length < 3) continue;
    if (lower.includes(needle)) score += 12;
  }

  const nameTokens = String(fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[^a-z0-9]+/i)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 3);
  for (const token of nameTokens.slice(0, 6)) {
    if (lower.includes(token)) score += 3;
  }

  const words = text.split(/\s+/).length;
  if (words >= 40 && words <= 220) score += 3;
  if (words < 20) score -= 4;
  if (/(lorem ipsum|placeholder|sample text)/i.test(text)) score -= 20;
  return score;
}

function takeBudget(chunks, budget) {
  if (budget <= 0 || !chunks.length) return '';
  const picked = [];
  let used = 0;
  for (const chunk of chunks) {
    const piece = normalizeSpace(chunk);
    if (!piece) continue;
    const next = used ? used + 2 + piece.length : piece.length;
    if (next > budget) {
      const remain = budget - used - (used ? 2 : 0);
      if (remain >= 120) {
        picked.push(`${piece.slice(0, remain - 1).trim()}…`);
        used = budget;
      }
      break;
    }
    picked.push(piece);
    used = next;
  }
  return picked.join('\n\n');
}

function selectChunksForFile(text, { budget, topics, fileName }) {
  const chunks = splitChunks(text);
  if (!chunks.length) return normalizeSpace(text).slice(0, budget);

  const scored = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: scoreChunk(chunk, topics, fileName),
  }));

  // Prefer relevance first so early filler pages cannot consume the whole budget.
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Map();

  for (const item of ranked) {
    if (selected.size >= 12) break;
    if (item.score < 3 && selected.size >= 4) continue;
    selected.set(item.index, item);
  }

  // Keep a little context from the start/end when budget remains after high-signal picks.
  for (const item of [scored[0], scored[scored.length - 1]].filter(Boolean)) {
    if (selected.size >= 14) break;
    selected.set(item.index, item);
  }

  const byScore = [...selected.values()].sort((a, b) => b.score - a.score || a.index - b.index);
  const kept = [];
  let used = 0;
  for (const item of byScore) {
    const piece = normalizeSpace(item.chunk);
    if (!piece) continue;
    const next = used ? used + 2 + piece.length : piece.length;
    if (next > budget) {
      const remain = budget - used - (used ? 2 : 0);
      if (remain >= 120 && item.score >= 8) {
        kept.push({ index: item.index, chunk: `${piece.slice(0, remain - 1).trim()}…` });
        used = budget;
      }
      continue;
    }
    kept.push({ index: item.index, chunk: piece });
    used = next;
    if (used >= budget) break;
  }

  return kept
    .sort((a, b) => a.index - b.index)
    .map((item) => item.chunk)
    .join('\n\n');
}

/**
 * @param {{ id?: string, name?: string, text: string }[]} files
 * @param {{ topics?: string[], totalBudget?: number, notes?: string }} [options]
 */
export function packSourceMaterial(files = [], options = {}) {
  const topics = (options.topics || []).map((topic) => String(topic || '').trim()).filter(Boolean);
  const totalBudget = Math.max(1500, Math.min(Number(options.totalBudget) || 7000, 10000));
  const notes = normalizeSpace(options.notes || '');
  const usable = (files || []).filter((file) => String(file?.text || '').trim());

  if (!usable.length && !notes) return { materialText: '', usedChars: 0, fileCount: 0, fromCache: false };

  const key = cacheKey(usable, topics, totalBudget);
  const cached = readCache(key);
  if (cached) return { ...cached, fromCache: true };

  const noteBudget = notes ? Math.min(1200, Math.floor(totalBudget * 0.18)) : 0;
  const fileBudgetTotal = totalBudget - noteBudget;
  const perFile = Math.max(900, Math.floor(fileBudgetTotal / Math.max(usable.length, 1)));

  const parts = [];
  if (notes) {
    parts.push(`Teacher notes:\n${notes.slice(0, noteBudget)}`);
  }

  for (const file of usable) {
    const name = file.name || 'Uploaded file';
    const packed = selectChunksForFile(file.text, {
      budget: perFile,
      topics,
      fileName: name,
    });
    if (!packed) continue;
    parts.push(`Source file: ${name}\n${packed}`);
  }

  let materialText = parts.join('\n\n').trim();
  if (materialText.length > totalBudget) materialText = `${materialText.slice(0, totalBudget - 1).trim()}…`;

  const value = {
    materialText,
    usedChars: materialText.length,
    fileCount: usable.length,
  };
  writeCache(key, value);
  return { ...value, fromCache: false };
}

export function deriveTopicsFromMaterial(materialText, limit = 8) {
  const lines = String(materialText || '')
    .split('\n')
    .map((line) => normalizeSpace(line))
    .filter(Boolean);
  const topics = [];
  for (const line of lines) {
    if (line.length < 8 || line.length > 90) continue;
    if (!HEADING_RE.test(line) && !/^[A-Z][A-Za-z0-9 ,/\-:]{7,70}$/.test(line)) continue;
    if (/^source file:/i.test(line) || /^teacher notes:/i.test(line)) continue;
    const cleaned = line.replace(/^#+\s+/, '').replace(/^\d+(?:\.\d+)*[.)]\s+/, '').trim();
    if (cleaned.length < 6) continue;
    if (topics.some((topic) => topic.toLowerCase() === cleaned.toLowerCase())) continue;
    topics.push(cleaned);
    if (topics.length >= limit) break;
  }
  return topics;
}
