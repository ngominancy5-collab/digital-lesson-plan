import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = 'test-key';
process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';

const { forgotPassword, resetPassword, registerUser, loginUser } = await import('../src/services/authService.js');
const { takeCapturedNotifications } = await import('../src/services/nexusService.js');
const prisma = (await import('../src/config/database.js')).default;

const email = `planwise.reset.${Date.now()}@example.com`;
const originalPassword = 'Planwise1!';

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('password reset flow', async (t) => {
  await t.test('an invalid address is rejected and an unknown address returns no link', async () => {
    await assert.rejects(() => forgotPassword('not-an-email'), (error) => error.status === 400);
    const hidden = await forgotPassword('nobody.planwise@example.com');
    assert.equal(hidden.resetLink, undefined);
    assert.match(hidden.message, /If an account exists/i);
  });

  await t.test('a configured sender emails one temporary password', async () => {
    takeCapturedNotifications();
    await registerUser({
      fullName: 'Reset Check',
      email,
      password: originalPassword,
      role: 'Lecturer',
      institution: 'University of Zambia (UNZA)',
      department: 'Science',
    });

    const sent = await forgotPassword(email);
    assert.match(sent.message, /If an account exists/);
    assert.match(sent.message, /temporary password/i);
    const [notice] = takeCapturedNotifications();
    assert.equal(notice.template, 'Planwise Ai Login credentials');
    assert.match(notice.data.password, /^Pw.+9a$/);
    await assert.rejects(
      () => loginUser({ email, password: originalPassword }),
      (error) => error.status === 401,
    );
    const session = await loginUser({ email, password: notice.data.password });
    assert.equal(session.user.email, email);
    assert.equal(session.user.mustChangePassword, true);
  });

  await t.test('expired and unknown tokens are rejected', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    const { createResetToken, hashToken } = await import('../src/utils/tokens.js');
    const { token } = createResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 60_000),
      },
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
});
