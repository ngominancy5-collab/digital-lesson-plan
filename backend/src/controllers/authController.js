import { asyncHandler } from '../utils/errors.js';
import * as authService from '../services/authService.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body || {});
  res.status(201).json({ message: 'Account created successfully.', ...result });
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
