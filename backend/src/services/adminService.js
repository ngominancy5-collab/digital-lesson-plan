import crypto from 'node:crypto';
import { hashPassword } from '../utils/password.js';
import { mapUser, parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';
import { assertInstitutionForRole } from './institutionService.js';
import * as userRepository from '../repositories/userRepository.js';

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

  return mapUser(user);
}

export async function listAccounts() {
  const users = await userRepository.listWithProfiles();
  return users.map(mapUser);
}

export async function approveAccount(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (user.accountStatus === 'approved' && user.mustChangePassword) {
    throw new AppError('This account is already approved and waiting for a password change.');
  }
  if (user.accountStatus === 'approved') {
    throw new AppError('This account is already approved.');
  }

  const temporary = temporaryPassword();
  const approved = await userRepository.updateWithProfile(user.id, {
    passwordHash: await hashPassword(temporary),
    accountStatus: 'approved',
    emailVerified: true,
    mustChangePassword: true,
  });

  return { user: mapUser(approved), temporaryPassword: temporary };
}

async function setStatus(userId, accountStatus) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  const updated = await userRepository.updateWithProfile(userId, { accountStatus });
  return mapUser(updated);
}

export function rejectAccount(userId) {
  return setStatus(userId, 'rejected');
}

export function suspendAccount(userId) {
  return setStatus(userId, 'suspended');
}

export function deactivateAccount(userId) {
  return setStatus(userId, 'inactive');
}

export async function restoreAccount(userId) {
  const user = await userRepository.findByIdWithProfile(userId);
  if (!user) throw new AppError('Account not found.', 404);
  if (user.accountStatus !== 'suspended' && user.accountStatus !== 'inactive') {
    throw new AppError('Only a suspended or inactive account can be restored.');
  }
  const updated = await userRepository.updateWithProfile(userId, { accountStatus: 'approved', emailVerified: true });
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
