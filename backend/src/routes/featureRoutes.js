import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { recordUsageAfterSuccess, requireUsageAllowance } from '../middleware/usageLimits.js';
import * as c from '../controllers/workspaceController.js';

export const attendanceRoutes = Router();
attendanceRoutes.get('/', requireAuth, c.getAttendance);
attendanceRoutes.post('/clock-in', requireAuth, c.clockIn);
attendanceRoutes.post('/clock-out', requireAuth, c.clockOut);

export const reportRoutes = Router();
reportRoutes.get('/', requireAuth, c.report);

export const searchRoutes = Router();
searchRoutes.get('/', requireAuth, c.search);

export const notificationRoutes = Router();
notificationRoutes.get('/', requireAuth, c.listNotifications);
notificationRoutes.post('/read-all', requireAuth, c.readAllNotifications);
notificationRoutes.post('/:id/read', requireAuth, c.readNotification);

export const settingsRoutes = Router();
settingsRoutes.get('/notifications', requireAuth, c.getNotificationSettings);
settingsRoutes.put('/notifications', requireAuth, c.updateNotificationSettings);

export const resourceRoutes = Router();
resourceRoutes.get('/', requireAuth, c.listResources);
resourceRoutes.post(
  '/upload',
  requireAuth,
  requireUsageAllowance('upload'),
  upload.single('file'),
  recordUsageAfterSuccess('upload'),
  c.uploadResource,
);
resourceRoutes.get('/:id', requireAuth, c.getResource);
resourceRoutes.delete('/:id', requireAuth, c.deleteResource);

export const markingRoutes = Router();
markingRoutes.get('/', requireAuth, c.listMarkedPapers);
markingRoutes.get('/:id', requireAuth, c.getMarkedPaper);
markingRoutes.patch('/:id/draft', requireAuth, c.saveMarkingDraft);
markingRoutes.patch('/:id', requireAuth, c.updateMarkedPaper);
markingRoutes.post('/:id/finalize', requireAuth, c.finalizeMarking);
markingRoutes.post('/:id/reopen', requireAuth, c.reopenMarking);
markingRoutes.delete('/:id', requireAuth, c.deleteMarkedPaper);
