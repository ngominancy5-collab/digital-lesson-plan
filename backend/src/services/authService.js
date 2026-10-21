import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, createResetToken, hashToken } from '../utils/tokens.js';
import { mapUser, parseRequestedRole, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { env, unapprovedTestAccountsAllowed } from '../config/env.js';
import {
  accountCreatedTemplateName,
  emailDeliveryConfigured,
  getNotificationStatus,
  loginTemplateName,
  passwordChangedTemplateData,
  passwordChangedTemplateName,
  sendNotification,
} from './nexusService.js';
import prisma from '../config/database.js';
import { assertInstitutionForRole } from './institutionService.js';
import * as userRepository from '../repositories/userRepository.js';
import * as passwordResetRepository from '../repositories/passwordResetRepository.js';
import * as notificationRepository from '../repositories/notificationRepository.js';
import { maskIdentifier, recordActivity } from './activityService.js';

function publicAuthPayload(user) {
  const token = signAccessToken(user);
  return { token, user: mapUser(user) };
}

function accessDeniedMessage(status) {
  if (status === 'pending') return 'Your account is waiting for administrator approval.';
  if (status === 'rejected') return 'Your account was not approved. Contact your administrator.';
  if (status === 'suspended') return 'Your account is suspended. Contact your administrator.';
  if (status === 'inactive') return 'Your account is inactive. Contact your administrator.';
  return 'Your account cannot sign in. Contact your administrator.';
}

export function assertApprovedAccount(user) {
  if (!user || user.accountStatus === 'approved') return;
  throw new AppError(accessDeniedMessage(user.accountStatus), 403);
}

export async function registerUser(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || input.name || '').trim();
  const password = String(input.password || '');
  const institution = String(input.institution || '').trim();
  const department = String(input.department || '').trim();

  if (!fullName || !email || !password) {
    throw new AppError('Please complete all required fields.');
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters.');
  }
  await assertInstitutionForRole(input.role, institution);

  const existing = await userRepository.findByEmail(email);
  if (existing) throw new AppError('An account with this email already exists.', 409);

  const skipNexus = process.env.NODE_ENV === 'test' && String(process.env.NEXUS_CAPTURE || '').toLowerCase() !== 'true';
  if (!skipNexus && !emailDeliveryConfigured() && process.env.NODE_ENV !== 'test') {
    throw new AppError('Login email is not available because email delivery is not configured.', 503);
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.createWithProfile({
    fullName,
    email,
    passwordHash,
    role: parseRole(input.role),
    accountStatus: 'approved',
    emailVerified: true,
    mustChangePassword: false,
    profile: {
      create: {
        institution,
        department,
        specialization: input.specialization || '',
        educationLevel: input.educationLevel || '',
        phone: input.phone || '',
        preferences: {
          notifications: true,
          lessons: true,
          assessments: true,
          ai: true,
        },
      },
    },
  });

  if (!skipNexus) {
    const { token } = createResetToken();
    const tokenHash = hashToken(token);
    await passwordResetRepository.invalidateOpen(user.id);
    await passwordResetRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const setupLink = `${env.clientUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      const delivery = await sendNotification({
        template: loginTemplateName(),
        to: user.email,
        data: {
          user_name: user.fullName,
          password: setupLink,
        },
      });
      console.info('Nexus login email queued.', delivery.status || 'queued');
    } catch (error) {
      await userRepository.remove(user.id).catch(() => {});
      console.error('Nexus login email failed.', error.status || error.code || 'failed');
      throw new AppError('The account was not kept because the login email was not accepted. Try again.', 502);
    }
  }

  return publicAuthPayload(user);
}

export async function loginUser({ email, username, identifier, password }) {
  const raw = String(identifier || email || username || '').trim().toLowerCase();
  if (!raw || !password) throw new AppError('Username or email, and a password, are required.');

  const user = raw.includes('@')
    ? await userRepository.findByEmailWithProfile(raw)
    : await userRepository.findByUsernameWithProfile(raw);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await recordActivity({
      type: 'auth.login_failed',
      summary: 'Failed sign-in attempt',
      outcome: 'failed',
      meta: { identifier: maskIdentifier(raw) },
    });
    throw new AppError('Incorrect username or password.', 401);
  }
  if (!user.emailVerified && user.accountStatus !== 'pending') {
    throw new AppError('This account is not active yet. Open the setup link in your email and choose a password.', 403);
  }
  assertApprovedAccount(user);
  await userRepository.updateWithProfile(user.id, { lastLoginAt: new Date() }).catch(() => {});
  await recordActivity({
    userId: user.id,
    actorRole: user.role,
    type: 'auth.login',
    summary: 'Signed in',
  });

  return publicAuthPayload(user);
}

async function emailPasswordChanged(user) {
  const name = String(user.fullName || '').trim() || 'there';
  const data = passwordChangedTemplateData(name);
  try {
    const delivery = await sendNotification({
      template: passwordChangedTemplateName(),
      to: user.email,
      data,
    });
    const looked = await readProviderStatus(delivery).catch((error) => ({
      providerStatus: 'unknown',
      detail: error.code || 'status unavailable',
    }));
    const failed = /^failed$/i.test(looked.providerStatus);
    if (failed) {
      console.error('Password-change email was not delivered.', looked.providerStatus || 'failed', looked.detail || 'no provider detail');
    } else {
      console.info('Password-change email accepted.', looked.providerStatus || delivery.status || 'queued');
    }
    await notificationRepository.create({
      userId: user.id,
      title: 'Password change email',
      type: 'password-changed-email',
      isRead: true,
      message: failed ? 'Password-change email failed.' : 'Password-change email accepted.',
    }).catch(() => {});
  } catch (error) {
    console.error('Password-change email failed.', error.code || error.status || 'failed');
    await notificationRepository.create({
      userId: user.id,
      title: 'Password change email',
      type: 'password-changed-email',
      isRead: true,
      message: 'Password-change email failed.',
    }).catch(() => {});
  }
}

export async function changePassword(userId, { currentPassword, password } = {}) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  const forced = Boolean(user.mustChangePassword);
  if (!forced) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError('The current password is incorrect.', 401);
    }
  } else if (currentPassword && !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError('The current password is incorrect.', 401);
  }
  if (!password) throw new AppError('Choose a new password.');
  if (String(password).length < 8 || !/\d/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
    throw new AppError('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.');
  }
  if (await verifyPassword(password, user.passwordHash)) {
    throw new AppError('Choose a password that is different from the temporary one.');
  }

  const passwordHash = await hashPassword(password);
  const updated = await userRepository.updateWithProfile(userId, {
    passwordHash,
    mustChangePassword: false,
  });
  await emailPasswordChanged(updated);
  await maybeSendAccountCreatedConfirmation(updated.id);
  return mapUser(await userRepository.findByIdWithProfile(userId));
}

export async function confirmAssignedRole(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  assertApprovedAccount(user);
  if (user.role !== 'teacher' && user.role !== 'lecturer') {
    throw new AppError('There is no assigned teaching role to confirm.', 403);
  }
  if (!user.roleConfirmed) {
    await userRepository.updateWithProfile(userId, { roleConfirmed: true });
    await notificationRepository.markReadByType(userId, 'role-confirmation');
  }
  await maybeSendAccountCreatedConfirmation(userId);
  return getMe(userId);
}

export async function getMe(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  assertApprovedAccount(user);
  if (!user.mustChangePassword && (user.role === 'admin' || user.roleConfirmed !== false)) {
    await maybeSendAccountCreatedConfirmation(userId);
  }
  return mapUser(await userRepository.findByIdWithProfile(userId));
}

export async function updateProfile(userId, input) {
  const fullName = String(input.fullName || input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  if (!fullName || !email) throw new AppError('Name and email are required.');

  const conflict = await userRepository.findOtherByEmail(email, userId);
  if (conflict) throw new AppError('That email is already in use.', 409);

  const current = await userRepository.findByIdWithProfile(userId);
  if (!current) throw new AppError('Account not found.', 404);
  if (input.role && parseRole(input.role) !== current.role) {
    throw new AppError('Only an administrator can change your assigned role.', 403);
  }
  const nextInstitution = input.institution !== undefined
    ? String(input.institution || '').trim()
    : String(current.profile?.institution || '');
  if (input.institution !== undefined && ['teacher', 'lecturer'].includes(current.role)) {
    await assertInstitutionForRole(current.role, nextInstitution);
  }

  const user = await userRepository.updateWithProfile(userId, {
    fullName,
    email,
    profileImage: input.avatar !== undefined ? input.avatar : undefined,
    profile: {
      upsert: {
        create: {
          institution: input.institution || '',
          department: input.department || '',
          phone: input.phone || '',
          specialization: input.specialization || '',
          educationLevel: input.educationLevel || '',
          preferences: input.preferences || {},
        },
        update: {
          institution: input.institution ?? undefined,
          department: input.department ?? undefined,
          phone: input.phone ?? undefined,
          specialization: input.specialization ?? undefined,
          educationLevel: input.educationLevel ?? undefined,
          preferences: input.preferences ?? undefined,
        },
      },
    },
  });

  return mapUser(user);
}

function emailNotice(record) {
  const message = String(record?.message || '');
  const read = (key) => message.match(new RegExp(`${key}=([^;]*)`))?.[1] || '';
  return {
    status: read('status'),
    providerStatus: read('provider'),
    requestId: read('requestId'),
    detail: read('detail'),
  };
}

function noticeMessage({ status, providerStatus, requestId, detail }) {
  return `status=${status};provider=${providerStatus || ''};requestId=${requestId || ''};detail=${String(detail || '').replace(/[;\r\n]/g, ' ').slice(0, 180)}`;
}

function inboxVerified(providerStatus) {
  return /^(delivered|sent|completed)$/i.test(String(providerStatus || ''));
}

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

async function loginNameFor(fullName, email, userId) {
  const taken = await userRepository.findByUsernameWithProfile(fullName);
  if (!taken || taken.id === userId) return fullName;
  return email;
}

async function readProviderStatus(delivery) {
  let providerStatus = delivery.status || 'queued';
  let detail = '';
  if (!delivery.requestId || delivery.requestId === 'test-request') {
    return { providerStatus, detail };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0 && /queued|processing|accepted/i.test(providerStatus)) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1500 : 4000));
    }
    try {
      const looked = await getNotificationStatus(delivery.requestId);
      providerStatus = looked.status || providerStatus;
      detail = looked.errorMessage || '';
      if (!/queued|processing/i.test(providerStatus)) break;
    } catch (error) {
      detail = error.message || '';
      break;
    }
  }
  return { providerStatus, detail };
}

export async function createUnapprovedTestAccount(input) {
  if (!unapprovedTestAccountsAllowed()) {
    throw new AppError('Administrator approval is required. Unapproved test accounts are turned off.', 403);
  }

  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || input.name || input.username || '').trim();
  if (!fullName || !email) throw new AppError('Name and email are required.');
  if (!validEmail(email)) throw new AppError('Enter a valid email address.');

  const captureOnly = process.env.NODE_ENV === 'test' && String(process.env.NEXUS_CAPTURE || '').toLowerCase() === 'true';
  if (!emailDeliveryConfigured() && !captureOnly) {
    throw new AppError('Login email is not available because email delivery is not configured.', 503);
  }

  let user = await userRepository.findByEmailWithProfile(email);
  if (user?.role === 'admin') {
    throw new AppError('This address belongs to an administrator and cannot be used here.', 403);
  }
  if (user) {
    const prior = emailNotice(await notificationRepository.latestByType(user.id, 'login-email'));
    if (prior.status === 'accepted' || prior.status === 'delivered') {
      const verified = prior.status === 'delivered' || inboxVerified(prior.providerStatus);
      return {
        emailStatus: verified ? 'delivered' : 'accepted',
        providerStatus: prior.providerStatus || 'queued',
        inboxVerified: verified,
        requestId: prior.requestId,
        message: verified
          ? 'The email service already reported this login email as delivered. A second email was not sent.'
          : 'The email service already accepted this login email for processing. Final inbox delivery has not been verified, and a second email was not sent.',
      };
    }
  } else {
    user = await userRepository.createWithProfile({
      fullName,
      email,
      passwordHash: await unknownPasswordHash(),
      role: 'lecturer',
      accountStatus: 'approved',
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
  }

  const { token, tokenHash } = createResetToken();
  await passwordResetRepository.invalidateOpen(user.id);
  const record = await passwordResetRepository.create({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const setupLink = `${env.clientUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    const delivery = await sendNotification({
      template: loginTemplateName(),
      to: user.email,
      data: {
        user_name: user.fullName,
        email: user.email,
        password: setupLink,
      },
    });
    const looked = await readProviderStatus(delivery);
    if (/^failed$/i.test(looked.providerStatus)) {
      await passwordResetRepository.remove(record.id).catch(() => {});
      await notificationRepository.create({
        userId: user.id,
        title: 'Login email',
        type: 'login-email',
        isRead: true,
        message: noticeMessage({
          status: 'failed',
          providerStatus: looked.providerStatus,
          requestId: delivery.requestId,
          detail: looked.detail,
        }),
      });
      console.error('Nexus login email was not delivered.', looked.providerStatus);
      throw new AppError(looked.detail || 'The email service accepted the request, then reported that delivery failed. You can try again.', 502);
    }
    const verified = inboxVerified(looked.providerStatus);
    await notificationRepository.create({
      userId: user.id,
      title: 'Login email',
      type: 'login-email',
      isRead: true,
      message: noticeMessage({
        status: verified ? 'delivered' : 'accepted',
        providerStatus: looked.providerStatus,
        requestId: delivery.requestId,
        detail: looked.detail,
      }),
    });
    console.info('Nexus login email accepted.', looked.providerStatus || 'queued');
    return {
      emailStatus: verified ? 'delivered' : 'accepted',
      providerStatus: looked.providerStatus || 'queued',
      inboxVerified: verified,
      requestId: delivery.requestId || '',
      message: verified
        ? 'The email service reported the login email as delivered.'
        : 'The email service accepted the email for processing. Final inbox delivery has not been verified.',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    await passwordResetRepository.remove(record.id).catch(() => {});
    await notificationRepository.create({
      userId: user.id,
      title: 'Login email',
      type: 'login-email',
      isRead: true,
      message: noticeMessage({
        status: 'failed',
        providerStatus: String(error.status || error.code || 'failed'),
        detail: error.code || 'failed',
      }),
    }).catch(() => {});
    console.error('Nexus login email failed.', error.status || error.code || 'failed');
    throw new AppError('The email service did not accept the login email. Nothing was marked as sent. You can try again.', 502);
  }
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);
}

function strongPassword(password) {
  return String(password).length >= 8 && /\d/.test(password) && /[A-Z]/.test(password) && /[a-z]/.test(password);
}

function captureOnly() {
  return process.env.NODE_ENV === 'test' && String(process.env.NEXUS_CAPTURE || '').toLowerCase() === 'true';
}

function missingEmailVars() {
  const missing = [];
  if (!String(process.env.SMTP_HOST || '').trim()) missing.push('SMTP_HOST');
  if (!String(process.env.SMTP_FROM || process.env.MAIL_FROM || '').trim()) missing.push('SMTP_FROM');
  return missing;
}

function requireEmailDelivery() {
  if (emailDeliveryConfigured() || captureOnly()) return;
  const missing = missingEmailVars();
  throw new AppError(
    `Email is not available because email delivery is not configured. Set ${missing.join(' and ')} (with SMTP_USER and SMTP_PASS), or set NEXUS_API_KEY and NEXUS_BASE_URL.`,
    503,
  );
}

async function emailTemporaryPassword(user, username, temporary) {
  console.info('Sending login email.', loginTemplateName(), user.email);
  try {
    const delivery = await sendNotification({
      template: loginTemplateName(),
      to: user.email,
      data: {
        user_name: username,
        email: user.email,
        password: temporary,
      },
    });
    const looked = await readProviderStatus(delivery);
    if (/^failed$/i.test(looked.providerStatus)) {
      console.error('Login email was not delivered.', looked.providerStatus || 'failed', looked.detail || 'no provider detail');
      throw new AppError("We couldn't send your login email. Please try again later.", 502);
    }
    const verified = inboxVerified(looked.providerStatus);
    await notificationRepository.create({
      userId: user.id,
      title: 'Login email',
      type: 'login-email',
      isRead: true,
      message: noticeMessage({
        status: verified ? 'delivered' : 'accepted',
        providerStatus: looked.providerStatus,
        requestId: delivery.requestId,
        detail: looked.detail,
      }),
    });
    return {
      emailStatus: verified ? 'delivered' : 'accepted',
      providerStatus: looked.providerStatus || 'queued',
      inboxVerified: verified,
      requestId: delivery.requestId || '',
    };
  } catch (error) {
    if (!(error instanceof AppError)) {
      await notificationRepository.create({
        userId: user.id,
        title: 'Login email',
        type: 'login-email',
        isRead: true,
        message: noticeMessage({
          status: 'failed',
          providerStatus: String(error.status || error.code || 'failed'),
          detail: error.code || 'failed',
        }),
      }).catch(() => {});
      console.error('Login email was not accepted.', error.status || error.code || 'failed');
      throw new AppError("We couldn't send your login email. Please try again later.", 502);
    }
    if (error.status === 502) {
      await notificationRepository.create({
        userId: user.id,
        title: 'Login email',
        type: 'login-email',
        isRead: true,
        message: noticeMessage({ status: 'failed', providerStatus: 'failed', detail: 'delivery failed' }),
      }).catch(() => {});
    }
    throw error;
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function validUsername(value) {
  return /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,38}[A-Za-z0-9]$/.test(value) || /^[A-Za-z0-9]{3,40}$/.test(value);
}

export async function maybeSendAccountCreatedConfirmation(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) return { sent: false, reason: 'missing' };
  if (user.accountStatus !== 'approved') return { sent: false, reason: 'not_approved' };
  if (user.mustChangePassword) return { sent: false, reason: 'must_change_password' };
  if (user.role !== 'admin' && user.roleConfirmed === false) return { sent: false, reason: 'role_unconfirmed' };
  if (user.confirmationEmailStatus === 'accepted') return { sent: false, reason: 'already_sent' };

  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      accountStatus: 'approved',
      mustChangePassword: false,
      confirmationEmailStatus: { in: ['none', 'failed', 'pending'] },
      OR: [
        { role: 'admin' },
        { roleConfirmed: true },
      ],
    },
    data: { confirmationEmailStatus: 'pending' },
  });
  if (!claimed.count) return { sent: false, reason: 'already_claimed' };

  const displayName = String(user.username || user.fullName || '').trim() || 'there';
  try {
    if (!emailDeliveryConfigured() && process.env.NODE_ENV !== 'test') {
      await userRepository.updateWithProfile(user.id, { confirmationEmailStatus: 'failed' });
      return { sent: false, reason: 'email_not_configured' };
    }
    const delivery = await sendNotification({
      template: accountCreatedTemplateName(),
      to: user.email,
      data: { user_name: displayName },
    });
    const looked = await readProviderStatus(delivery).catch(() => ({
      providerStatus: delivery.status || 'queued',
      detail: '',
    }));
    if (/^failed$/i.test(looked.providerStatus)) {
      await userRepository.updateWithProfile(user.id, { confirmationEmailStatus: 'failed' });
      return { sent: false, reason: 'provider_failed' };
    }
    await userRepository.updateWithProfile(user.id, {
      confirmationEmailStatus: 'accepted',
      confirmationEmailSentAt: new Date(),
    });
    await notificationRepository.create({
      userId: user.id,
      title: 'Account created email',
      type: 'account-created-email',
      isRead: true,
      message: 'Account-created confirmation email accepted for processing.',
    }).catch(() => {});
    return { sent: true };
  } catch (error) {
    console.error('Account-created confirmation email failed.', error.code || error.status || 'failed');
    await userRepository.updateWithProfile(user.id, { confirmationEmailStatus: 'failed' }).catch(() => {});
    return { sent: false, reason: 'send_failed' };
  }
}

