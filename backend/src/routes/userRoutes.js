import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = Router();

router.get('/me', requireAuth, authController.me);
router.put('/me', requireAuth, authController.updateMe);

export default router;
