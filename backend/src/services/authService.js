import prisma from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, createResetToken, hashToken } from '../utils/tokens.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';

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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('An account with this email already exists.', 409);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
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
    },
    include: { profile: true },
  });

  return publicAuthPayload(user);
}

export async function loginUser({ email, password }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !password) throw new AppError('Email and password are required.');

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { profile: true },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError('Incorrect email or password.', 401);
  }

  return publicAuthPayload(user);
}

export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) throw new AppError('Account not found.', 404);
  return mapUser(user);
}

export async function updateProfile(userId, input) {
  const fullName = String(input.fullName || input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  if (!fullName || !email) throw new AppError('Name and email are required.');

  const conflict = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
  });
  if (conflict) throw new AppError('That email is already in use.', 409);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
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
    },
    include: { profile: true },
  });

  return mapUser(user);
}

export async function forgotPassword(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new AppError('Enter a valid email address.');

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  const generic = { message: 'If an account exists for that email, password reset instructions were issued.' };
  if (!user) return generic;

  const { token, tokenHash } = createResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  // Email delivery can be wired later; in development return the token for testing.
  if (process.env.NODE_ENV !== 'production') {
    return { ...generic, resetToken: token };
  }
  return generic;
}

export async function resetPassword({ token, password }) {
  if (!token || !password) throw new AppError('Reset token and new password are required.');
  if (String(password).length < 8) throw new AppError('Password must be at least 8 characters.');

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!record) throw new AppError('Reset link is invalid or expired.', 400);

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return { message: 'Password updated. You can sign in with your new password.' };
}
