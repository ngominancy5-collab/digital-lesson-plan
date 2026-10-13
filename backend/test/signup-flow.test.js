import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { requestAccount, loginUser, resetPassword } = await import('../src/services/authService.js');
const prisma = (await import('../src/config/database.js')).default;

const stamp = Date.now();
const email = `planwise.signup.${stamp}@example.com`;
const fullName = 'Liah Phiri';

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('sign up stays inactive until the user chooses a password', async () => {
  const created = await requestAccount({ fullName, email, role: 'admin', password: 'ShouldNotBeUsed1' });
  assert.equal(created.inboxVerified, false);
  assert.match(created.setupLink, /\/reset-password\?token=/);
  assert.match(created.message, /choose your password/i);

  const user = await prisma.user.findUnique({ where: { email } });
  assert.equal(user.fullName, fullName);
  assert.equal(user.role, 'lecturer');
  assert.equal(user.accountStatus, 'pending');
  assert.equal(user.emailVerified, false);
  assert.equal(user.passwordHash.includes('ShouldNotBeUsed1'), false);

  await assert.rejects(
    () => loginUser({ email, password: 'PlanwiseSignup1' }),
    (error) => error.status === 401,
  );

  const token = created.setupLink.match(/token=([a-f0-9]+)/)[1];
  await resetPassword({ token, password: 'PlanwiseSignup1' });
  await assert.rejects(
    () => resetPassword({ token, password: 'PlanwiseSignup2' }),
    (error) => error.status === 400 && /already been used/i.test(error.message),
  );

  const byEmail = await loginUser({ email, password: 'PlanwiseSignup1' });
  assert.equal(byEmail.user.fullName, fullName);
  await assert.rejects(
    () => loginUser({ email, password: 'WrongPassword1' }),
    (error) => error.status === 401 && /incorrect username or password/i.test(error.message),
  );

  await assert.rejects(
    () => requestAccount({ fullName: 'Someone Else', email }),
    (error) => error.status === 409 && /email/i.test(error.message),
  );
});
