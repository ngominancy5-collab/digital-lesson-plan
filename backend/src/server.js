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
import userRoutes from './routes/userRoutes.js';
import institutionRoutes from './routes/institutionRoutes.js';
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
import { getLlmStatus } from './services/ai/aiClient.js';
import { responseEnvelope } from './middleware/response.js';
import {
  attendanceRoutes,
  markingRoutes,
  notificationRoutes,
  reportRoutes,
  resourceRoutes,
  searchRoutes,
  settingsRoutes,
} from './routes/featureRoutes.js';
import { ensureSeeded } from './services/institutionService.js';
import { ensureBootstrapAdmin } from './services/adminService.js';
import adminRoutes from './routes/adminRoutes.js';

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
app.use(responseEnvelope);

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
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/uploads', documentRoutes);
app.use('/api/lesson-plans', lessonPlanRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/marking', markingRoutes);

const distPath = path.resolve(__dirname, '../../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

ensureSeeded().catch((error) => {
  console.error('Could not seed institutions', error);
});
ensureBootstrapAdmin().catch((error) => {
  console.error('Could not prepare the administrator account', error.message || error);
});

app.listen(env.port, () => {
  const llm = getLlmStatus();
  console.log(`PlanWise backend running on http://localhost:${env.port}`);
  console.log(llm.configured ? `LLM connected: ${llm.label}` : 'LLM not configured — add GEMINI_API_KEY to .env');
});
