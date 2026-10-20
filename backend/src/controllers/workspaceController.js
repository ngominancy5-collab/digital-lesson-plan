import { asyncHandler } from '../utils/errors.js';
import * as attendanceService from '../services/attendanceService.js';
import * as reportService from '../services/reportService.js';
import * as searchService from '../services/searchService.js';
import * as notificationService from '../services/notificationService.js';
import * as resourceService from '../services/resourceService.js';
import * as markingService from '../services/markingService.js';
import { exportLessonPlanPdf } from '../services/lessonPlanExportService.js';

export const getAttendance = asyncHandler(async (req, res) => {
  res.json(await attendanceService.getAttendance(req.userId));
});

export const clockIn = asyncHandler(async (req, res) => {
  res.status(201).json({ message: 'Clocked in.', ...(await attendanceService.clockIn(req.userId)) });
});

export const clockOut = asyncHandler(async (req, res) => {
  res.json({ message: 'Clocked out.', ...(await attendanceService.clockOut(req.userId)) });
});

export const report = asyncHandler(async (req, res) => {
  res.json(await reportService.getReport(req.userId));
});

export const search = asyncHandler(async (req, res) => {
  res.json(await searchService.searchWorkspace(req.userId, req.query.q));
});

export const listNotifications = asyncHandler(async (req, res) => {
  res.json(await notificationService.listNotifications(req.userId));
});

export const readNotification = asyncHandler(async (req, res) => {
  res.json(await notificationService.markNotificationRead(req.userId, req.params.id));
});

export const readAllNotifications = asyncHandler(async (req, res) => {
  res.json(await notificationService.markAllNotificationsRead(req.userId));
});

export const getNotificationSettings = asyncHandler(async (req, res) => {
  res.json(await notificationService.getPreferences(req.userId));
});

export const updateNotificationSettings = asyncHandler(async (req, res) => {
  res.json({
    message: 'Notification settings saved.',
    ...(await notificationService.updatePreferences(req.userId, req.body || {})),
  });
});

export const listResources = asyncHandler(async (req, res) => {
  res.json({ resources: await resourceService.listResources(req.userId) });
});

export const getResource = asyncHandler(async (req, res) => {
  res.json({ resource: await resourceService.getResource(req.userId, req.params.id) });
});

export const uploadResource = asyncHandler(async (req, res) => {
  const resource = await resourceService.uploadResource(req.userId, req.file, {
    courseName: req.body?.courseName,
    courseCode: req.body?.courseCode,
  });
  res.status(201).json({ message: 'Resource saved.', resource });
});

export const deleteResource = asyncHandler(async (req, res) => {
  res.json(await resourceService.removeResource(req.userId, req.params.id));
});

export const listMarkedPapers = asyncHandler(async (req, res) => {
  res.json({ papers: await markingService.listMarkedPapers(req.userId) });
});

export const exportLessonPlan = asyncHandler(async (req, res) => {
  const { buffer, filename } = await exportLessonPlanPdf(req.userId, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});
