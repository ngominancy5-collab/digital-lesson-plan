/**
 * Client-side feature navigation for the top search bar.
 * Matches common phrases to existing App sections (no new routes).
 */

const FEATURES = [
  {
    id: 'assessments',
    label: 'Assessments',
    section: { default: 'assessments', Administrator: 'admin-assessments' },
    aliases: [
      'assessment', 'assessments', 'quiz', 'quizzes', 'test', 'tests',
      'exam', 'exams', 'create assessment', 'new assessment', 'generate assessment',
    ],
  },
  {
    id: 'plans',
    label: 'Lesson Plans',
    section: { default: 'plans', Administrator: 'admin-plans' },
    aliases: [
      'lesson', 'lessons', 'lesson plan', 'lesson plans', 'create lesson plan',
      'new lesson plan', 'generate lesson plan', 'teaching plan', 'plans',
    ],
  },
  {
    id: 'create-plan',
    label: 'Create Lesson Plan',
    section: { default: 'create-plan' },
    aliases: [
      'create lesson', 'create plan', 'new plan', 'make lesson plan',
      'generate plan', 'build lesson plan',
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    section: { default: 'calendar', Administrator: 'admin-attendance' },
    aliases: [
      'calendar', 'schedule', 'timetable', 'events', 'event', 'teaching calendar',
    ],
  },
  {
    id: 'courses',
    label: 'Courses / Subjects',
    section: { default: 'courses' },
    aliases: [
      'course', 'courses', 'subject', 'subjects', 'course outline', 'course outlines',
      'outline', 'outlines', 'module', 'modules',
    ],
  },
  {
    id: 'upload-course',
    label: 'Upload Course Outline',
    section: { default: 'upload-course' },
    aliases: [
      'upload course', 'upload outline', 'summarise', 'summarize', 'summary',
      'course summary', 'summarise outline', 'summarize outline',
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    section: { default: 'resources' },
    aliases: ['resource', 'resources', 'files', 'materials', 'library', 'uploads'],
  },
  {
    id: 'paper-marking',
    label: 'Paper Marking',
    section: { default: 'paper-marking' },
    aliases: [
      'paper marking', 'marking', 'mark papers', 'grade papers', 'grading',
      'upload papers', 'mark paper',
    ],
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    section: { default: 'assistant' },
    aliases: ['assistant', 'ai', 'ai assistant', 'tutor', 'chat', 'help'],
  },
  {
    id: 'reports',
    label: 'Reports',
    section: { default: 'reports', Administrator: 'admin-analytics' },
    aliases: ['report', 'reports', 'analytics', 'insights'],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    section: { default: 'dashboard', Administrator: 'admin-overview' },
    aliases: ['dashboard', 'home', 'overview'],
  },
  {
    id: 'profile',
    label: 'Profile',
    section: { default: 'profile' },
    aliases: ['profile', 'my profile', 'account profile', 'edit profile'],
  },
  {
    id: 'settings',
    label: 'Settings',
    section: { default: 'settings' },
    aliases: ['settings', 'setting', 'account settings', 'preferences'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    section: { default: 'notifications' },
    aliases: ['notification', 'notifications', 'alerts', 'inbox'],
  },
  {
    id: 'billing',
    label: 'Plans & Billing',
    section: { default: 'billing', Administrator: 'admin-billing' },
    aliases: ['billing', 'subscription', 'plans and billing', 'payment', 'payments'],
  },
  {
    id: 'progress',
    label: 'Progress',
    section: { default: 'progress' },
    aliases: ['progress', 'topic progress', 'course progress'],
  },
  {
    id: 'admin-users',
    label: 'Users',
    section: { default: 'admin-users', Administrator: 'admin-users' },
    aliases: ['users', 'user directory', 'accounts', 'approve', 'approvals'],
  },
  {
    id: 'admin-activity',
    label: 'System Activity',
    section: { default: 'admin-activity', Administrator: 'admin-activity' },
    aliases: ['activity', 'system activity', 'audit', 'logs'],
  },
  {
    id: 'admin-ai',
    label: 'AI Usage',
    section: { default: 'admin-ai', Administrator: 'admin-ai' },
    aliases: ['ai usage', 'usage', 'token usage'],
  },
  {
    id: 'admin-attendance',
    label: 'Attendance',
    section: { default: 'admin-attendance', Administrator: 'admin-attendance' },
    aliases: ['attendance', 'clock in', 'clock out'],
  },
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreAlias(query, alias) {
  if (!query || !alias) return 0;
  if (query === alias) return 100;
  if (alias.startsWith(query) || query.startsWith(alias)) return 85;
  // Whole-word containment avoids “plans” matching “plans and billing” from “lesson plans”.
  const qWords = new Set(query.split(' ').filter(Boolean));
  const aWords = alias.split(' ').filter(Boolean);
  if (aWords.length === 1 && qWords.has(aWords[0])) return 80;
  if (alias.includes(query) || (query.includes(alias) && alias.length >= 5)) return 70;
  const qParts = query.split(' ');
  const overlap = qParts.filter((part) => aWords.some((aliasPart) => aliasPart.startsWith(part) || part.startsWith(aliasPart)));
  if (overlap.length && overlap.length === qParts.length) return 60;
  if (overlap.length) return 40;
  return 0;
}

function resolveSection(feature, role) {
  const map = feature.section || {};
  if (role === 'Administrator' && map.Administrator) return map.Administrator;
  return map.default || map.Administrator || null;
}

function scoreFeature(query, feature, role) {
  const section = resolveSection(feature, role);
  if (!section) return null;

  let best = scoreAlias(query, normalize(feature.label));
  for (const alias of feature.aliases) {
    best = Math.max(best, scoreAlias(query, normalize(alias)));
  }
  if (best < 40) return null;

  return {
    id: feature.id,
    label: feature.label,
    section,
    score: best,
    subtitle: `Go to ${feature.label}`,
  };
}

/**
 * @param {string} rawQuery
 * @param {string} role - Lecturer | Teacher | Administrator | ...
 * @param {string[]} allowedSections - from roleNav
 */
export function matchFeatures(rawQuery, role, allowedSections = []) {
  const query = normalize(rawQuery);
  if (query.length < 2) return [];

  const allowed = new Set(allowedSections);
  const scored = [];

  for (const feature of FEATURES) {
    const hit = scoreFeature(query, feature, role);
    if (!hit) continue;
    if (allowed.size && !allowed.has(hit.section)) continue;
    scored.push(hit);
  }

  return scored
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .filter((item, index, list) => list.findIndex((row) => row.section === item.section) === index)
    .slice(0, 6);
}

/**
 * Strong match for a known feature the current role cannot open.
 * Used to show a clear permission message instead of a generic "no match".
 */
export function findUnauthorizedFeature(rawQuery, role, allowedSections = []) {
  const query = normalize(rawQuery);
  if (query.length < 2) return null;

  const allowed = new Set(allowedSections);
  let best = null;

  for (const feature of FEATURES) {
    const hit = scoreFeature(query, feature, role);
    if (!hit || hit.score < 70) continue;
    if (allowed.size && allowed.has(hit.section)) continue;
    if (!best || hit.score > best.score) best = hit;
  }

  return best;
}

/** Best navigation target for Enter / submit. */
export function resolveFeatureNavigation(rawQuery, role, allowedSections = []) {
  const matches = matchFeatures(rawQuery, role, allowedSections);
  if (!matches.length) return null;
  const top = matches[0];
  // Prefer clear navigation matches; avoid jumping on weak partials.
  if (top.score < 60) return null;
  return top;
}

export function isStrongFeatureQuery(rawQuery, role, allowedSections = []) {
  return Boolean(resolveFeatureNavigation(rawQuery, role, allowedSections));
}
