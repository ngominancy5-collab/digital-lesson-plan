import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { formatRole } from '../utils/mappers.js';

const PAGE_SIZE_MAX = 50;
const ROLE_FILTERS = ['teacher', 'lecturer', 'admin', 'student', 'coordinator'];
const USER_SORTS = {
  name: { fullName: 'asc' },
  email: { email: 'asc' },
  createdAt: { createdAt: 'desc' },
  role: { role: 'asc' },
  status: { accountStatus: 'asc' },
  lastLoginAt: { lastLoginAt: 'desc' },
};

function pageParams(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(5, Number(query.pageSize) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function rangeStart(range) {
  const days = range === '7' ? 7 : range === '90' ? 90 : range === '30' ? 30 : 0;
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function createdWhere(range) {
  const start = rangeStart(range);
  return start ? { createdAt: { gte: start } } : {};
}

function bucketDays(rows, start, days) {
  const end = new Date();
  const span = days || 14;
  const labels = [];
  const counts = new Map();
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = day.toISOString().slice(0, 10);
    labels.push(key);
    counts.set(key, 0);
  }
  for (const row of rows) {
    const key = new Date(row.createdAt).toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    else if (!start) {
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!labels.includes(key)) labels.push(key);
    }
  }
  const keys = start ? labels : [...counts.keys()].sort();
  return keys.map((key) => ({ date: key, count: counts.get(key) || 0 }));
}

async function datedRows(model, range, extra = {}) {
  return prisma[model].findMany({
    where: { ...createdWhere(range), ...extra },
    select: { createdAt: true },
  });
}

function publicUser(user) {
  const requestedRoleKey = user.requestedRole && user.requestedRole !== 'unassigned'
    ? user.requestedRole
    : null;
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username || user.fullName || '',
    email: user.email,
    role: formatRole(user.role),
    roleKey: user.role,
    requestedRole: requestedRoleKey ? formatRole(requestedRoleKey) : '',
    requestedRoleKey: requestedRoleKey || '',
    institution: user.profile?.institution || '',
    department: user.profile?.department || '',
    accountStatus: user.accountStatus,
    roleConfirmed: user.roleConfirmed !== false,
    credentialEmailStatus: user.credentialEmailStatus || 'none',
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lessonPlans: user._count?.lessonPlans ?? 0,
    assessments: user._count?.assessments ?? 0,
    quizzes: user._count?.quizzes ?? 0,
    attendanceSessions: user._count?.attendanceRecords ?? 0,
  };
}

async function periodCount(model, from, to) {
  return prisma[model].count({
    where: { createdAt: { gte: from, lt: to } },
  });
}

export async function overview() {
  const now = new Date();
  const recentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const accountCounts = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { accountStatus: 'approved' } }),
    prisma.user.count({ where: { accountStatus: 'pending' } }),
    prisma.user.count({ where: { accountStatus: 'approved', roleConfirmed: false, role: { in: ['teacher', 'lecturer'] } } }),
    prisma.user.count({ where: { accountStatus: 'approved', roleConfirmed: true } }),
    prisma.user.count({ where: { accountStatus: 'suspended' } }),
    prisma.user.count({ where: { lastLoginAt: { gte: recentStart } } }),
  ]);
  const [
    users,
    activeUsers,
    pendingApprovals,
    awaitingRoleConfirmation,
    confirmedAccounts,
    suspendedAccounts,
    recentSignIns,
  ] = accountCounts;
  const [
    lessonPlans,
    assessments,
    quizzes,
    attendanceSessions,
    aiLessonPlans,
    assistantReplies,
    pendingUsers,
  ] = await Promise.all([
    prisma.lessonPlan.count(),
    prisma.assessment.count(),
    prisma.quiz.count(),
    prisma.attendance.count(),
    prisma.lessonPlan.count({ where: { aiGenerated: true } }),
    prisma.aiMessage.count({ where: { sender: 'assistant' } }),
    prisma.user.findMany({
      where: { accountStatus: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        role: true,
        requestedRole: true,
        accountStatus: true,
        roleConfirmed: true,
        credentialEmailStatus: true,
        mustChangePassword: true,
        createdAt: true,
        profile: { select: { institution: true, department: true } },
      },
    }),
  ]);
  const [
    trackedAiSuccess,
    trackedAiFailed,
    recentActivity,
    userCurrent,
    userPrevious,
    planCurrent,
    planPrevious,
  ] = await Promise.all([
    prisma.activityLog.count({ where: { type: { startsWith: 'ai.' }, outcome: 'success' } }),
    prisma.activityLog.count({ where: { type: { startsWith: 'ai.' }, outcome: 'failed' } }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { fullName: true, role: true } } },
    }),
    periodCount('user', recentStart, now),
    periodCount('user', previousStart, recentStart),
    periodCount('lessonPlan', recentStart, now),
    periodCount('lessonPlan', previousStart, recentStart),
  ]);

  return {
    cards: {
      users,
      activeUsers,
      approvedUsers: activeUsers,
      pendingApprovals,
      awaitingRoleConfirmation,
      confirmedAccounts,
      suspendedAccounts,
      recentSignIns,
      lessonPlans,
      assessmentsAndQuizzes: assessments + quizzes,
      assessments,
      quizzes,
      attendanceSessions,
      aiStoredOutputs: aiLessonPlans + quizzes + assistantReplies,
      aiTrackedSuccess: trackedAiSuccess,
      aiTrackedFailed: trackedAiFailed,
    },
    comparisons: {
      users: { current: userCurrent, previous: userPrevious, label: 'registrations, last 30 days vs the 30 days before' },
      lessonPlans: { current: planCurrent, previous: planPrevious, label: 'lesson plans, last 30 days vs the 30 days before' },
    },
    untracked: ['AI token usage', 'AI cost', 'Service uptime'],
    pendingApprovals: pendingUsers.map(publicUser),
    recentActivity: recentActivity.map(presentActivity),
  };
}

