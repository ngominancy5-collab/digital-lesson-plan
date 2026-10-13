import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, createResetToken, hashToken } from '../utils/tokens.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { assertInstitutionForRole } from './institutionService.js';
import * as userRepository from '../repositories/userRepository.js';
import * as passwordResetRepository from '../repositories/passwordResetRepository.js';

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
    throw new AppError('This account is not active yet. Use the setup link you were given to choose a password, or ask an administrator to approve it.', 403);
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

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);
}

function strongPassword(password) {
  return String(password).length >= 8 && /\d/.test(password) && /[A-Z]/.test(password) && /[a-z]/.test(password);
}

async function unknownPasswordHash() {
  return hashPassword(crypto.randomBytes(32).toString('hex'));
}

async function issueSetupLink(user) {
  const { token, tokenHash } = createResetToken();
  await passwordResetRepository.invalidateOpen(user.id);
  await passwordResetRepository.create({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return `${env.clientUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function requestAccount(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || input.name || input.username || '').trim();
  if (!fullName || !email) throw new AppError('Name and email are required.');
  if (!validEmail(email)) throw new AppError('Enter a valid email address.');

  const byEmail = await userRepository.findByEmailWithProfile(email);
  if (byEmail?.role === 'admin' || (byEmail?.emailVerified && byEmail.accountStatus === 'approved')) {
    throw new AppError('That email address is already registered.', 409);
  }
  if (byEmail && ['rejected', 'suspended', 'inactive'].includes(byEmail.accountStatus)) {
    throw new AppError('This account cannot be registered again. Contact an administrator.', 403);
  }

  let user = byEmail;
  if (user) {
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

  const setupLink = await issueSetupLink(user);
  return {
    emailStatus: 'link-ready',
    inboxVerified: false,
    setupLink,
    message: 'Account created. Open the setup link below to choose your password. The account stays inactive until you do.',
  };
}

export async function forgotPassword(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!validEmail(normalized)) throw new AppError('Enter a valid email address.');

  const user = await userRepository.findByEmail(normalized);
  if (!user) {
    return { message: 'No account was found for that email address.' };
  }

  const resetLink = await issueSetupLink(user);
  return {
    resetLink,
    message: 'Open the reset link below to choose a new password. It expires in one hour.',
  };
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
