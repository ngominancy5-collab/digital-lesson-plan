import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from '../utils/errors.js';
import prisma from '../config/database.js';

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

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { profile: true },
    });
    if (!user) throw new AppError('Account not found.', 401);

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next();
  return requireAuth(req, _res, next);
}
