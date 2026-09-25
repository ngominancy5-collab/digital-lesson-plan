import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.get('/me', requireAuth, authController.me);
router.put('/me', requireAuth, authController.updateMe);

export default router;
