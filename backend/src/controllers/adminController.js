import { asyncHandler } from '../utils/errors.js';
import * as adminService from '../services/adminService.js';

export const list = asyncHandler(async (_req, res) => {
  const users = await adminService.listAccounts();
  res.json({ users });
});

export const create = asyncHandler(async (req, res) => {
  const user = await adminService.createAccount(req.body || {});
  res.status(201).json({ message: 'Account created and waiting for approval.', user });
});

export const approve = asyncHandler(async (req, res) => {
  const user = await adminService.approveAccount(req.params.id, req.body || {}, req.userId);
  res.json({
    message: 'Account approved. Login email is being sent now.',
    user,
    credentialsQueued: true,
    credentialsSent: null,
  });
});

export const resendCredentials = asyncHandler(async (req, res) => {
  const user = await adminService.resendCredentialEmail(req.params.id, req.userId);
  res.json({
    message: 'Login email is being sent again.',
    user,
    credentialsQueued: true,
    credentialsSent: null,
  });
});

export const reject = asyncHandler(async (req, res) => {
  const user = await adminService.rejectAccount(req.params.id);
  res.json({ message: 'Account rejected.', user });
});

export const suspend = asyncHandler(async (req, res) => {
  const user = await adminService.suspendAccount(req.params.id);
  res.json({ message: 'Account suspended.', user });
});

export const deactivate = asyncHandler(async (req, res) => {
  const user = await adminService.deactivateAccount(req.params.id);
  res.json({ message: 'Account marked inactive.', user });
});

export const restore = asyncHandler(async (req, res) => {
  const user = await adminService.restoreAccount(req.params.id);
  res.json({ message: 'Account restored.', user });
});
