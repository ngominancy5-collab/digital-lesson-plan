import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import * as c from '../controllers/platformController.js';

export const siteImageRoutes = Router();
siteImageRoutes.get('/hero', c.publicHeroImages);
siteImageRoutes.get('/section/:sectionKey', c.publicSectionImages);
siteImageRoutes.get('/', requireAuth, requireAdmin, c.adminListImages);
siteImageRoutes.post('/', requireAuth, requireAdmin, upload.single('file'), c.adminUploadImage);
siteImageRoutes.patch('/:id', requireAuth, requireAdmin, c.adminUpdateImage);
siteImageRoutes.delete('/:id', requireAuth, requireAdmin, c.adminDeleteImage);

export const billingRoutes = Router();
billingRoutes.get('/plans', c.listPlans);
billingRoutes.get('/subscription', requireAuth, c.mySubscription);
billingRoutes.get('/history', requireAuth, c.billingHistory);
billingRoutes.get('/admin', requireAuth, requireAdmin, c.adminBilling);
billingRoutes.post('/checkout', requireAuth, c.createCheckout);
billingRoutes.get('/checkout', requireAuth, c.checkoutPreview);
billingRoutes.post('/checkout/confirm', requireAuth, c.confirmCheckout);
billingRoutes.post('/cancel', requireAuth, c.cancelSubscription);
