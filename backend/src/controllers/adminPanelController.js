import { asyncHandler } from '../utils/errors.js';
import * as adminPanel from '../services/adminPanelService.js';

export const overview = asyncHandler(async (_req, res) => {
  res.json(await adminPanel.overview());
});

export const users = asyncHandler(async (req, res) => {
  res.json(await adminPanel.listUsers(req.query || {}));
});

export const user = asyncHandler(async (req, res) => {
  res.json({ user: await adminPanel.userDetail(req.params.id) });
});

export const activity = asyncHandler(async (req, res) => {
  res.json(await adminPanel.listActivity(req.query || {}));
});

export const lessonPlans = asyncHandler(async (req, res) => {
  res.json(await adminPanel.listLessonPlans(req.query || {}));
});

export const assessments = asyncHandler(async (req, res) => {
  res.json(await adminPanel.listAssessmentsAndQuizzes(req.query || {}));
});

export const attendance = asyncHandler(async (req, res) => {
  res.json(await adminPanel.listAttendance(req.query || {}));
});

export const aiUsage = asyncHandler(async (req, res) => {
  res.json(await adminPanel.aiUsage(req.query || {}));
});

export const analytics = asyncHandler(async (req, res) => {
  res.json(await adminPanel.analytics(req.query || {}));
});

export const exportCsv = asyncHandler(async (req, res) => {
  const file = await adminPanel.exportCsv(req.params.kind, req.query || {});
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
});
