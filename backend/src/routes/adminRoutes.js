import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';
import * as panel from '../controllers/adminPanelController.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/overview', panel.overview);
router.get('/users', adminController.list);
router.get('/directory', panel.users);
router.get('/directory/:id', panel.user);
router.get('/activity', panel.activity);
router.get('/lesson-plans', panel.lessonPlans);
router.get('/assessments', panel.assessments);
router.get('/attendance', panel.attendance);
router.get('/ai-usage', panel.aiUsage);
router.get('/analytics', panel.analytics);
router.get('/export/:kind', panel.exportCsv);
router.post('/users', adminController.create);
router.post('/users/:id/approve', adminController.approve);
router.post('/users/:id/resend-credentials', adminController.resendCredentials);
router.post('/users/:id/reject', adminController.reject);
router.post('/users/:id/suspend', adminController.suspend);
router.post('/users/:id/deactivate', adminController.deactivate);
router.post('/users/:id/restore', adminController.restore);

export default router;
