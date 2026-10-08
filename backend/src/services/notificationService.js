import * as notificationRepository from '../repositories/notificationRepository.js';
import * as preferenceRepository from '../repositories/notificationPreferenceRepository.js';

const TYPE_FLAG = {
  lesson: 'lessonPlanNotifications',
  assessment: 'assessmentNotifications',
  quiz: 'assessmentNotifications',
  calendar: 'calendarNotifications',
  system: 'systemNotifications',
  resource: 'systemNotifications',
  marking: 'systemNotifications',
};

export async function getPreferences(userId) {
  const existing = await preferenceRepository.findByUser(userId);
  if (existing) return existing;
  return preferenceRepository.upsert(userId, {});
}

export async function updatePreferences(userId, input) {
  const current = await getPreferences(userId);
  return preferenceRepository.upsert(userId, {
    emailNotifications: input.emailNotifications ?? input.notifications ?? current.emailNotifications,
    lessonPlanNotifications: input.lessonPlanNotifications ?? input.lessons ?? current.lessonPlanNotifications,
    assessmentNotifications: input.assessmentNotifications ?? input.assessments ?? current.assessmentNotifications,
    calendarNotifications: input.calendarNotifications ?? input.calendar ?? current.calendarNotifications,
    systemNotifications: input.systemNotifications ?? input.ai ?? current.systemNotifications,
  });
}

export async function notify(userId, { title, message, type = 'system' }) {
  const prefs = await getPreferences(userId);
  const flag = TYPE_FLAG[type] || 'systemNotifications';
  if (prefs[flag] === false) return null;
  return notificationRepository.create({ userId, title, message, type });
}

export async function listNotifications(userId) {
  const [items, unread] = await Promise.all([
    notificationRepository.listByUser(userId),
    notificationRepository.countUnread(userId),
  ]);
  return { notifications: items, unread };
}

export async function markNotificationRead(userId, id) {
  await notificationRepository.markRead(userId, id);
  return listNotifications(userId);
}

export async function markAllNotificationsRead(userId) {
  await notificationRepository.markAllRead(userId);
  return listNotifications(userId);
}
