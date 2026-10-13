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
  const user = await adminService.approveAccount(req.params.id);
  res.json({ message: 'Account approved. Login credentials were queued by email.', user });
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
