import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import lessonPlanRoutes from './routes/lessonPlanRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import { getLlmStatus } from './services/llm.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'PlanWise AI API is running', llm: getLlmStatus() });
});

app.use('/api/lesson-plans', lessonPlanRoutes);
app.use('/api/ai', aiRoutes);

const distPath = path.resolve(__dirname, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  const llm = getLlmStatus();
  console.log(`PlanWise AI server running on http://localhost:${port}`);
  if (llm.configured) {
    console.log(`LLM connected: ${llm.label}`);
  } else {
    console.log('LLM not connected — using local tutor fallback.');
    console.log('Add GEMINI_API_KEY or AI_API_KEY (OpenAI) to .env, then restart the server.');
  }
});
