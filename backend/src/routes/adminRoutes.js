import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/users', adminController.list);
router.post('/users', adminController.create);
router.post('/users/:id/approve', adminController.approve);
router.post('/users/:id/reject', adminController.reject);
router.post('/users/:id/suspend', adminController.suspend);
router.post('/users/:id/deactivate', adminController.deactivate);
router.post('/users/:id/restore', adminController.restore);

export default router;
