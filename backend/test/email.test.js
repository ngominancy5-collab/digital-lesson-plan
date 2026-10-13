import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { emailConfigured, buildEmailRequest, sendMail, parseFrom } = await import('../src/services/emailService.js');

const SAVED = { ...process.env };
function restore() {
  for (const key of ['MAILJET_API_KEY', 'MAILJET_API_SECRET', 'BREVO_API_KEY', 'EMAIL_HTTP_API_KEY', 'EMAIL_HTTP_PROVIDER', 'EMAIL_FROM']) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
}

test('parseFrom handles a name and a bare address', () => {
  assert.deepEqual(parseFrom('PlanWise AI <you@example.com>'), { name: 'PlanWise AI', email: 'you@example.com' });
  assert.deepEqual(parseFrom('you@example.com'), { name: '', email: 'you@example.com' });
});

test('email is not configured without keys or a sender', () => {
  delete process.env.MAILJET_API_KEY;
  delete process.env.MAILJET_API_SECRET;
  delete process.env.BREVO_API_KEY;
  delete process.env.EMAIL_HTTP_API_KEY;
  delete process.env.EMAIL_FROM;
  assert.equal(emailConfigured(), false);
  restore();
});

test('mailjet request is built with Basic auth and a Messages payload', () => {
  process.env.MAILJET_API_KEY = 'public123';
  process.env.MAILJET_API_SECRET = 'secret456';
  delete process.env.EMAIL_HTTP_API_KEY;
  process.env.EMAIL_FROM = 'PlanWise AI <you@example.com>';
  delete process.env.EMAIL_HTTP_PROVIDER;

  assert.equal(emailConfigured(), true);
  const request = buildEmailRequest({ to: 'student@example.com', subject: 'Hi', text: 'plain', html: '<b>hi</b>' });
  assert.equal(request.url, 'https://api.mailjet.com/v3.1/send');
  assert.equal(request.headers.Authorization, `Basic ${Buffer.from('public123:secret456').toString('base64')}`);
  assert.deepEqual(request.body.Messages[0].From, { Email: 'you@example.com', Name: 'PlanWise AI' });
  assert.equal(request.body.Messages[0].To[0].Email, 'student@example.com');
  assert.equal(request.body.Messages[0].TextPart, 'plain');
  restore();
});

test('brevo request uses the api-key header when selected', () => {
  process.env.EMAIL_HTTP_PROVIDER = 'brevo';
  process.env.BREVO_API_KEY = 'brevo-key';
  process.env.EMAIL_FROM = 'you@example.com';
  const request = buildEmailRequest({ to: 'x@example.com', subject: 'S', text: 't', html: 'h' });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.headers['api-key'], 'brevo-key');
  assert.equal(request.body.sender.email, 'you@example.com');
  restore();
});

test('sendMail rejects when unconfigured', async () => {
  delete process.env.MAILJET_API_KEY;
  delete process.env.MAILJET_API_SECRET;
  delete process.env.EMAIL_FROM;
  await assert.rejects(() => sendMail({ to: 'a@b.com', subject: 's', text: 't' }), (error) => error.code === 'EMAIL_NOT_CONFIGURED');
  restore();
});
