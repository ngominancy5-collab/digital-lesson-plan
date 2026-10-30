import axios from 'axios';
import dotenv from 'dotenv';
import { AppError } from '../../utils/errors.js';

dotenv.config();

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value && !/^your_key_here$/i.test(value)) return value;
  }
  return '';
}

function openaiKey() {
  return firstEnv('OPENAI_API_KEY', 'AI_API_KEY');
}

function geminiKey() {
  return firstEnv('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY');
}

function githubKey() {
  return firstEnv('GITHUB_MODELS_TOKEN', 'COPILOT_API_KEY', 'GITHUB_TOKEN');
}

function detectProviderFromKey(key) {
  if (!key) return null;
  if (/^sk-/.test(key) || /^org-/.test(key)) return 'openai';
  if (/^AIza/.test(key)) return 'gemini';
  if (/^(ghp_|github_pat_)/.test(key)) return 'github';
  return null;
}

export function resolveLlmProvider() {
  const forced = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (forced === 'openai' && openaiKey()) return 'openai';
  if ((forced === 'gemini' || forced === 'google') && geminiKey()) return 'gemini';
  if ((forced === 'github' || forced === 'copilot') && githubKey()) return 'github';

  const fromAiKey = detectProviderFromKey(firstEnv('AI_API_KEY'));
  if (fromAiKey === 'gemini' && (geminiKey() || openaiKey())) return 'gemini';
  if (fromAiKey === 'github' && (githubKey() || openaiKey())) return 'github';
  if (openaiKey() && detectProviderFromKey(openaiKey()) !== 'gemini') return 'openai';
  if (geminiKey()) return 'gemini';
  if (githubKey()) return 'github';
  return null;
}

export function getLlmStatus() {
  const provider = resolveLlmProvider();
  const labels = {
    openai: 'ChatGPT',
    gemini: 'Gemini',
    github: 'GitHub Copilot Models',
  };
  return {
    configured: Boolean(provider),
    provider,
    label: provider ? labels[provider] : 'Not configured',
    hint: provider
      ? `Using ${labels[provider]} for lesson analysis and tutoring.`
      : 'Add GEMINI_API_KEY, AI_API_KEY (ChatGPT), or GITHUB_TOKEN to the server .env file. AI features require a configured provider.',
  };
}

function safeJson(content) {
  if (!content) return null;
  const trimmed = String(content).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function toOpenAiMessages(system, user, history = []) {
  return [
    { role: 'system', content: system },
    ...history.slice(-10).map((item) => ({
      role: item.role === 'assistant' || item.role === 'bot' ? 'assistant' : 'user',
      content: String(item.content || item.text || ''),
    })),
    { role: 'user', content: user },
  ].filter((item) => item.content);
}

async function completeOpenAi(system, user, history, { json, temperature, maxOutputTokens, timeout }) {
  const key = openaiKey();
  if (!key) return null;
  const body = {
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: temperature ?? (json ? 0.4 : 0.6),
    messages: toOpenAiMessages(system, user, history),
  };
  if (json) body.response_format = { type: 'json_object' };
  if (maxOutputTokens) body.max_tokens = maxOutputTokens;
  const response = await axios.post('https://api.openai.com/v1/chat/completions', body, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    timeout: timeout || 60000,
  });
  return response.data.choices?.[0]?.message?.content || '';
}

async function completeGitHub(system, user, history, { json, temperature, maxOutputTokens, timeout }) {
  const key = githubKey();
  if (!key) return null;
  const body = {
    model: process.env.GITHUB_MODEL || 'openai/gpt-4o-mini',
    temperature: temperature ?? (json ? 0.4 : 0.6),
    messages: toOpenAiMessages(system, user, history),
  };
  if (maxOutputTokens) body.max_tokens = maxOutputTokens;
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  try {
    const response = await axios.post('https://models.github.ai/inference/chat/completions', body, {
      headers,
      timeout: timeout || 60000,
    });
    return response.data.choices?.[0]?.message?.content || '';
  } catch (error) {
    if (error.response?.status !== 404) throw error;
    const response = await axios.post('https://models.inference.ai.azure.com/chat/completions', body, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      timeout: timeout || 60000,
    });
    return response.data.choices?.[0]?.message?.content || '';
  }
}

function geminiContents(system, user, history = []) {
  const contents = [];
  history.slice(-10).forEach((item) => {
    const text = String(item.content || item.text || '').trim();
    if (!text) return;
    contents.push({
      role: item.role === 'assistant' || item.role === 'bot' ? 'model' : 'user',
      parts: [{ text }],
    });
  });
  contents.push({ role: 'user', parts: [{ text: user }] });
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
  };
}

