import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = process.env.NEXUS_API_KEY || 'test-key';
process.env.NEXUS_BASE_URL = process.env.NEXUS_BASE_URL || 'https://nexuszm.com/api/v1';

const { requestAccount, loginUser, confirmAssignedRole, updateProfile } = await import('../src/services/authService.js');
const { approveAccount } = await import('../src/services/adminService.js');
const { overview } = await import('../src/services/adminPanelService.js');
const { takeCapturedNotifications } = await import('../src/services/nexusService.js');
const { roleConfirmationBlocks } = await import('../src/middleware/auth.js');
const prisma = (await import('../src/config/database.js')).default;

const stamp = Date.now();
const teacherEmail = `planwise.role.teacher.${stamp}@example.com`;
const lecturerEmail = `planwise.role.lecturer.${stamp}@example.com`;

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [teacherEmail, lecturerEmail] } } }).catch(() => {});
  await prisma.$disconnect();
});

test('an administrator assigns the role and the user must confirm it', async () => {
  takeCapturedNotifications();
  await requestAccount({ fullName: 'Role Teacher', email: teacherEmail, role: 'lecturer' });
  const pending = await prisma.user.findUnique({ where: { email: teacherEmail } });
  assert.equal(pending.role, 'unassigned');
  assert.equal(pending.accountStatus, 'pending');
  assert.equal(takeCapturedNotifications().length, 0);

  const before = await overview();
  assert.ok(before.pendingApprovals.some((user) => user.email === teacherEmail));
  assert.equal(before.cards.pendingApprovals, await prisma.user.count({ where: { accountStatus: 'pending' } }));
  assert.equal(before.cards.users, await prisma.user.count());
  assert.equal(before.cards.suspendedAccounts, await prisma.user.count({ where: { accountStatus: 'suspended' } }));

  await assert.rejects(
    () => approveAccount(pending.id, {}, 'admin-actor'),
    (error) => error.status === 400 && /select teacher or lecturer/i.test(error.message),
  );
  await assert.rejects(
    () => approveAccount(pending.id, { role: 'lecturer' }, pending.id),
    (error) => error.status === 403 && /own account/i.test(error.message),
  );

  takeCapturedNotifications();
  const approved = await approveAccount(pending.id, { role: 'teacher' }, 'admin-actor');
  assert.equal(approved.role, 'Teacher');
  assert.equal(approved.roleConfirmed, false);
  assert.equal(approved.accountStatus, 'approved');
  const [mail] = takeCapturedNotifications();
  assert.match(mail.data.password, /^Pw/);
  const note = await prisma.notification.findFirst({ where: { userId: pending.id, type: 'role-confirmation' } });
  assert.match(note.message, /role of Teacher/);
  assert.equal(note.isRead, false);

  const session = await loginUser({ email: teacherEmail, password: mail.data.password });
  assert.equal(session.user.roleConfirmed, false);
  assert.equal(roleConfirmationBlocks({ role: 'teacher', roleConfirmed: false }, '/api/lesson-plans'), true);
  assert.equal(roleConfirmationBlocks({ role: 'teacher', roleConfirmed: false }, '/api/notifications'), false);
  assert.equal(roleConfirmationBlocks({ role: 'teacher', roleConfirmed: false }, '/api/auth/confirm-role'), false);
  assert.equal(roleConfirmationBlocks({ role: 'teacher', roleConfirmed: true }, '/api/lesson-plans'), false);

  await assert.rejects(
    () => updateProfile(pending.id, { fullName: 'Role Teacher', email: teacherEmail, role: 'lecturer' }),
    (error) => error.status === 403 && /administrator can change/i.test(error.message),
  );
  assert.equal((await prisma.user.findUnique({ where: { email: teacherEmail } })).role, 'teacher');

  const confirmed = await confirmAssignedRole(pending.id);
  assert.equal(confirmed.roleConfirmed, true);
  assert.equal(confirmed.role, 'Teacher');
  const resolved = await prisma.notification.findFirst({ where: { userId: pending.id, type: 'role-confirmation' } });
  assert.equal(resolved.isRead, true);
  assert.equal(roleConfirmationBlocks({ role: 'teacher', roleConfirmed: true }, '/api/lesson-plans'), false);

  await requestAccount({ fullName: 'Role Lecturer', email: lecturerEmail });
  const second = await prisma.user.findUnique({ where: { email: lecturerEmail } });
  const lecturer = await approveAccount(second.id, { role: 'lecturer' }, 'admin-actor');
  assert.equal(lecturer.role, 'Lecturer');
  assert.equal(lecturer.roleConfirmed, false);
  const lecturerNote = await prisma.notification.findFirst({ where: { userId: second.id, type: 'role-confirmation' } });
  assert.match(lecturerNote.message, /role of Lecturer/);

  const after = await overview();
  assert.equal(after.cards.awaitingRoleConfirmation, await prisma.user.count({
    where: { accountStatus: 'approved', roleConfirmed: false, role: { in: ['teacher', 'lecturer'] } },
  }));
  assert.equal(after.cards.confirmedAccounts, await prisma.user.count({ where: { accountStatus: 'approved', roleConfirmed: true } }));
  assert.equal(after.cards.approvedUsers, await prisma.user.count({ where: { accountStatus: 'approved' } }));
});
