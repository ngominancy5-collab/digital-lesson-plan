import crypto from 'node:crypto';
import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { assertInstitutionForRole } from './institutionService.js';
import { emailDeliveryConfigured, loginTemplateName, sendNotification } from './nexusService.js';
import * as userRepository from '../repositories/userRepository.js';
import { recordActivity } from './activityService.js';
import { notifyAdminsOfPendingAccount } from './notificationService.js';

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

function loginUrl() {
  return `${String(env.clientUrl || 'http://localhost:5180').replace(/\/$/, '')}/login`;
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
    username: fullName,
    email,
    passwordHash: await unknownPasswordHash(),
    role,
    requestedRole: role === 'admin' ? null : role,
    accountStatus: 'pending',
    mustChangePassword: false,
    roleConfirmed: role === 'admin',
    credentialEmailStatus: 'none',
    confirmationEmailStatus: 'none',
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
  if (user.accountStatus === 'pending') {
    try {
      await notifyAdminsOfPendingAccount(user);
    } catch (error) {
      console.error('Could not notify administrators about the created account.', error.message || error);
    }
  }
  return mapUser(user);
}

export async function listAccounts() {
  const users = await userRepository.listWithProfiles();
  return users.map(mapUser);
}

function explicitAssignableRole(input) {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'teacher') return 'teacher';
  if (value === 'lecturer') return 'lecturer';
  return '';
}

const ROLE_LABELS = {
  teacher: 'Teacher',
  lecturer: 'Lecturer',
  admin: 'Administrator',
};

async function sendCredentialEmail(user, temporary, username) {
  return sendNotification({
    template: loginTemplateName(),
    to: user.email,
    data: {
      user_name: username,
      email: user.email,
      password: temporary,
      login_url: loginUrl(),
    },
  });
}

export async function approveAccount(userId, input = {}, actorId) {
  if (!actorId) throw new AppError('Administrator access is required.', 403);
  if (actorId === userId) throw new AppError('You cannot approve your own account.', 403);
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (user.accountStatus === 'approved' && user.mustChangePassword) {
    throw new AppError('This account is already approved. Use Resend credentials if the login email failed.');
  }
  if (user.accountStatus === 'approved') {
    throw new AppError('This account is already approved.');
  }
  if (!emailDeliveryConfigured() && !captureOnly()) {
    throw new AppError('Login email is not available because email delivery is not configured.', 503);
  }

  const requested = explicitAssignableRole(input.role);
  if (user.role === 'admin') {
    if (requested) {
      throw new AppError('An administrator account cannot be reassigned a teaching role here.', 400);
    }
  } else if (!requested) {
    throw new AppError('Select Teacher or Lecturer before approving this account.', 400);
  }

  const assignedRole = user.role === 'admin' ? 'admin' : requested;
  const roleLabel = ROLE_LABELS[assignedRole] || 'Administrator';
  const institution = Object.prototype.hasOwnProperty.call(input, 'institution')
    ? String(input.institution || '').trim()
    : String(user.profile?.institution || '').trim();
  const department = Object.prototype.hasOwnProperty.call(input, 'department')
    ? String(input.department || '').trim()
    : String(user.profile?.department || '').trim();

  if (assignedRole === 'teacher' || assignedRole === 'lecturer') {
    await assertInstitutionForRole(assignedRole, institution);
    if (!department) throw new AppError('Department is required.');
  }

  const temporary = temporaryPassword();
  const preferredUsername = String(user.username || user.fullName || '').trim();
  const nameTaken = preferredUsername
    ? await userRepository.findByUsernameWithProfile(preferredUsername)
    : null;
  const username = preferredUsername && (!nameTaken || nameTaken.id === user.id)
    ? preferredUsername
    : user.email;
  const passwordHash = await hashPassword(temporary);
  const previous = {
    username: user.username,
    passwordHash: user.passwordHash,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    mustChangePassword: user.mustChangePassword,
    roleConfirmed: user.roleConfirmed,
    credentialEmailStatus: user.credentialEmailStatus,
    institution: user.profile?.institution || '',
    department: user.profile?.department || '',
  };

  const approved = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        username,
        fullName: user.fullName || username,
        passwordHash,
        role: assignedRole,
        accountStatus: 'approved',
        emailVerified: true,
        mustChangePassword: true,
        roleConfirmed: assignedRole === 'admin',
        approvedAt: new Date(),
        approvedById: actorId,
        credentialEmailStatus: 'pending',
        profile: {
          upsert: {
            create: {
              institution: assignedRole === 'admin' ? '' : institution,
              department: assignedRole === 'admin' ? '' : department,
              specialization: '',
              educationLevel: '',
              phone: '',
              preferences: {},
            },
            update: {
              institution: assignedRole === 'admin' ? '' : institution,
              department: assignedRole === 'admin' ? '' : department,
            },
          },
        },
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
    await sendCredentialEmail(approved, temporary, username);
  } catch (error) {
    await prisma.notification.deleteMany({ where: { userId: user.id, type: 'role-confirmation', isRead: false } }).catch(() => {});
    await userRepository.updateWithProfile(user.id, {
      username: previous.username,
      passwordHash: await unknownPasswordHash(),
      role: previous.role,
      accountStatus: previous.accountStatus,
      emailVerified: previous.emailVerified,
      mustChangePassword: previous.mustChangePassword,
      roleConfirmed: previous.roleConfirmed,
      approvedAt: null,
      approvedById: null,
      credentialEmailStatus: 'failed',
      profile: {
        upsert: {
          create: {
            institution: previous.institution,
            department: previous.department,
            specialization: '',
            educationLevel: '',
            phone: '',
            preferences: {},
          },
          update: {
            institution: previous.institution,
            department: previous.department,
          },
        },
      },
    }).catch(() => {});
    console.error('Login credential email failed.', error.status || error.code || 'failed');
    throw new AppError('The account was not approved because the login email was not accepted. You can retry approval.', 502);
  }

  await userRepository.updateWithProfile(approved.id, {
    credentialEmailStatus: 'accepted',
    credentialEmailSentAt: new Date(),
  }).catch(() => {});

  await recordActivity({
    userId: approved.id,
    actorRole: assignedRole,
    type: 'admin.approve',
    summary: assignedRole === 'admin' ? 'Account approved and login email sent' : `Assigned ${roleLabel} and sent login email`,
    targetType: 'user',
    targetId: approved.id,
    meta: { approvedById: actorId },
  });
  return mapUser(await userRepository.findByIdWithProfile(approved.id));
}

