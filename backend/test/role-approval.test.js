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
  await requestAccount({ username: 'Role Teacher', email: teacherEmail, role: 'lecturer' });
  const pending = await prisma.user.findUnique({ where: { email: teacherEmail } });
  assert.equal(pending.role, 'unassigned');
  assert.equal(pending.requestedRole, 'lecturer');
  assert.equal(pending.accountStatus, 'pending');
  assert.equal(takeCapturedNotifications().length, 0);

  const before = await overview();
  assert.ok(before.pendingApprovals.some((user) => user.email === teacherEmail));
  assert.equal(before.cards.pendingApprovals, await prisma.user.count({ where: { accountStatus: 'pending' } }));

  await assert.rejects(
    () => approveAccount(pending.id, {}, 'admin-actor'),
    (error) => error.status === 400 && /select teacher or lecturer/i.test(error.message),
  );
  await assert.rejects(
    () => approveAccount(pending.id, { role: 'teacher' }, 'admin-actor'),
    (error) => /institution|school|department/i.test(error.message),
  );
  await assert.rejects(
    () => approveAccount(pending.id, {
      role: 'lecturer',
      institution: 'University of Zambia (UNZA)',
      department: 'Education',
    }, pending.id),
    (error) => error.status === 403 && /own account/i.test(error.message),
  );

  takeCapturedNotifications();
  const approved = await approveAccount(pending.id, {
    role: 'teacher',
    institution: 'David Kaunda National STEM Secondary School',
    department: 'Mathematics',
  }, 'admin-actor');
  assert.equal(approved.role, 'Teacher');
  assert.equal(approved.roleConfirmed, false);
  assert.equal(approved.accountStatus, 'approved');
  assert.equal(approved.institution, 'David Kaunda National STEM Secondary School');
  const [mail] = takeCapturedNotifications();
  assert.match(mail.data.password, /^Pw/);
  const note = await prisma.notification.findFirst({ where: { userId: pending.id, type: 'role-confirmation' } });
  assert.match(note.message, /role of Teacher/);
  assert.equal(note.isRead, false);

  const session = await loginUser({ email: teacherEmail, password: mail.data.password });
  assert.equal(session.user.roleConfirmed, false);
  assert.equal(roleConfirmationBlocks({ role: 'teacher', roleConfirmed: false }, '/api/lesson-plans'), true);

  await assert.rejects(
    () => updateProfile(pending.id, { fullName: 'Role Teacher', email: teacherEmail, role: 'lecturer' }),
    (error) => error.status === 403 && /administrator can change/i.test(error.message),
  );
  assert.equal((await prisma.user.findUnique({ where: { email: teacherEmail } })).role, 'teacher');

  const confirmed = await confirmAssignedRole(pending.id);
  assert.equal(confirmed.roleConfirmed, true);
  assert.equal(confirmed.role, 'Teacher');

  await requestAccount({ username: 'Role Lecturer', email: lecturerEmail, role: 'Teacher' });
  const second = await prisma.user.findUnique({ where: { email: lecturerEmail } });
  assert.equal(second.requestedRole, 'teacher');
  const lecturer = await approveAccount(second.id, {
    role: 'lecturer',
    institution: 'University of Zambia (UNZA)',
    department: 'Science',
  }, 'admin-actor');
  assert.equal(lecturer.role, 'Lecturer');
  assert.equal(lecturer.roleConfirmed, false);
  const lecturerNote = await prisma.notification.findFirst({ where: { userId: second.id, type: 'role-confirmation' } });
  assert.match(lecturerNote.message, /role of Lecturer/);

  const after = await overview();
  assert.equal(after.cards.awaitingRoleConfirmation, await prisma.user.count({
    where: { accountStatus: 'approved', roleConfirmed: false, role: { in: ['teacher', 'lecturer'] } },
  }));
});
