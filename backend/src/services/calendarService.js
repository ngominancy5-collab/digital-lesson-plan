import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { mapCalendarEvent } from '../utils/mappers.js';

function combineDateTime(date, time, fallbackHour = 9) {
  const day = String(date || '').slice(0, 10);
  const clock = String(time || '').trim() || `${String(fallbackHour).padStart(2, '0')}:00`;
  const iso = `${day}T${clock.length === 5 ? `${clock}:00` : clock}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

export async function listEvents(userId) {
  const events = await prisma.calendarEvent.findMany({
    where: { userId },
    orderBy: { startAt: 'asc' },
  });
  return events.map(mapCalendarEvent);
}

export async function createEvent(userId, body) {
  const date = body.date || (body.startAt ? String(body.startAt).slice(0, 10) : '');
  if (!body.title?.trim()) throw new AppError('Event title is required.');
  if (!date && !body.startAt) throw new AppError('Event date is required.');

  const startAt = body.startAt ? new Date(body.startAt) : combineDateTime(date, body.startTime, 9);
  const endAt = body.endAt
    ? new Date(body.endAt)
    : (body.endTime ? combineDateTime(date || startAt.toISOString().slice(0, 10), body.endTime, 11) : null);

  const event = await prisma.calendarEvent.create({
    data: {
      userId,
      title: body.title.trim(),
      description: body.description || '',
      eventType: body.eventType || body.type || 'lesson',
      startAt,
      endAt,
      date: date || startAt.toISOString().slice(0, 10),
      startTime: body.startTime || '',
      endTime: body.endTime || '',
      status: body.status || 'confirmed',
      source: body.source || 'manual',
      lessonPlanId: body.lessonPlanId || null,
    },
  });
  return mapCalendarEvent(event);
}

export async function updateEvent(userId, id, body) {
  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Calendar event not found.', 404);

  const date = body.date ?? existing.date;
  const startTime = body.startTime ?? existing.startTime;
  const endTime = body.endTime ?? existing.endTime;
  const startAt = body.startAt
    ? new Date(body.startAt)
    : combineDateTime(date, startTime, 9);
  const endAt = body.endAt
    ? new Date(body.endAt)
    : (endTime ? combineDateTime(date, endTime, 11) : existing.endAt);

  const event = await prisma.calendarEvent.update({
    where: { id },
    data: {
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      eventType: body.eventType || body.type || existing.eventType,
      startAt,
      endAt,
      date,
      startTime,
      endTime,
      status: body.status ?? existing.status,
      source: body.source ?? existing.source,
      lessonPlanId: body.lessonPlanId !== undefined ? body.lessonPlanId : existing.lessonPlanId,
    },
  });
  return mapCalendarEvent(event);
}

export async function deleteEvent(userId, id) {
  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError('Calendar event not found.', 404);
  await prisma.calendarEvent.delete({ where: { id } });
  return { ok: true };
}

export async function replaceAllEvents(userId, events) {
  // Used when frontend syncs a full calendar list after local edits.
  await prisma.calendarEvent.deleteMany({ where: { userId, source: { in: ['manual', 'suggested'] } } });
  const created = [];
  for (const item of events || []) {
    created.push(await createEvent(userId, item));
  }
  return created;
}
