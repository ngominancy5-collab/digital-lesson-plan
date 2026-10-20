import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = process.env.NEXUS_API_KEY || 'test-key';
process.env.NEXUS_BASE_URL = process.env.NEXUS_BASE_URL || 'https://nexuszm.com/api/v1';

const { requestAccount, loginUser, changePassword } = await import('../src/services/authService.js');
const { approveAccount } = await import('../src/services/adminService.js');
const { loginTemplateName, takeCapturedNotifications } = await import('../src/services/nexusService.js');
const prisma = (await import('../src/config/database.js')).default;

const stamp = Date.now();
const email = `planwise.forcepwd.${stamp}@example.com`;

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('a temporary login must change password before the dashboard, and a failed notice does not undo it', async () => {
  takeCapturedNotifications();
  await requestAccount({ fullName: 'Liah Phiri', email });
  assert.equal(takeCapturedNotifications().length, 0);
  const created = await prisma.user.findUnique({ where: { email } });
  assert.equal(created.accountStatus, 'pending');
  assert.equal(created.role, 'unassigned');
  takeCapturedNotifications();
  await approveAccount(created.id, { role: 'lecturer' }, 'admin-actor');
  const [loginMail] = takeCapturedNotifications();
  assert.equal(loginMail.template, loginTemplateName());
  assert.equal(Object.hasOwn(loginMail.data, 'password'), true);

  const session = await loginUser({ email, password: loginMail.data.password });
  assert.equal(session.user.mustChangePassword, true);

  await assert.rejects(
    () => changePassword(session.user.id, { password: 'short', confirm: 'short' }),
    (error) => error.status === 400 && /8 characters/i.test(error.message),
  );

  const stillForced = await prisma.user.findUnique({ where: { email } });
  assert.equal(stillForced.mustChangePassword, true);

  takeCapturedNotifications();
  const updated = await changePassword(session.user.id, { password: 'PlanwiseFresh1' });
  assert.equal(updated.mustChangePassword, false);
  const [notice] = takeCapturedNotifications();
  assert.equal(notice.template, 'password_changed');
  assert.equal(notice.to, email);
  assert.equal(notice.data.user_name, 'Liah Phiri');
  assert.equal(Object.hasOwn(notice.data, 'password'), false);

  const next = await loginUser({ email, password: 'PlanwiseFresh1' });
  assert.equal(next.user.mustChangePassword, false);
  await assert.rejects(
    () => loginUser({ email, password: loginMail.data.password }),
    (error) => error.status === 401,
  );

  await prisma.user.update({ where: { email }, data: { mustChangePassword: true } });
  process.env.NEXUS_CAPTURE = 'false';
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  delete process.env.MAIL_FROM;

  const saved = await changePassword(next.user.id, { password: 'PlanwiseFresh2' });
  assert.equal(saved.mustChangePassword, false);
  const row = await prisma.user.findUnique({ where: { email } });
  assert.equal(row.mustChangePassword, false);
  const note = await prisma.notification.findFirst({
    where: { userId: row.id, type: 'password-changed-email' },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(note.message, 'Password-change email failed.');
  assert.doesNotMatch(note.message, /PlanwiseFresh2/);

  const afterFailure = await loginUser({ email, password: 'PlanwiseFresh2' });
  assert.equal(afterFailure.user.mustChangePassword, false);
});