function geminiModelNames(preferred = []) {
  return [...new Set([
    ...((preferred || []).map((name) => String(name || '').trim()).filter(Boolean)),
    process.env.GEMINI_MODEL,
    // Prefer current fast Flash models; skip deprecated 2.x / hanging "latest" aliases.
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
  ].map((name) => String(name || '').trim()).filter(Boolean))];
}

function aiUnavailable(error) {
  const status = error?.response?.status;
  if (status === 429 || status === 503) {
    return new AppError('The AI service is busy right now. Please try again in a moment.', 503);
  }
  return new AppError('The AI service could not generate a response. Please try again.', 502);
}

async function postGemini(key, model, payload, options = {}) {
  let lastError;
  const retries = options.retries ?? 1;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        payload,
        { params: { key }, timeout: options.timeout || 60000, responseType: options.responseType },
      );
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if ((status === 429 || status === 503) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function completeGemini(system, user, history, options = {}) {
  const json = Boolean(options.json);
  const key = geminiKey() || (detectProviderFromKey(openaiKey()) === 'gemini' ? openaiKey() : '');
  if (!key) return null;

  let lastError;
  const models = geminiModelNames(options.preferredModels);
  for (const model of models) {
    try {
      const payload = {
        ...geminiContents(system, user, history),
        generationConfig: {
          temperature: options.temperature ?? (json ? 0.4 : 0.6),
          ...(json ? { responseMimeType: 'application/json' } : {}),
          ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        },
      };
      const response = await postGemini(key, model, payload, {
        timeout: options.timeout || 60000,
        retries: options.retries ?? 1,
      });
      const parts = response.data.candidates?.[0]?.content?.parts || [];
      const text = parts.map((part) => part.text || '').join('\n').trim();
      if (text) return text;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const timedOut = error.code === 'ECONNABORTED' || /timeout/i.test(String(error.message || ''));
      // Try the next model for missing/unsupported models or transient quota pressure.
      // Do not walk the full list after a hard timeout — that stacks latency.
      if (!timedOut && (status === 404 || status === 400 || status === 429 || status === 503)) continue;
      break;
    }
  }
  if (lastError) throw aiUnavailable(lastError);
  return '';
}

async function completeRaw(system, user, history = [], options = {}) {
  const json = Boolean(options.json);
  const provider = resolveLlmProvider();
  if (!provider) return { provider: null, content: '' };
  const callOptions = { ...options, json };

  if (provider === 'openai') return { provider, content: await completeOpenAi(system, user, history, callOptions) };
  if (provider === 'gemini') return { provider, content: await completeGemini(system, user, history, callOptions) };
  if (provider === 'github') return { provider, content: await completeGitHub(system, user, history, callOptions) };
  return { provider: null, content: '' };
}

export async function completeJson(system, user, history = [], options = {}) {
  const { provider, content } = await completeRaw(system, user, history, { ...options, json: true });
  return { provider, data: safeJson(content) };
}

export async function completeText(system, user, history = [], options = {}) {
  const result = await completeRaw(system, user, history, { ...options, json: false });
  return result;
}

async function* readOpenAiStyleStream(stream) {
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const token = json.choices?.[0]?.delta?.content
          || json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
          || '';
        if (token) yield token;
      } catch {
        // ignore partial JSON frames
      }
    }
  }
}

export async function* streamText(system, user, history = []) {
  const provider = resolveLlmProvider();
  if (!provider) return;

  if (provider === 'openai' || provider === 'github') {
    const key = provider === 'openai' ? openaiKey() : githubKey();
    const url = provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://models.github.ai/inference/chat/completions';
    const model = provider === 'openai'
      ? (process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini')
      : (process.env.GITHUB_MODEL || 'openai/gpt-4o-mini');
    const response = await axios.post(url, {
      model,
      temperature: 0.55,
      stream: true,
      messages: toOpenAiMessages(system, user, history),
    }, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      responseType: 'stream',
      timeout: 60000,
    });
    yield* readOpenAiStyleStream(response.data);
    return;
  }

  if (provider === 'gemini') {
    const key = geminiKey() || openaiKey();
    let lastError;
    for (const model of geminiModelNames()) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`,
          {
            ...geminiContents(system, user, history),
            generationConfig: { temperature: 0.55 },
          },
          { params: { key, alt: 'sse' }, responseType: 'stream', timeout: 60000 },
        );
        yield* readOpenAiStyleStream(response.data);
        return;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        if (status === 404 || status === 400 || status === 429 || status === 503) continue;
        break;
      }
    }
    throw aiUnavailable(lastError);
  }
}