function presentActivity(row) {
  return {
    id: row.id,
    type: row.type,
    summary: row.summary,
    outcome: row.outcome,
    createdAt: row.createdAt,
    targetType: row.targetType,
    targetId: row.targetId,
    user: row.user ? row.user.fullName : 'Unknown',
    role: row.user ? formatRole(row.user.role) : (row.actorRole || ''),
  };
}

export async function listUsers(query) {
  const { page, pageSize, skip } = pageParams(query);
  const q = String(query.q || '').trim();
  const status = String(query.status || '').trim();
  const role = String(query.role || 'educators').trim();
  const sort = USER_SORTS[query.sort] || USER_SORTS.createdAt;
  const where = {};
  if (role === 'educators') where.role = { in: ['teacher', 'lecturer', 'unassigned'] };
  else if (ROLE_FILTERS.includes(role)) where.role = role;
  else if (role === 'unassigned') where.role = 'unassigned';
  if (['pending', 'approved', 'rejected', 'suspended', 'inactive'].includes(status)) where.accountStatus = status;
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { profile: { institution: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: sort,
      skip,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        role: true,
        requestedRole: true,
        accountStatus: true,
        roleConfirmed: true,
        credentialEmailStatus: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { institution: true, department: true } },
        _count: { select: { lessonPlans: true, assessments: true, quizzes: true, attendanceRecords: true } },
      },
    }),
  ]);
  return { users: rows.map(publicUser), total, page, pageSize };
}

export async function userDetail(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      role: true,
      requestedRole: true,
      accountStatus: true,
      roleConfirmed: true,
      credentialEmailStatus: true,
      mustChangePassword: true,
      createdAt: true,
      lastLoginAt: true,
      profile: { select: { institution: true, department: true } },
      _count: { select: { lessonPlans: true, assessments: true, quizzes: true, attendanceRecords: true } },
      attendanceRecords: { orderBy: { clockIn: 'desc' }, take: 8 },
      lessonPlans: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, subject: true, createdAt: true } },
    },
  });
  if (!user) throw new AppError('Account not found.', 404);
  return {
    ...publicUser(user),
    recentAttendance: user.attendanceRecords.map((row) => ({
      id: row.id,
      date: row.date,
      clockIn: row.clockIn,
      clockOut: row.clockOut,
      status: row.status,
      workedMinutes: row.workedMinutes,
    })),
    recentLessonPlans: user.lessonPlans,
  };
}

export async function listActivity(query) {
  const { page, pageSize, skip } = pageParams(query);
  const where = {};
  const start = query.from ? new Date(query.from) : rangeStart(query.range || '30');
  const end = query.to ? new Date(query.to) : null;
  if (start || end) {
    where.createdAt = {};
    if (start && !Number.isNaN(start.getTime())) where.createdAt.gte = start;
    if (end && !Number.isNaN(end.getTime())) where.createdAt.lte = end;
  }
  if (query.userId) where.userId = String(query.userId);
  if (query.type) where.type = String(query.type);
  if (query.role && ROLE_FILTERS.includes(query.role)) where.user = { role: query.role };
  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { user: { select: { fullName: true, role: true } } },
    }),
  ]);
  return { events: rows.map(presentActivity), total, page, pageSize };
}