export async function requestAccount(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const username = normalizeUsername(input.username || input.fullName || input.name || '');
  const requestedRole = parseRequestedRole(input.role);
  if (!username) throw new AppError('Please enter a username.');
  if (!validUsername(username) || username.length < 3 || username.length > 40) {
    throw new AppError('Username must be 3–40 characters and use letters, numbers, spaces, dots, hyphens, or underscores.');
  }
  if (!requestedRole) throw new AppError('Please select Lecturer or Teacher.');
  if (!email || !validEmail(email)) throw new AppError('Please enter a valid email address.');

  const byEmail = await userRepository.findByEmailWithProfile(email);
  if (byEmail?.role === 'admin' || byEmail?.accountStatus === 'approved') {
    throw new AppError('An account with this email already exists.', 409);
  }
  if (byEmail && ['rejected', 'suspended', 'inactive'].includes(byEmail.accountStatus)) {
    throw new AppError('This account cannot be registered again. Contact an administrator.', 403);
  }
  if (byEmail?.accountStatus === 'pending') {
    throw new AppError('A registration request with this email is already pending.', 409);
  }

  const byUsername = await userRepository.findByUsernameWithProfile(username);
  if (byUsername && byUsername.email !== email) {
    if (byUsername.accountStatus === 'pending') {
      throw new AppError('A registration request with this username is already pending.', 409);
    }
    if (byUsername.accountStatus === 'approved' || byUsername.role === 'admin') {
      throw new AppError('This username is already taken.', 409);
    }
  }

  const profile = {
    institution: '',
    department: '',
    specialization: '',
    educationLevel: '',
    phone: '',
    preferences: {},
  };
  const user = await userRepository.createWithProfile({
    fullName: username,
    username,
    email,
    passwordHash: await unknownPasswordHash(),
    role: 'unassigned',
    requestedRole,
    accountStatus: 'pending',
    emailVerified: false,
    mustChangePassword: false,
    roleConfirmed: false,
    credentialEmailStatus: 'none',
    confirmationEmailStatus: 'none',
    profile: { create: profile },
  });

  await recordActivity({
    userId: user.id,
    actorRole: 'unassigned',
    type: 'user.registered',
    summary: 'New account submitted for approval',
    targetType: 'user',
    targetId: user.id,
    meta: { requestedRole },
  });
  try {
    const { notifyAdminsOfPendingAccount } = await import('./notificationService.js');
    await notifyAdminsOfPendingAccount(user);
  } catch (error) {
    console.error('Could not notify administrators about the new account request.', error.message || error);
  }
  return { message: 'Request successfully sent!' };
}

