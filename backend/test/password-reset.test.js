import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = 'test-key';
process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
process.env.NEXUS_PASSWORD_RESET_TEMPLATE = 'password_reset';

const { forgotPassword, resetPassword, registerUser, loginUser } = await import('../src/services/authService.js');
const { takeCapturedNotifications } = await import('../src/services/nexusService.js');
const prisma = (await import('../src/config/database.js')).default;

const email = `planwise.reset.${Date.now()}@example.com`;
const originalPassword = 'Planwise1!';

function enableNexus() {
  process.env.NEXUS_CAPTURE = 'true';
  process.env.NEXUS_API_KEY = 'test-key';
  process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
}

function disableNexus() {
  process.env.NEXUS_CAPTURE = 'false';
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_BASE_URL;
}

function takeLink() {
  const [sent] = takeCapturedNotifications();
  return sent?.data?.password || '';
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('password reset email flow', async (t) => {
  await t.test('missing Nexus configuration does not claim an email was sent', async () => {
    disableNexus();
    await assert.rejects(
      () => forgotPassword(email),
      (error) => error.status === 503 && /NEXUS_API_KEY/i.test(error.message) && !/will be sent/i.test(error.message),
    );
    enableNexus();
  });

  await t.test('an invalid address is rejected and an unknown address is not revealed', async () => {
    enableNexus();
    await assert.rejects(() => forgotPassword('not-an-email'), (error) => error.status === 400);
    const hidden = await forgotPassword('nobody.planwise@example.com');
    assert.match(hidden.message, /If an account exists/);
    assert.equal(takeCapturedNotifications().length, 0);
  });

  await t.test('a configured sender delivers one reset link and the token works only once', async () => {
    enableNexus();
    await registerUser({
      fullName: 'Reset Check',
      email,
      password: originalPassword,
      role: 'Lecturer',
      institution: 'University of Zambia (UNZA)',
      department: 'Science',
    });
    takeCapturedNotifications();

    const sent = await forgotPassword(email);
    assert.match(sent.message, /If an account exists/);
    const link = takeLink();
    assert.match(link, /http:\/\/localhost:5180\/reset-password\?token=/);
    const token = link.match(/token=([a-f0-9]+)/)?.[1];
    assert.ok(token);

    await resetPassword({ token, password: 'Planwise2!' });
    await assert.rejects(
      () => loginUser({ email, password: originalPassword }),
      (error) => error.status === 401,
    );
    const session = await loginUser({ email, password: 'Planwise2!' });
    assert.equal(session.user.email, email);

    await assert.rejects(
      () => resetPassword({ token, password: 'Planwise3!' }),
      (error) => error.status === 400 && /already been used/i.test(error.message),
    );
  });

  await t.test('expired and unknown tokens are rejected', async () => {
    enableNexus();
    await forgotPassword(email);
    const token = takeLink().match(/token=([a-f0-9]+)/)?.[1];
    const { hashToken } = await import('../src/utils/tokens.js');
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 60_000), usedAt: null },
    });
    await assert.rejects(
      () => resetPassword({ token, password: 'Planwise4!' }),
      (error) => error.status === 400 && /expired/i.test(error.message),
    );
    await assert.rejects(
      () => resetPassword({ token: 'deadbeef', password: 'Planwise4!' }),
      (error) => error.status === 400 && /invalid/i.test(error.message),
    );
  });

  await t.test('a Nexus failure does not leave a usable reset token', async () => {
    process.env.NEXUS_CAPTURE = 'false';
    process.env.NEXUS_API_KEY = 'test-key';
    process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 401,
      json: async () => ({ error: 'Invalid or missing API key' }),
    });
    try {
      await assert.rejects(
        () => forgotPassword(email),
        (error) => error.status === 502 && /did not accept/i.test(error.message),
      );
      const open = await prisma.passwordResetToken.count({ where: { user: { email }, usedAt: null } });
      assert.equal(open, 0);
    } finally {
      global.fetch = originalFetch;
      enableNexus();
    }
  });
});
