import assert from 'node:assert/strict';
import test from 'node:test';

const { overview } = await import('../src/services/adminPanelService.js');
const prisma = (await import('../src/config/database.js')).default;

test('admin overview counts come from the database', async () => {
  const [users, plans, attendance] = await Promise.all([
    prisma.user.count(),
    prisma.lessonPlan.count(),
    prisma.attendance.count(),
  ]);
  const data = await overview();
  assert.equal(data.cards.users, users);
  assert.equal(data.cards.lessonPlans, plans);
  assert.equal(data.cards.attendanceSessions, attendance);
  assert.ok(Array.isArray(data.untracked));
  assert.ok(data.untracked.includes('AI token usage'));
  await prisma.$disconnect();
});
