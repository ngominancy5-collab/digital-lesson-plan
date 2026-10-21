import { asyncHandler } from '../utils/errors.js';
import * as siteImageService from '../services/siteImageService.js';
import * as subscriptionService from '../services/subscriptionService.js';

export const publicHeroImages = asyncHandler(async (_req, res) => {
  res.json({ images: await siteImageService.listPublicSection('hero') });
});

export const publicSectionImages = asyncHandler(async (req, res) => {
  res.json({ images: await siteImageService.listPublicSection(req.params.sectionKey) });
});

export const adminListImages = asyncHandler(async (_req, res) => {
  res.json({ images: await siteImageService.listAdminImages() });
});

export const adminUploadImage = asyncHandler(async (req, res) => {
  const image = await siteImageService.uploadSiteImage(req.userId, req.file, req.body || {});
  res.status(201).json({ image });
});

export const adminUpdateImage = asyncHandler(async (req, res) => {
  res.json({ image: await siteImageService.updateSiteImage(req.userId, req.params.id, req.body || {}) });
});

export const adminDeleteImage = asyncHandler(async (req, res) => {
  res.json(await siteImageService.deleteSiteImage(req.userId, req.params.id));
});

export const listPlans = asyncHandler(async (_req, res) => {
  res.json({ plans: await subscriptionService.listPublicPlans() });
});

export const mySubscription = asyncHandler(async (req, res) => {
  res.json(await subscriptionService.getSubscriptionSummary(req.userId));
});

export const createCheckout = asyncHandler(async (req, res) => {
  res.status(201).json(await subscriptionService.createCheckout(req.userId, req.body?.planCode));
});

export const checkoutPreview = asyncHandler(async (req, res) => {
  res.json(await subscriptionService.getCheckoutPreview(req.query.token || req.params.token, req.userId));
});

export const confirmCheckout = asyncHandler(async (req, res) => {
  res.json(await subscriptionService.confirmCheckout(req.body?.token || req.body?.checkoutToken, {
    actorUserId: req.userId,
  }));
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  res.json(await subscriptionService.cancelSubscription(req.userId));
});

export const billingHistory = asyncHandler(async (req, res) => {
  res.json({ transactions: await subscriptionService.listBillingHistory(req.userId) });
});

export const adminBilling = asyncHandler(async (_req, res) => {
  res.json(await subscriptionService.listAdminBilling());
});
