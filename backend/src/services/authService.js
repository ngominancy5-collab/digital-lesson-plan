import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, createResetToken, hashToken } from '../utils/tokens.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { emailConfigured, sendMail } from './emailService.js';
import { assertInstitutionForRole } from './institutionService.js';
import * as userRepository from '../repositories/userRepository.js';
import * as passwordResetRepository from '../repositories/passwordResetRepository.js';

function publicAuthPayload(user) {
  const token = signAccessToken(user);
  return { token, user: mapUser(user) };
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

export async function loginUser({ email, password }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !password) throw new AppError('Email and password are required.');

  const user = await userRepository.findByEmailWithProfile(normalized);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError('Incorrect email or password.', 401);
  }

  return publicAuthPayload(user);
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

export async function forgotPassword(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!validEmail(normalized)) throw new AppError('Enter a valid email address.');

  if (!emailConfigured()) {
    throw new AppError('Password reset email is not available because email delivery is not configured.', 503);
  }

  const user = await userRepository.findByEmail(normalized);
  const generic = { message: 'If an account exists for that email, a reset link was sent.' };
  if (!user) return generic;

  await passwordResetRepository.invalidateOpen(user.id);
  const { token, tokenHash } = createResetToken();
  const record = await passwordResetRepository.create({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const link = `${env.clientUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'Reset your PlanWise AI password',
      text: `Use this link to choose a new password. It expires in one hour.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
      html: `<p>Use this link to choose a new password. It expires in one hour.</p><p><a href="${link}">Reset your password</a></p><p>If you did not ask for this, you can ignore this email.</p>`,
    });
  } catch (error) {
    await passwordResetRepository.remove(record.id).catch(() => {});
    console.error('Password reset email failed.', error.code || 'EMAIL_SEND_FAILED');
    throw new AppError('The reset email could not be sent. Try again later.', 502);
  }
  return generic;
}

export async function resetPassword({ token, password }) {
  if (!token || !password) throw new AppError('Reset token and new password are required.');
  if (String(password).length < 8) throw new AppError('Password must be at least 8 characters.');

  const tokenHash = hashToken(token);
  const record = await passwordResetRepository.findByHash(tokenHash);
  if (!record) throw new AppError('This reset link is invalid.', 400);
  if (record.usedAt) throw new AppError('This reset link has already been used.', 400);
  if (record.expiresAt <= new Date()) throw new AppError('This reset link has expired.', 400);

  const passwordHash = await hashPassword(password);
  await passwordResetRepository.markUsedAndUpdatePassword(record.id, record.userId, passwordHash);

  return { message: 'Password updated. You can sign in with your new password.' };
}
