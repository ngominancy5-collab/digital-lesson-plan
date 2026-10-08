import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { forgotPassword, resetPassword, registerUser, loginUser } = await import('../src/services/authService.js');
const { takeTestDeliveries } = await import('../src/services/emailService.js');
const prisma = (await import('../src/config/database.js')).default;

const email = `planwise.reset.${Date.now()}@example.com`;
const originalPassword = 'Planwise1!';

function enableJsonMail() {
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_FROM = 'PlanWise AI <noreply@example.test>';
  process.env.SMTP_JSON = 'true';
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

function disableMail() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  delete process.env.MAIL_FROM;
  delete process.env.SMTP_JSON;
}

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('password reset email flow', async (t) => {
await t.test('missing SMTP configuration does not claim an email was sent', async () => {
  disableMail();
  await assert.rejects(
    () => forgotPassword(email),
    (error) => error.status === 503 && /not configured/i.test(error.message) && !/reset link was sent/i.test(error.message),
  );
  assert.equal(takeTestDeliveries().length, 0);
});

await t.test('an invalid address is rejected and an unknown address is not revealed', async () => {
  enableJsonMail();
  await assert.rejects(() => forgotPassword('not-an-email'), (error) => error.status === 400);
  const hidden = await forgotPassword('nobody.planwise@example.com');
  assert.match(hidden.message, /If an account exists/);
  assert.equal(takeTestDeliveries().length, 0);
});

await t.test('a configured sender delivers one reset link and the token works only once', async () => {
  enableJsonMail();
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
  const [mail] = takeTestDeliveries();
  assert.equal(mail.to, email);
  assert.match(mail.text, /http:\/\/localhost:5180\/reset-password\?token=/);
  const token = mail.text.match(/token=([a-f0-9]+)/)?.[1];
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
  enableJsonMail();
  await forgotPassword(email);
  const [mail] = takeTestDeliveries();
  const token = mail.text.match(/token=([a-f0-9]+)/)?.[1];
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

await t.test('an SMTP failure does not leave a usable reset token', async () => {
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = '1';
  process.env.SMTP_FROM = 'PlanWise AI <noreply@example.test>';
  delete process.env.SMTP_JSON;
  const before = await prisma.passwordResetToken.count({ where: { user: { email } } });
  await assert.rejects(
    () => forgotPassword(email),
    (error) => error.status === 502 && /could not be sent/i.test(error.message),
  );
  const after = await prisma.passwordResetToken.count({ where: { user: { email }, usedAt: null } });
  assert.equal(after, 0);
  assert.ok(before >= 0);
});
});
