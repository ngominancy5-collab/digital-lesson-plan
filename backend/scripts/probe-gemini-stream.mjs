import 'dotenv/config';
import axios from 'axios';

const key = process.env.GEMINI_API_KEY
  || process.env.GOOGLE_API_KEY
  || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  || process.env.AI_API_KEY;

const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
console.log('MODEL', model);

const t0 = Date.now();
try {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`,
    {
      contents: [{ role: 'user', parts: [{ text: 'Say hello in one short sentence.' }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 64 },
    },
    { params: { key, alt: 'sse' }, responseType: 'stream', timeout: 25000 },
  );

  let chunks = 0;
  let sample = '';
  for await (const chunk of response.data) {
    chunks += 1;
    const text = chunk.toString();
    if (sample.length < 400) sample += text;
    if (chunks >= 8) break;
  }
  console.log('STREAM_OK', `${Date.now() - t0}ms`, 'chunks', chunks);
  console.log('SAMPLE', sample.slice(0, 400).replace(/\n/g, '\\n'));
} catch (error) {
  console.log('STREAM_FAIL', `${Date.now() - t0}ms`, error.response?.status, error.response?.data?.error?.message || error.message);
}

const t1 = Date.now();
try {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{ role: 'user', parts: [{ text: 'Say hello in one short sentence.' }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 64 },
    },
    { params: { key }, timeout: 25000 },
  );
  const text = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  console.log('NONSTREAM_OK', `${Date.now() - t1}ms`, text);
} catch (error) {
  console.log('NONSTREAM_FAIL', `${Date.now() - t1}ms`, error.response?.status, error.response?.data?.error?.message || error.message);
}
