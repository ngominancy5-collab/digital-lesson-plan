import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = 'test-key';
process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
process.env.NEXUS_ACCOUNT_SETUP_TEMPLATE = 'Planwise Ai Login credentials';

const { requestAccount, loginUser } = await import('../src/services/authService.js');
const { takeCapturedNotifications } = await import('../src/services/nexusService.js');
const prisma = (await import('../src/config/database.js')).default;

const stamp = Date.now();
const email = `planwise.signup.${stamp}@example.com`;
const fullName = 'Liah Phiri';

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('create account rejects a missing name and an invalid email', async () => {
  await assert.rejects(
    () => requestAccount({ fullName: '   ', email: 'liah@example.com' }),
    (error) => error.message === 'Please enter your full name.',
  );
  await assert.rejects(
    () => requestAccount({ fullName: 'Liah Phiri', email: 'not-an-email' }),
    (error) => error.message === 'Please enter a valid email address.',
  );
});

test('sign up stays pending until an administrator assigns a role', async () => {
  takeCapturedNotifications();
  const created = await requestAccount({ fullName, email, role: 'admin', password: 'ShouldNotBeUsed1', institution: 'University of Zambia (UNZA)' });
  assert.equal(created.message, 'Your account is waiting for administrator approval.');
  assert.equal(takeCapturedNotifications().length, 0);

  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  assert.equal(user.fullName, fullName);
  assert.equal(user.role, 'unassigned');
  assert.equal(user.accountStatus, 'pending');
  assert.equal(user.emailVerified, false);
  assert.equal(user.mustChangePassword, false);
  assert.equal(user.roleConfirmed, false);
  assert.equal(user.profile.institution, 'University of Zambia (UNZA)');
  assert.equal(user.passwordHash.includes('ShouldNotBeUsed1'), false);

  await assert.rejects(
    () => loginUser({ email, password: 'ShouldNotBeUsed1' }),
    (error) => error.status === 401,
  );

  const again = await requestAccount({ fullName: 'Liah Phiri', email });
  assert.equal(again.message, 'Your account is waiting for administrator approval.');
  const stillPending = await prisma.user.findUnique({ where: { email } });
  assert.equal(stillPending.accountStatus, 'pending');
  assert.equal(stillPending.role, 'unassigned');

  await prisma.user.update({ where: { email }, data: { accountStatus: 'approved', emailVerified: true, role: 'lecturer', roleConfirmed: true } });
  await assert.rejects(
    () => requestAccount({ fullName: 'Someone Else', email }),
    (error) => error.status === 409 && error.message === 'An account with this email already exists.',
  );
});