export async function resendCredentialEmail(userId, actorId) {
  if (!actorId) throw new AppError('Administrator access is required.', 403);
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (user.accountStatus !== 'approved') {
    throw new AppError('Only an approved account can receive credential email retries.', 400);
  }
  if (!user.mustChangePassword) {
    throw new AppError('This user has already set a password. Ask them to use Forgot password instead.', 400);
  }
  if (!emailDeliveryConfigured() && !captureOnly()) {
    throw new AppError('Login email is not available because email delivery is not configured.', 503);
  }

  const temporary = temporaryPassword();
  const username = String(user.username || user.fullName || user.email).trim();
  const passwordHash = await hashPassword(temporary);
  await userRepository.updateWithProfile(user.id, {
    passwordHash,
    credentialEmailStatus: 'pending',
  });

  try {
    await sendCredentialEmail(user, temporary, username);
  } catch (error) {
    await userRepository.updateWithProfile(user.id, { credentialEmailStatus: 'failed' }).catch(() => {});
    console.error('Credential email retry failed.', error.status || error.code || 'failed');
    throw new AppError('The login email was not accepted. You can retry sending credentials.', 502);
  }

  const updated = await userRepository.updateWithProfile(user.id, {
    credentialEmailStatus: 'accepted',
    credentialEmailSentAt: new Date(),
  });
  await recordActivity({
    userId: user.id,
    actorRole: user.role,
    type: 'admin.resend_credentials',
    summary: 'Login credentials resent',
    targetType: 'user',
    targetId: user.id,
    meta: { approvedById: actorId },
  });
  return mapUser(updated);
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
  if (!email || !password) return null;
  if (existingAdmin > 0) return null;

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    return userRepository.updateWithProfile(existing.id, {
      role: 'admin',
      accountStatus: 'approved',
      emailVerified: true,
      mustChangePassword: false,
      roleConfirmed: true,
      passwordHash: await hashPassword(password),
    });
  }

  return userRepository.createWithProfile({
    fullName: 'PlanWise Administrator',
    username: 'admin',
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    accountStatus: 'approved',
    emailVerified: true,
    mustChangePassword: false,
    roleConfirmed: true,
    credentialEmailStatus: 'none',
    confirmationEmailStatus: 'none',
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
}