export async function listLessonPlans(query) {
  const { page, pageSize, skip } = pageParams(query);
  const q = String(query.q || '').trim();
  const where = { ...createdWhere(query.range) };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { subject: { contains: q, mode: 'insensitive' } },
      { topic: { contains: q, mode: 'insensitive' } },
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.lessonPlan.count({ where }),
    prisma.lessonPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        subject: true,
        topic: true,
        status: true,
        aiGenerated: true,
        createdAt: true,
        user: { select: { fullName: true, role: true, profile: { select: { institution: true } } } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    plans: rows.map((row) => ({
      id: row.id,
      title: row.title,
      subject: row.subject || '',
      topic: row.topic || '',
      status: row.status,
      aiGenerated: row.aiGenerated,
      createdAt: row.createdAt,
      creator: row.user.fullName,
      role: formatRole(row.user.role),
      institution: row.user.profile?.institution || '',
    })),
  };
}

export async function listAssessmentsAndQuizzes(query) {
  const { page, pageSize, skip } = pageParams(query);
  const q = String(query.q || '').trim();
  const assessmentWhere = { ...createdWhere(query.range) };
  const quizWhere = { ...createdWhere(query.range) };
  if (q) {
    assessmentWhere.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
    ];
    quizWhere.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const [assessmentTotal, quizTotal, assessments, quizzes] = await Promise.all([
    prisma.assessment.count({ where: assessmentWhere }),
    prisma.quiz.count({ where: quizWhere }),
    prisma.assessment.findMany({
      where: assessmentWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: { id: true, title: true, type: true, status: true, createdAt: true, user: { select: { fullName: true } } },
    }),
    prisma.quiz.findMany({
      where: quizWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: { id: true, title: true, difficulty: true, createdAt: true, user: { select: { fullName: true } } },
    }),
  ]);
  return {
    assessmentTotal,
    quizTotal,
    page,
    pageSize,
    assessments: assessments.map((row) => ({ ...row, creator: row.user.fullName, user: undefined })),
    quizzes: quizzes.map((row) => ({ ...row, creator: row.user.fullName, user: undefined })),
  };
}

export async function listAttendance(query) {
  const { page, pageSize, skip } = pageParams(query);
  const where = {};
  if (query.userId) where.userId = String(query.userId);
  const start = query.from ? new Date(query.from) : rangeStart(query.range || '30');
  if (start && !Number.isNaN(start.getTime())) where.clockIn = { gte: start };
  const [total, openSessions, completedSessions, rows, users] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.count({ where: { ...where, clockOut: null } }),
    prisma.attendance.count({ where: { ...where, clockOut: { not: null } } }),
    prisma.attendance.findMany({
      where,
      orderBy: { clockIn: 'desc' },
      skip,
      take: pageSize,
      include: { user: { select: { fullName: true, role: true, profile: { select: { institution: true } } } } },
    }),
    prisma.user.findMany({
      where: { role: { in: ['teacher', 'lecturer'] } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
      take: 200,
    }),
  ]);
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const week = new Date(day);
  week.setDate(week.getDate() - 6);
  const month = new Date(day);
  month.setDate(month.getDate() - 29);
  const [today, thisWeek, thisMonth] = await Promise.all([
    prisma.attendance.count({ where: { clockIn: { gte: day } } }),
    prisma.attendance.count({ where: { clockIn: { gte: week } } }),
    prisma.attendance.count({ where: { clockIn: { gte: month } } }),
  ]);
  return {
    total,
    openSessions,
    completedSessions,
    summaries: { today, thisWeek, thisMonth },
    page,
    pageSize,
    users,
    sessions: rows.map((row) => ({
      id: row.id,
      user: row.user.fullName,
      role: formatRole(row.user.role),
      institution: row.user.profile?.institution || '',
      date: row.date,
      clockIn: row.clockIn,
      clockOut: row.clockOut,
      status: row.clockOut ? 'completed' : 'open',
      workedMinutes: row.workedMinutes,
    })),
  };
}

