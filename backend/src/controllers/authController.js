import { AppError, asyncHandler } from '../utils/errors.js';
import * as authService from '../services/authService.js';

export const register = asyncHandler(async () => {
  throw new AppError('Accounts are created by an administrator. Sign in with the credentials sent to your email.', 403);
});

export const createTestAccount = asyncHandler(async (req, res) => {
  const result = await authService.requestAccount(req.body || {});
  res.status(202).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body || {});
  res.json({ message: 'Signed in successfully.', ...result });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.userId);
  res.json({ user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.userId, req.body || {});
  res.json({ user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body?.email);
  res.json(result);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body || {});
  res.json(result);
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await authService.changePassword(req.userId, req.body || {});
  res.json({ message: 'Password updated.', user });
});

export const confirmRole = asyncHandler(async (req, res) => {
  const user = await authService.confirmAssignedRole(req.userId);
  res.json({ message: 'Role confirmed.', user });
});
