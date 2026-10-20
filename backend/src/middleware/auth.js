import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from '../utils/errors.js';
import { assertApprovedAccount } from '../services/authService.js';
import * as userRepository from '../repositories/userRepository.js';

export function passwordChangeBlocks(user, url) {
  if (!user?.mustChangePassword) return false;
  const path = String(url || '').split('?')[0];
  return !(path.endsWith('/auth/me') || path.endsWith('/auth/change-password'));
}

export function roleConfirmationBlocks(user, url) {
  if (!user || user.role === 'admin' || user.roleConfirmed !== false) return false;
  if (!['teacher', 'lecturer'].includes(user.role)) return false;
  const path = String(url || '').split('?')[0];
  if (path.endsWith('/auth/me') || path.endsWith('/auth/change-password') || path.endsWith('/auth/confirm-role')) return false;
  if (path.includes('/notifications')) return false;
  return true;
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new AppError('Please sign in to continue.', 401);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError('Your session has expired. Please sign in again.', 401);
    }

    const user = await userRepository.findByIdWithProfile(payload.sub);
    if (!user) throw new AppError('Account not found.', 401);
    assertApprovedAccount(user);
    if (passwordChangeBlocks(user, req.originalUrl)) {
      throw new AppError('Choose a new password before using the rest of PlanWise.', 403);
    }
    if (roleConfirmationBlocks(user, req.originalUrl)) {
      throw new AppError('Confirm your assigned role before using the rest of PlanWise.', 403);
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    next(new AppError('Administrator access is required.', 403));
    return;
  }
  next();
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next();
  return requireAuth(req, _res, next);
}
