export const ZAMBIAN_UNIVERSITIES = [
  'University of Zambia (UNZA)',
  'Copperbelt University (CBU)',
  'Mulungushi University',
  'University of Lusaka (UNILUS)',
  'Cavendish University Zambia',
  'Zambia Catholic University',
  'Kwame Nkrumah University',
  'Chalimbana University',
  'Northrise University',
  'Zambia Open University (ZAOU)',
];

export const ZAMBIAN_SCHOOLS = [
  'Kabulonga Girls Secondary School',
  'Munali Secondary School',
  'David Kaunda National STEM Secondary School',
  'Matero Girls Secondary School',
  'Roma Girls Secondary School',
  'St. Canisius Secondary School',
  'Mpelembe Secondary School',
  'Chengelo School',
  'Baobab College',
  'International School of Lusaka',
];

export const EDUCATOR_ROLES = [
  {
    value: 'Lecturer',
    label: 'Lecturer',
    description: 'Plan and manage university or college courses and lessons.',
  },
  {
    value: 'Teacher',
    label: 'Teacher',
    description: 'Create and manage school lessons, assessments and marking.',
  },
];

export function institutionMatchesRole(role, institution) {
  const value = String(role || '').toLowerCase();
  const name = String(institution || '').trim();
  if (value.includes('teacher') || value.includes('school')) return ZAMBIAN_SCHOOLS.includes(name);
  return ZAMBIAN_UNIVERSITIES.includes(name);
}