export async function forgotPassword(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!validEmail(normalized)) throw new AppError('Enter a valid email address.');
  requireEmailDelivery();

  const generic = { message: 'If an account exists for this email address, a temporary password will be sent.' };
  const user = await userRepository.findByEmailWithProfile(normalized);
  if (!user || ['rejected', 'suspended', 'inactive', 'pending'].includes(user.accountStatus)) return generic;

  const temporary = temporaryPassword();
  const username = await loginNameFor(user.username || user.fullName, user.email, user.id);
  const previous = {
    username: user.username,
    passwordHash: user.passwordHash,
    mustChangePassword: user.mustChangePassword,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
  };
  await passwordResetRepository.invalidateOpen(user.id);
  await userRepository.updateWithProfile(user.id, {
    username,
    passwordHash: await hashPassword(temporary),
    mustChangePassword: true,
    emailVerified: true,
    accountStatus: user.accountStatus,
  });
  try {
    await emailTemporaryPassword(user, username, temporary);
  } catch (error) {
    await userRepository.updateWithProfile(user.id, previous).catch(() => {});
    throw error;
  }
  return generic;
}

export async function resetPassword({ token, password }) {
  if (!token || !password) throw new AppError('Reset token and new password are required.');
  if (!strongPassword(password)) {
    throw new AppError('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.');
  }

  const tokenHash = hashToken(token);
  const record = await passwordResetRepository.findByHash(tokenHash);
  if (!record) throw new AppError('This reset link is invalid.', 400);
  if (record.usedAt) throw new AppError('This reset link has already been used.', 400);
  if (record.expiresAt <= new Date()) throw new AppError('This reset link has expired.', 400);

  const user = await userRepository.findByIdWithProfile(record.userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (['rejected', 'suspended', 'inactive', 'pending'].includes(user.accountStatus)) {
    throw new AppError(accessDeniedMessage(user.accountStatus), 403);
  }

  const passwordHash = await hashPassword(password);
  await passwordResetRepository.markUsedAndUpdatePassword(record.id, record.userId, passwordHash, {
    emailVerified: true,
    accountStatus: 'approved',
  });

  return { message: 'Password saved. You can sign in with your new password.' };
}
