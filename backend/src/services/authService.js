import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, createResetToken, hashToken } from '../utils/tokens.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { env, unapprovedTestAccountsAllowed } from '../config/env.js';
import { getNotificationStatus, loginTemplateName, nexusConfigured, resetTemplateName, sendNotification } from './nexusService.js';
import { assertInstitutionForRole } from './institutionService.js';
import * as userRepository from '../repositories/userRepository.js';
import * as passwordResetRepository from '../repositories/passwordResetRepository.js';
import * as notificationRepository from '../repositories/notificationRepository.js';

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
  if (!skipNexus && !nexusConfigured() && process.env.NODE_ENV !== 'test') {
    throw new AppError('Login email is not available because Nexus is not configured.', 503);
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
    throw new AppError('Incorrect username or password.', 401);
  }
  if (!user.emailVerified || user.accountStatus === 'pending') {
    throw new AppError('This account is not active yet. Open the setup link in your email and choose a password.', 403);
  }
  assertApprovedAccount(user);

  return publicAuthPayload(user);
}

export async function changePassword(userId, { currentPassword, password }) {
  if (!currentPassword || !password) throw new AppError('Current password and new password are required.');
  if (String(password).length < 8) throw new AppError('Password must be at least 8 characters.');
  if (!/\d/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
    throw new AppError('Password must include an uppercase letter, a lowercase letter, and a number.');
  }
  if (password === currentPassword) throw new AppError('Choose a password that is different from the temporary one.');

  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError('The current password is incorrect.', 401);
  }

  const passwordHash = await hashPassword(password);
  const updated = await userRepository.updateWithProfile(userId, {
    passwordHash,
    mustChangePassword: false,
  });
  return mapUser(updated);
}

export async function getMe(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  return mapUser(user);
}

