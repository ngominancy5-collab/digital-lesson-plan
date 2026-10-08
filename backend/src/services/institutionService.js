import { ZAMBIAN_SCHOOLS, ZAMBIAN_UNIVERSITIES } from '../../../shared/institutions.js';
import * as institutionRepository from '../repositories/institutionRepository.js';
import { parseRole } from '../utils/mappers.js';
import { AppError } from '../utils/errors.js';

export async function ensureSeeded() {
  const count = await institutionRepository.count();
  if (count > 0) return;
  await institutionRepository.createMany([
    ...ZAMBIAN_UNIVERSITIES.map((name) => ({ name, type: 'university' })),
    ...ZAMBIAN_SCHOOLS.map((name) => ({ name, type: 'school' })),
  ]);
}

export async function listInstitutions({ role, type } = {}) {
  await ensureSeeded();
  let kind = String(type || '').toLowerCase();
  if (!kind && role) {
    const parsed = parseRole(role);
    if (parsed === 'teacher') kind = 'school';
    else if (parsed === 'lecturer') kind = 'university';
  }
  const rows = await institutionRepository.list(kind || undefined);
  if (kind === 'school' || kind === 'university') {
    return { institutions: rows.map((row) => row.name), type: kind };
  }
  return {
    universities: rows.filter((row) => row.type === 'university').map((row) => row.name),
    schools: rows.filter((row) => row.type === 'school').map((row) => row.name),
  };
}

export async function assertInstitutionForRole(role, institution) {
  await ensureSeeded();
  const parsed = parseRole(role);
  if (parsed !== 'teacher' && parsed !== 'lecturer') {
    throw new AppError('Choose Lecturer or Teacher.', 400);
  }
  const row = await institutionRepository.findByName(institution);
  const expected = parsed === 'teacher' ? 'school' : 'university';
  if (!row || row.type !== expected) {
    throw new AppError('Invalid institution for selected role.', 400);
  }
}
