import { asyncHandler } from '../utils/errors.js';
import * as subscriptionService from '../services/subscriptionService.js';

/** Server-side Free/Pro usage gate — never trust browser counters. */
export function requireUsageAllowance(kind) {
  return asyncHandler(async (req, _res, next) => {
    if (!req.userId) return next();
    if (req.user?.role === 'admin') return next();
    await subscriptionService.assertWithinLimit(req.userId, kind);
    req.usageKind = kind;
    next();
  });
}

export function recordUsageAfterSuccess(kind) {
  return asyncHandler(async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400 && req.userId && req.user?.role !== 'admin') {
        subscriptionService.recordUsage(req.userId, kind).catch((error) => {
          console.error('Could not record usage.', error.message || error);
        });
      }
      return originalJson(body);
    };
    next();
  });
}
