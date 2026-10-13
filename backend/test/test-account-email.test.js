import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = 'test-key';
process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
process.env.NEXUS_LOGIN_TEMPLATE = 'user_created';
process.env.ALLOW_UNAPPROVED_TEST_ACCOUNTS = 'false';

const { createUnapprovedTestAccount } = await import('../src/services/authService.js');
const { takeCapturedNotifications } = await import('../src/services/nexusService.js');
const prisma = (await import('../src/config/database.js')).default;

const email = `planwise.emailtest.${Date.now()}@example.com`;

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('unapproved test accounts stay off unless the flag is explicitly enabled', async () => {
  process.env.ALLOW_UNAPPROVED_TEST_ACCOUNTS = 'false';
  await assert.rejects(
    () => createUnapprovedTestAccount({ fullName: 'Test Lecturer', email, role: 'admin' }),
    (error) => error.status === 403 && /turned off/i.test(error.message),
  );
  assert.equal(await prisma.user.findUnique({ where: { email } }), null);

  process.env.NODE_ENV = 'production';
  process.env.ALLOW_UNAPPROVED_TEST_ACCOUNTS = 'true';
  try {
    await assert.rejects(
      () => createUnapprovedTestAccount({ fullName: 'Test Lecturer', email }),
      (error) => error.status === 403,
    );
  } finally {
    process.env.NODE_ENV = 'test';
  }
  assert.equal(await prisma.user.findUnique({ where: { email } }), null);
});

test('a rejected Nexus response is not reported as sent', async () => {
  process.env.ALLOW_UNAPPROVED_TEST_ACCOUNTS = 'true';
  process.env.NEXUS_CAPTURE = 'false';
  const failEmail = `planwise.emailfail.${Date.now()}@example.com`;
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 401,
    json: async () => ({ error: 'Invalid or missing API key' }),
  });
  try {
    await assert.rejects(
      () => createUnapprovedTestAccount({ fullName: 'Fail Test', email: failEmail, role: 'admin' }),
      (error) => error.status === 502 && /did not accept/i.test(error.message) && !/successfully/i.test(error.message),
    );
    const user = await prisma.user.findUnique({ where: { email: failEmail } });
    assert.equal(user.role, 'lecturer');
    const notice = await prisma.notification.findFirst({ where: { userId: user.id, type: 'login-email' } });
    assert.match(notice.message, /status=failed/);
    assert.equal(notice.message.includes('Permanent'), false);
  } finally {
    global.fetch = originalFetch;
    process.env.NEXUS_CAPTURE = 'true';
    await prisma.user.deleteMany({ where: { email: failEmail } }).catch(() => {});
  }
});

test('an enabled test account emails a setup link and does not grant admin access', async () => {
  process.env.ALLOW_UNAPPROVED_TEST_ACCOUNTS = 'true';
  process.env.NEXUS_CAPTURE = 'true';
  takeCapturedNotifications();
  const result = await createUnapprovedTestAccount({
    fullName: 'Email Test',
    email,
    role: 'Administrator',
    password: 'PermanentSecret1',
  });
  assert.equal(result.emailStatus, 'accepted');
  assert.equal(result.inboxVerified, false);
  assert.match(result.message, /accepted the email for processing/i);
  assert.match(result.message, /not been verified/i);

  const user = await prisma.user.findUnique({ where: { email } });
  assert.equal(user.role, 'lecturer');
  assert.equal(user.accountStatus, 'approved');
  assert.equal(user.passwordHash.includes('PermanentSecret1'), false);
  assert.equal(user.passwordHash.includes('reset-password'), false);

  const [sent] = takeCapturedNotifications();
  assert.equal(sent.template, 'user_created');
  assert.equal(sent.to, email);
  assert.equal(sent.data.user_name, 'Email Test');
  assert.equal(sent.data.email, email);
  assert.match(sent.data.password, /\/reset-password\?token=[a-f0-9]+/);
  assert.equal(sent.data.password.includes('PermanentSecret1'), false);
  assert.equal(Object.hasOwn(sent.data, 'otp_code'), false);

  const token = sent.data.password.match(/token=([a-f0-9]+)/)[1];
  const stored = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
  assert.notEqual(stored.tokenHash, token);
  assert.equal(stored.tokenHash.includes(token), false);

  const notice = await prisma.notification.findFirst({ where: { userId: user.id, type: 'login-email' } });
  assert.match(notice.message, /status=accepted/);
  assert.equal(notice.message.includes(token), false);

  const again = await createUnapprovedTestAccount({ fullName: 'Email Test', email });
  assert.match(again.message, /second email was not sent/i);
  assert.equal(takeCapturedNotifications().length, 0);
});
