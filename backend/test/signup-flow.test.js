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
const username = `Liah Signup ${stamp}`;

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('create account rejects missing username, role, and invalid email', async () => {
  await assert.rejects(
    () => requestAccount({ username: '   ', role: 'Lecturer', email: 'liah@example.com' }),
    (error) => error.message === 'Please enter a username.',
  );
  await assert.rejects(
    () => requestAccount({ username: 'Liah Phiri', role: '', email: 'liah@example.com' }),
    (error) => error.message === 'Please select Lecturer or Teacher.',
  );
  await assert.rejects(
    () => requestAccount({ username: 'Liah Phiri', role: 'Lecturer', email: 'not-an-email' }),
    (error) => error.message === 'Please enter a valid email address.',
  );
});

test('sign up stays pending until an administrator assigns a role', async () => {
  takeCapturedNotifications();
  const created = await requestAccount({
    username,
    role: 'Lecturer',
    email,
    password: 'ShouldNotBeUsed1',
  });
  assert.equal(created.message, 'Request successfully sent!');
  assert.equal(takeCapturedNotifications().length, 0);

  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  assert.equal(user.username, username);
  assert.equal(user.fullName, username);
  assert.equal(user.role, 'unassigned');
  assert.equal(user.requestedRole, 'lecturer');
  assert.equal(user.accountStatus, 'pending');
  assert.equal(user.emailVerified, false);
  assert.equal(user.mustChangePassword, false);
  assert.equal(user.roleConfirmed, false);
  assert.equal(user.credentialEmailStatus, 'none');
  assert.equal(user.confirmationEmailStatus, 'none');
  assert.equal(user.passwordHash.includes('ShouldNotBeUsed1'), false);

  await assert.rejects(
    () => loginUser({ email, password: 'ShouldNotBeUsed1' }),
    (error) => error.status === 401,
  );

  await assert.rejects(
    () => requestAccount({ username: 'Someone Else', role: 'Teacher', email }),
    (error) => error.status === 409 && /already pending/i.test(error.message),
  );

  await prisma.user.update({
    where: { email },
    data: { accountStatus: 'approved', emailVerified: true, role: 'lecturer', roleConfirmed: true },
  });
  await assert.rejects(
    () => requestAccount({ username: 'Someone Else', role: 'Teacher', email }),
    (error) => error.status === 409 && error.message === 'An account with this email already exists.',
  );
});
