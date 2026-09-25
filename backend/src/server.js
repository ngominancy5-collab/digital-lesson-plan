import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertEnv, env } from './config/env.js';
import { errorHandler } from './utils/errors.js';
import authRoutes from './routes/authRoutes.js';
import {
  aiRoutes,
  assessmentRoutes,
  calendarRoutes,
  courseRoutes,
  dashboardRoutes,
  documentRoutes,
  lessonPlanRoutes,
  quizRoutes,
} from './routes/index.js';
import { getLlmStatus } from './services/llm.js';

assertEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.clientUrl,
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(env.fileStoragePath));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'PlanWise AI API is running',
    llm: getLlmStatus(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/lesson-plans', lessonPlanRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/ai', aiRoutes);

const distPath = path.resolve(__dirname, '../../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(env.port, () => {
  const llm = getLlmStatus();
  console.log(`PlanWise backend running on http://localhost:${env.port}`);
  console.log(llm.configured ? `LLM connected: ${llm.label}` : 'LLM not configured — add GEMINI_API_KEY to .env');
});
