import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { forgotPassword, resetPassword, registerUser, loginUser } = await import('../src/services/authService.js');
const prisma = (await import('../src/config/database.js')).default;

const email = `planwise.reset.${Date.now()}@example.com`;
const originalPassword = 'Planwise1!';

function tokenFrom(link) {
  return link.match(/token=([a-f0-9]+)/)?.[1] || '';
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('password reset flow', async (t) => {
  await t.test('an invalid address is rejected and an unknown address returns no link', async () => {
    await assert.rejects(() => forgotPassword('not-an-email'), (error) => error.status === 400);
    const hidden = await forgotPassword('nobody.planwise@example.com');
    assert.equal(hidden.resetLink, undefined);
  });

  await t.test('a reset link is returned and the token works only once', async () => {
    await registerUser({
      fullName: 'Reset Check',
      email,
      password: originalPassword,
      role: 'Lecturer',
      institution: 'University of Zambia (UNZA)',
      department: 'Science',
    });

    const sent = await forgotPassword(email);
    assert.match(sent.resetLink, /http:\/\/localhost:5180\/reset-password\?token=/);
    const token = tokenFrom(sent.resetLink);
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
    const { resetLink } = await forgotPassword(email);
    const token = tokenFrom(resetLink);
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
});
