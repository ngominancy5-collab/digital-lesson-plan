import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from '../utils/errors.js';
import { assertApprovedAccount } from '../services/authService.js';
import * as userRepository from '../repositories/userRepository.js';

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
    const path = String(req.originalUrl || '').split('?')[0];
    const passwordChangeAllowed = path.endsWith('/auth/me') || path.endsWith('/auth/change-password');
    if (user.mustChangePassword && !passwordChangeAllowed) {
      throw new AppError('Change your password before continuing.', 403);
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
