import { AppError } from '../utils/errors.js';
import * as attendanceRepository from '../repositories/attendanceRepository.js';

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function clockIn(userId) {
  const open = await attendanceRepository.findOpen(userId);
  if (open) throw new AppError('You are already clocked in.', 409);
  const now = new Date();
  const record = await attendanceRepository.create({
    userId,
    date: todayKey(now),
    clockIn: now,
    status: 'open',
  });
  return { active: record };
}

export async function clockOut(userId) {
  const open = await attendanceRepository.findOpen(userId);
  if (!open) throw new AppError('There is no active clock-in to close.', 400);
  const now = new Date();
  const workedMinutes = Math.max(0, Math.round((now.getTime() - new Date(open.clockIn).getTime()) / 60000));
  const record = await attendanceRepository.update(open.id, {
    clockOut: now,
    status: 'completed',
    workedMinutes,
  });
  return { active: null, record };
}

export async function getAttendance(userId) {
  const [active, history] = await Promise.all([
    attendanceRepository.findOpen(userId),
    attendanceRepository.listByUser(userId),
  ]);
  return { active, history };
}