export async function aiUsage(query) {
  const where = { ...createdWhere(query.range || '30'), type: { startsWith: 'ai.' } };
  const [success, failed, byType, storedPlans, storedQuizzes, storedMessages] = await Promise.all([
    prisma.activityLog.count({ where: { ...where, outcome: 'success' } }),
    prisma.activityLog.count({ where: { ...where, outcome: 'failed' } }),
    prisma.activityLog.groupBy({ by: ['type'], where, _count: { _all: true } }),
    prisma.lessonPlan.count({ where: { aiGenerated: true, ...createdWhere(query.range || '30') } }),
    prisma.quiz.count({ where: createdWhere(query.range || '30') }),
    prisma.aiMessage.count({ where: { sender: 'assistant', ...createdWhere(query.range || '30') } }),
  ]);
  const tracked = Object.fromEntries(byType.map((row) => [row.type, row._count._all]));
  return {
    trackedSuccess: success,
    trackedFailed: failed,
    tracked,
    stored: {
      aiLessonPlans: storedPlans,
      quizzes: storedQuizzes,
      assistantReplies: storedMessages,
    },
    notTracked: ['Token usage', 'AI cost', 'Uptime', 'A single combined success rate for activity before logging started'],
  };
}

export async function analytics(query) {
  const range = ['7', '30', '90', 'all'].includes(query.range) ? query.range : '30';
  const days = range === '7' ? 7 : range === '90' ? 90 : range === 'all' ? 0 : 30;
  const [users, plans, attendance, assessments, quizzes, ai] = await Promise.all([
    datedRows('user', range),
    datedRows('lessonPlan', range),
    prisma.attendance.findMany({ where: rangeStart(range) ? { clockIn: { gte: rangeStart(range) } } : {}, select: { createdAt: true, clockIn: true } }).then((rows) => rows.map((row) => ({ createdAt: row.clockIn }))),
    datedRows('assessment', range),
    datedRows('quiz', range),
    prisma.activityLog.findMany({
      where: { type: { startsWith: 'ai.' }, outcome: 'success', ...createdWhere(range) },
      select: { createdAt: true },
    }),
  ]);
  const span = days || 14;
  return {
    range,
    series: {
      users: bucketDays(users, rangeStart(range), span),
      lessonPlans: bucketDays(plans, rangeStart(range), span),
      attendance: bucketDays(attendance, rangeStart(range), span),
      assessments: bucketDays(assessments, rangeStart(range), span),
      quizzes: bucketDays(quizzes, rangeStart(range), span),
      ai: bucketDays(ai, rangeStart(range), span),
    },
  };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function exportCsv(kind, query) {
  const range = query.range || '30';
  let header = [];
  let lines = [];
  if (kind === 'users') {
    const { users } = await listUsers({ ...query, page: 1, pageSize: 50 });
    header = ['Name', 'Email', 'Role', 'Institution', 'Status', 'Registered', 'Last sign-in'];
    lines = users.map((user) => [user.fullName, user.email, user.role, user.institution, user.accountStatus, user.createdAt, user.lastLoginAt || '']);
  } else if (kind === 'activity') {
    const { events } = await listActivity({ ...query, range, page: 1, pageSize: 50 });
    header = ['When', 'User', 'Role', 'Type', 'Summary', 'Outcome'];
    lines = events.map((row) => [row.createdAt, row.user, row.role, row.type, row.summary, row.outcome]);
  } else if (kind === 'attendance') {
    const { sessions } = await listAttendance({ ...query, range, page: 1, pageSize: 50 });
    header = ['User', 'Date', 'Clock in', 'Clock out', 'Status', 'Minutes'];
    lines = sessions.map((row) => [row.user, row.date, row.clockIn, row.clockOut || '', row.status, row.workedMinutes ?? '']);
  } else if (kind === 'lesson-plans') {
    const { plans } = await listLessonPlans({ ...query, range, page: 1, pageSize: 50 });
    header = ['Title', 'Creator', 'Subject', 'Topic', 'Institution', 'Created', 'AI generated'];
    lines = plans.map((row) => [row.title, row.creator, row.subject, row.topic, row.institution, row.createdAt, row.aiGenerated ? 'yes' : 'no']);
  } else {
    throw new AppError('That export is not available.', 404);
  }
  const body = [header, ...lines].map((row) => row.map(csvEscape).join(',')).join('\n');
  return { filename: `planwise-${kind}.csv`, body };
}
