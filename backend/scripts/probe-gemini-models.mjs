import 'dotenv/config';
import axios from 'axios';

const key = process.env.GEMINI_API_KEY
  || process.env.GOOGLE_API_KEY
  || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  || process.env.AI_API_KEY;

console.log('KEY', key ? `${key.slice(0, 6)}...` : 'missing');

try {
  const listed = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
    params: { key },
    timeout: 20000,
  });
  const names = (listed.data.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => model.name?.replace(/^models\//, ''))
    .filter((name) => /flash/i.test(name || ''))
    .slice(0, 20);
  console.log('FLASH_MODELS', names.join(', '));
} catch (error) {
  console.log('LIST_FAIL', error.response?.status, error.response?.data?.error?.message || error.message);
}

const models = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash',
];

for (const model of models) {
  const t0 = Date.now();
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: 'Return JSON {"ok":true} only.' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 64,
        },
      },
      { params: { key }, timeout: 35000 },
    );
    const text = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    console.log('OK', model, `${Date.now() - t0}ms`, text.slice(0, 80));
  } catch (error) {
    console.log(
      'FAIL',
      model,
      `${Date.now() - t0}ms`,
      error.response?.status,
      error.response?.data?.error?.message || error.message,
    );
  }
}
