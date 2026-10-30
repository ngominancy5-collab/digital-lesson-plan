import 'dotenv/config';

const API = process.env.BENCH_API_URL || 'http://127.0.0.1:3001/api';

async function login() {
  const combos = [
    [process.env.BENCH_EMAIL, process.env.BENCH_PASSWORD],
    ['admin@planwise.local', 'Admin1234'],
    ['planwiseadmin@gmail.com', '123Admin!*'],
  ].filter(([email, password]) => email && password);

  for (const [email, password] of combos) {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await response.json().catch(() => ({}));
    const data = json.data || json;
    if (response.ok && data.token) return data.token;
  }
  throw new Error('Could not sign in for API benchmark.');
}

async function ensureDocument(token) {
  const listRes = await fetch(`${API}/resources`, { headers: { Authorization: `Bearer ${token}` } });
  const listJson = await listRes.json();
  const payload = listJson.data || listJson;
  const existing = payload.resources || [];
  if (existing.length) return existing.slice(0, 2).map((item) => item.id);

  const body = new FormData();
  const content = `Chapter 1 Intro to PHP\nPHP builds dynamic pages.\n\nChapter 2 Variables\nUse $name and scalar types.\n\nChapter 3 Control Flow\nif, while, for loops.\n\nChapter 4 Files\nfopen fread fwrite fclose.\n`;
  body.append('file', new Blob([content], { type: 'text/plain' }), 'php-bench.txt');
  body.append('courseName', 'PHP Programming');
  body.append('courseCode', 'PHP101');

  const uploadRes = await fetch(`${API}/resources`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    throw new Error(uploadJson.message || uploadJson.error || 'Upload failed');
  }
  const uploaded = uploadJson.data || uploadJson;
  const id = uploaded.resource?.id || uploaded.id || uploaded.resources?.[0]?.id;
  if (!id) throw new Error('Upload succeeded but no document id returned.');
  return [id];
}

const token = await login();
const documentIds = await ensureDocument(token);
console.log('DOC_COUNT', documentIds.length);

const t0 = Date.now();
const response = await fetch(`${API}/lesson-plans/generate`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    courseName: 'PHP Programming',
    courseCode: 'PHP101',
    topics: [],
    numberOfWeeks: 4,
    lessonsPerWeek: 2,
    lessonDuration: '60 minutes',
    holidays: [],
    documentId: documentIds[0],
    documentIds,
    customInstructions: 'Generate a practical teaching plan from the selected source files only.',
    difficulty: 'Intermediate',
  }),
  signal: AbortSignal.timeout(90000),
});
const ms = Date.now() - t0;
const json = await response.json().catch(() => ({}));
const plan = json.data || json;
const lessons = plan.plan?.lessons || plan.lessons || [];
console.log('API_STATUS', response.status);
console.log('API_GENERATE_MS', ms);
console.log('API_GENERATE_SEC', (ms / 1000).toFixed(1));
console.log('LESSONS', Array.isArray(lessons) ? lessons.length : 0);
if (!response.ok) {
  console.log('API_ERR', json.message || json.error || JSON.stringify(json).slice(0, 300));
  process.exitCode = 1;
}
