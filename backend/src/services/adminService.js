import crypto from 'node:crypto';
import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { assertInstitutionForRole } from './institutionService.js';
import { emailDeliveryConfigured, loginTemplateName, sendNotification } from './nexusService.js';
import * as userRepository from '../repositories/userRepository.js';
import { recordActivity } from './activityService.js';

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let value = 'Pw';
  for (let index = 0; index < 10; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }
  return `${value}9a`;
}

async function unknownPasswordHash() {
  return hashPassword(crypto.randomBytes(32).toString('hex'));
}

function captureOnly() {
  return process.env.NODE_ENV === 'test' && String(process.env.NEXUS_CAPTURE || '').toLowerCase() === 'true';
}

export async function createAccount(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || input.name || '').trim();
  const institution = String(input.institution || '').trim();
  const department = String(input.department || '').trim();
  const role = parseRole(input.role);

  if (!fullName || !email) throw new AppError('Name and email are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid email address.');
  if (!['teacher', 'lecturer', 'admin'].includes(role)) {
    throw new AppError('Choose Lecturer, Teacher, or Administrator.');
  }
  if (role === 'teacher' || role === 'lecturer') {
    await assertInstitutionForRole(role, institution);
    if (!department) throw new AppError('Department is required.');
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) throw new AppError('An account with this email already exists.', 409);

  const user = await userRepository.createWithProfile({
    fullName,
    email,
    passwordHash: await unknownPasswordHash(),
    role,
    accountStatus: 'pending',
    mustChangePassword: false,
    roleConfirmed: role === 'admin',
    profile: {
      create: {
        institution,
        department,
        specialization: '',
        educationLevel: '',
        phone: '',
        preferences: {},
      },
    },
  });

  await recordActivity({
    type: 'user.registered',
    userId: user.id,
    actorRole: user.role,
    summary: 'Administrator created an account',
    targetType: 'user',
    targetId: user.id,
  });
  return mapUser(user);
}

export async function listAccounts() {
  const users = await userRepository.listWithProfiles();
  return users.map(mapUser);
}

function explicitTeachingRole(input) {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'teacher') return 'teacher';
  if (value === 'lecturer') return 'lecturer';
  return '';
}

export async function approveAccount(userId, input = {}, actorId) {
  if (!actorId) throw new AppError('Administrator access is required.', 403);
  if (actorId === userId) throw new AppError('You cannot approve your own account.', 403);
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (user.accountStatus === 'approved' && user.mustChangePassword) {
    throw new AppError('This account is already approved and waiting for a password change.');
  }
  if (user.accountStatus === 'approved') {
    throw new AppError('This account is already approved.');
  }
  if (!emailDeliveryConfigured() && !captureOnly()) {
    throw new AppError('Login email is not available because email delivery is not configured.', 503);
  }

  const requested = explicitTeachingRole(input.role);
  if (user.role === 'admin') {
    if (requested) throw new AppError('An administrator account cannot be assigned Teacher or Lecturer here.', 400);
  } else if (!requested) {
    throw new AppError('Select Teacher or Lecturer before approving this account.', 400);
  }

  const assignedRole = user.role === 'admin' ? 'admin' : requested;
  const roleLabel = assignedRole === 'teacher' ? 'Teacher' : assignedRole === 'lecturer' ? 'Lecturer' : 'Administrator';
  const temporary = temporaryPassword();
  const nameTaken = await userRepository.findByUsernameWithProfile(user.fullName);
  const username = user.username || (!nameTaken || nameTaken.id === user.id ? user.fullName : user.email);
  const passwordHash = await hashPassword(temporary);
  const approved = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        username,
        passwordHash,
        role: assignedRole,
        accountStatus: 'approved',
        emailVerified: true,
        mustChangePassword: true,
        roleConfirmed: assignedRole === 'admin',
        approvedAt: new Date(),
        approvedById: actorId,
      },
      include: { profile: true },
    });
    if (assignedRole !== 'admin') {
      await tx.notification.create({
        data: {
          userId: updated.id,
          title: 'Please confirm your role',
          type: 'role-confirmation',
          message: `Your account has been reviewed by the administrator. You have been assigned the role of ${roleLabel}. Please confirm that this role is correct to continue using PlanWise AI.`,
        },
      });
    }
    return updated;
  }, { maxWait: 15000, timeout: 30000 });

  try {
    await sendNotification({
      template: loginTemplateName(),
      to: approved.email,
      data: {
        user_name: username,
        email: approved.email,
        password: temporary,
      },
    });
  } catch (error) {
    await prisma.notification.deleteMany({ where: { userId: user.id, type: 'role-confirmation', isRead: false } }).catch(() => {});
    await userRepository.updateWithProfile(user.id, {
      username: user.username,
      passwordHash: await unknownPasswordHash(),
      role: user.role,
      accountStatus: user.accountStatus,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
      roleConfirmed: user.roleConfirmed,
      approvedAt: null,
      approvedById: null,
    }).catch(() => {});
    console.error('Nexus login email failed.', error.status || error.code || 'failed');
    throw new AppError('The account was not approved because the login email was not accepted.', 502);
  }

  await recordActivity({
    userId: approved.id,
    actorRole: assignedRole,
    type: 'admin.approve',
    summary: assignedRole === 'admin' ? 'Account approved and login email sent' : `Assigned ${roleLabel} and sent login email`,
    targetType: 'user',
    targetId: approved.id,
    meta: { approvedById: actorId },
  });
  return mapUser(approved);
}

async function setStatus(userId, accountStatus, type) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  const updated = await userRepository.updateWithProfile(userId, { accountStatus });
  await recordActivity({
    userId,
    actorRole: user.role,
    type,
    summary: `Account marked ${accountStatus}`,
    targetType: 'user',
    targetId: userId,
  });
  return mapUser(updated);
}

export function rejectAccount(userId) {
  return setStatus(userId, 'rejected', 'admin.reject');
}

export function suspendAccount(userId) {
  return setStatus(userId, 'suspended', 'admin.suspend');
}

export function deactivateAccount(userId) {
  return setStatus(userId, 'inactive', 'admin.deactivate');
}

export async function restoreAccount(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (user.accountStatus !== 'suspended' && user.accountStatus !== 'inactive') {
    throw new AppError('Only a suspended or inactive account can be restored.');
  }
  const updated = await userRepository.updateWithProfile(userId, { accountStatus: 'approved', emailVerified: true });
  await recordActivity({
    userId,
    actorRole: user.role,
    type: 'admin.restore',
    summary: 'Account restored',
    targetType: 'user',
    targetId: userId,
  });
  return mapUser(updated);
}

export async function ensureBootstrapAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const existingAdmin = await userRepository.countByRole('admin');
  if (existingAdmin > 0) return { created: false };
  if (!email || !password) {
    console.info('No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first one.');
    return { created: false, missingEnv: true };
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters. The first administrator was not created.');
    return { created: false };
  }
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    console.info('ADMIN_EMAIL already belongs to an account. It was not changed into an administrator.');
    return { created: false };
  }
  await userRepository.createWithProfile({
    fullName: String(process.env.ADMIN_NAME || 'PlanWise Administrator').trim() || 'PlanWise Administrator',
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    accountStatus: 'approved',
    emailVerified: true,
    mustChangePassword: false,
    profile: {
      create: {
        institution: '',
        department: '',
        specialization: '',
        educationLevel: '',
        phone: '',
        preferences: {},
      },
    },
  });
  console.info('First administrator account is ready.');
  return { created: true };
}