export async function updateProfile(userId, input) {
  const fullName = String(input.fullName || input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  if (!fullName || !email) throw new AppError('Name and email are required.');

  const conflict = await userRepository.findOtherByEmail(email, userId);
  if (conflict) throw new AppError('That email is already in use.', 409);

  const current = await userRepository.findByIdWithProfile(userId);
  if (!current) throw new AppError('Account not found.', 404);
  const nextRole = input.role ? parseRole(input.role) : current.role;
  if (nextRole === 'admin' && current.role !== 'admin') {
    throw new AppError('Only an administrator can assign the administrator role.', 403);
  }
  const nextInstitution = input.institution !== undefined
    ? String(input.institution || '').trim()
    : String(current.profile?.institution || '');
  if (input.role || input.institution !== undefined) {
    await assertInstitutionForRole(nextRole, nextInstitution);
  }

  const user = await userRepository.updateWithProfile(userId, {
    fullName,
    email,
    role: input.role ? parseRole(input.role) : undefined,
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

async function unknownPasswordHash() {
  return hashPassword(crypto.randomBytes(32).toString('hex'));
}

async function readProviderStatus(delivery) {
  let providerStatus = delivery.status || 'queued';
  let detail = '';
  if (!delivery.requestId || delivery.requestId === 'test-request') {
    return { providerStatus, detail };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 1 && /queued|processing|accepted/i.test(providerStatus)) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
  if (!nexusConfigured() && !captureOnly) {
    throw new AppError('Login email is not available because Nexus is not configured.', 503);
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
          ? 'Nexus already reported this login email as delivered. A second email was not sent.'
          : 'Nexus already accepted this login email for processing. Final inbox delivery has not been verified, and a second email was not sent.',
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
      throw new AppError(looked.detail || 'Nexus accepted the request, then reported that delivery failed. You can try again.', 502);
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
        ? 'Nexus reported the login email as delivered.'
        : 'Nexus accepted the email for processing. Final inbox delivery has not been verified.',
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
    throw new AppError('Nexus did not accept the login email. Nothing was marked as sent. You can try again.', 502);
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

function missingNexusVars() {
  const missing = [];
  if (!String(process.env.NEXUS_API_KEY || '').trim()) missing.push('NEXUS_API_KEY');
  if (!String(process.env.NEXUS_BASE_URL || '').trim()) missing.push('NEXUS_BASE_URL');
  return missing;
}

function requireNexus() {
  if (nexusConfigured() || captureOnly()) return;
  const missing = missingNexusVars();
  throw new AppError(`Email is not available because ${missing.join(' and ') || 'Nexus'} is not configured.`, 503);
}

async function queueSetupLink(user, template) {
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
      template,
      to: user.email,
      data: {
        user_name: user.username || user.fullName,
        email: user.email,
        password: setupLink,
      },
    });
    const looked = await readProviderStatus(delivery);
    if (/^failed$/i.test(looked.providerStatus)) {
      await passwordResetRepository.remove(record.id).catch(() => {});
      throw new AppError(looked.detail || 'Nexus accepted the request, then reported that delivery failed. You can try again.', 502);
    }
    const verified = inboxVerified(looked.providerStatus);
    await notificationRepository.create({
      userId: user.id,
      title: 'Account email',
      type: 'login-email',
      isRead: true,
      message: noticeMessage({
        status: verified ? 'delivered' : 'accepted',
        providerStatus: looked.providerStatus,
        requestId: delivery.requestId,
        detail: looked.detail,
      }),
    });
    console.info('Nexus account email accepted.', looked.providerStatus || 'queued');
    return {
      emailStatus: verified ? 'delivered' : 'accepted',
      providerStatus: looked.providerStatus || 'queued',
      inboxVerified: verified,
      requestId: delivery.requestId || '',
    };
  } catch (error) {
    if (!(error instanceof AppError)) {
      await passwordResetRepository.remove(record.id).catch(() => {});
    }
    if (error instanceof AppError && error.status === 502) {
      await notificationRepository.create({
        userId: user.id,
        title: 'Account email',
        type: 'login-email',
        isRead: true,
        message: noticeMessage({ status: 'failed', providerStatus: 'failed', detail: 'delivery failed' }),
      }).catch(() => {});
    }
    if (!(error instanceof AppError)) {
      await notificationRepository.create({
        userId: user.id,
        title: 'Account email',
        type: 'login-email',
        isRead: true,
        message: noticeMessage({
          status: 'failed',
          providerStatus: String(error.status || error.code || 'failed'),
          detail: error.code || 'failed',
        }),
      }).catch(() => {});
      console.error('Nexus account email failed.', error.status || error.code || 'failed');
      throw new AppError('Nexus did not accept the email. Nothing was marked as sent. You can try again.', 502);
    }
    throw error;
  }
}

export async function requestAccount(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || input.name || input.username || '').trim();
  if (!fullName || !email) throw new AppError('Name and email are required.');
  if (!validEmail(email)) throw new AppError('Enter a valid email address.');
  requireNexus();

  const byEmail = await userRepository.findByEmailWithProfile(email);
  if (byEmail?.role === 'admin' || (byEmail?.emailVerified && byEmail.accountStatus === 'approved')) {
    throw new AppError('That email address is already registered.', 409);
  }
  if (byEmail && ['rejected', 'suspended', 'inactive'].includes(byEmail.accountStatus)) {
    throw new AppError('This account cannot be registered again. Contact an administrator.', 403);
  }

  let user = byEmail;
  if (user) {
    const prior = emailNotice(await notificationRepository.latestByType(user.id, 'login-email'));
    if (prior.status === 'accepted' || prior.status === 'delivered') {
      const verified = prior.status === 'delivered' || inboxVerified(prior.providerStatus);
      return {
        emailStatus: verified ? 'delivered' : 'accepted',
        inboxVerified: verified,
        message: verified
          ? 'Nexus already reported the setup email as delivered. A second email was not sent.'
          : 'A setup email was already accepted for processing. Check your inbox for the link to choose your password. Final inbox delivery has not been verified, and a second email was not sent.',
      };
    }
    if (user.fullName !== fullName) {
      user = await userRepository.updateWithProfile(user.id, { fullName });
    }
  } else {
    user = await userRepository.createWithProfile({
      fullName,
      email,
      passwordHash: await unknownPasswordHash(),
      role: 'lecturer',
      accountStatus: 'pending',
      emailVerified: false,
      mustChangePassword: false,
      profile: { create: { institution: '', department: '', specialization: '', educationLevel: '', phone: '', preferences: {} } },
    });
  }

  const delivery = await queueSetupLink(user, loginTemplateName());
  const verified = delivery.inboxVerified;
  return {
    ...delivery,
    message: verified
      ? 'Nexus reported the account-setup email as delivered. Open it and choose your password. The account stays inactive until you do.'
      : 'Nexus accepted the account-setup email for processing. Check your inbox for the link to choose your password. The account stays inactive until you do. Final inbox delivery has not been verified.',
  };
}

export async function forgotPassword(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!validEmail(normalized)) throw new AppError('Enter a valid email address.');
  requireNexus();

  const generic = { message: 'If an account exists for this email address, a password-reset link will be sent.' };
  const user = await userRepository.findByEmail(normalized);
  if (!user) return generic;

  await queueSetupLink(user, resetTemplateName());
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
  if (['rejected', 'suspended', 'inactive'].includes(user.accountStatus)) {
    throw new AppError(accessDeniedMessage(user.accountStatus), 403);
  }

  const passwordHash = await hashPassword(password);
  await passwordResetRepository.markUsedAndUpdatePassword(record.id, record.userId, passwordHash, {
    emailVerified: true,
    accountStatus: 'approved',
  });

  return { message: 'Password saved. You can sign in with your new password.' };
}
