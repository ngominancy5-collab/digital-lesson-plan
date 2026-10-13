import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SMTP_FROM = 'PlanWise AI <sender@example.com>';
delete process.env.EMAIL_HTTP_FROM;
delete process.env.NODE_ENV;
delete process.env.SMTP_JSON;

const { sendMail, emailConfigured } = await import('../src/services/emailService.js');
const { sendNotification } = await import('../src/services/nexusService.js');

const message = { to: 'user@example.com', subject: 'Hi', text: 'plain', html: '<p>plain</p>' };

function stubFetch(response) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: async () => response.raw ?? JSON.stringify(response.json || {}),
      headers: { get: (name) => (response.headers || {})[name.toLowerCase()] || null },
    };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

function clearHttpEnv() {
  delete process.env.EMAIL_HTTP_PROVIDER;
  delete process.env.EMAIL_HTTP_API_KEY;
  delete process.env.SMTP_HOST;
}

test('emailConfigured is false without SMTP or an HTTP provider', () => {
  clearHttpEnv();
  assert.equal(emailConfigured(), false);
});

test('resend posts to the emails endpoint with a bearer token', async () => {
  clearHttpEnv();
  process.env.EMAIL_HTTP_PROVIDER = 'resend';
  process.env.EMAIL_HTTP_API_KEY = 'rs-key';
  assert.equal(emailConfigured(), true);
  const { calls, restore } = stubFetch({ json: { id: 're_123' } });
  try {
    const info = await sendMail(message);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer rs-key');
    assert.deepEqual(calls[0].body.to, ['user@example.com']);
    assert.equal(calls[0].body.from, 'PlanWise AI <sender@example.com>');
    assert.equal(info.messageId, 're_123');
  } finally {
    restore();
  }
});

test('brevo posts sender/to/textContent/htmlContent with an api-key header', async () => {
  clearHttpEnv();
  process.env.EMAIL_HTTP_PROVIDER = 'brevo';
  process.env.EMAIL_HTTP_API_KEY = 'brevo-key';
  const { calls, restore } = stubFetch({ json: { messageId: 'b-1' } });
  try {
    const info = await sendMail(message);
    assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(calls[0].options.headers['api-key'], 'brevo-key');
    assert.equal(calls[0].body.sender.email, 'sender@example.com');
    assert.equal(calls[0].body.sender.name, 'PlanWise AI');
    assert.deepEqual(calls[0].body.to, [{ email: 'user@example.com' }]);
    assert.equal(calls[0].body.textContent, 'plain');
    assert.equal(info.messageId, 'b-1');
  } finally {
    restore();
  }
});

test('sendgrid posts personalizations and content parts', async () => {
  clearHttpEnv();
  process.env.EMAIL_HTTP_PROVIDER = 'sendgrid';
  process.env.EMAIL_HTTP_API_KEY = 'sg-key';
  const { calls, restore } = stubFetch({ status: 202, raw: '' });
  try {
    await sendMail(message);
    assert.equal(calls[0].url, 'https://api.sendgrid.com/v3/mail/send');
    assert.equal(calls[0].body.personalizations[0].to[0].email, 'user@example.com');
    assert.equal(calls[0].body.from.email, 'sender@example.com');
    assert.deepEqual(calls[0].body.content.map((c) => c.type), ['text/plain', 'text/html']);
  } finally {
    restore();
  }
});

test('mailjet splits APIKey:SecretKey into basic auth', async () => {
  clearHttpEnv();
  process.env.EMAIL_HTTP_PROVIDER = 'mailjet';
  process.env.EMAIL_HTTP_API_KEY = 'mj-key:mj-secret';
  const { calls, restore } = stubFetch({ json: {} });
  try {
    await sendMail(message);
    const expected = `Basic ${Buffer.from('mj-key:mj-secret').toString('base64')}`;
    assert.equal(calls[0].url, 'https://api.mailjet.com/v3.1/send');
    assert.equal(calls[0].options.headers.Authorization, expected);
    assert.equal(calls[0].body.Messages[0].From.Email, 'sender@example.com');
  } finally {
    restore();
  }
});

test('a non-2xx provider response throws EMAIL_SEND_FAILED', async () => {
  clearHttpEnv();
  process.env.EMAIL_HTTP_PROVIDER = 'resend';
  process.env.EMAIL_HTTP_API_KEY = 'rs-key';
  const { restore } = stubFetch({ ok: false, status: 422, raw: '{"message":"nope"}' });
  try {
    await assert.rejects(() => sendMail(message), (error) => error.code === 'EMAIL_SEND_FAILED' && error.status === 422);
  } finally {
    restore();
  }
});

test('sendNotification renders a reset link and sends it over HTTP when Nexus is unset', async () => {
  clearHttpEnv();
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_CAPTURE;
  process.env.EMAIL_HTTP_PROVIDER = 'resend';
  process.env.EMAIL_HTTP_API_KEY = 'rs-key';
  const { calls, restore } = stubFetch({ json: { id: 're_9' } });
  try {
    const result = await sendNotification({
      template: 'password_reset',
      to: 'user@example.com',
      data: { user_name: 'Ada', password: 'https://app.example.com/reset-password?token=abc123' },
    });
    assert.equal(result.status, 'delivered');
    assert.equal(calls[0].body.subject, 'Reset your PlanWise AI password');
    assert.match(calls[0].body.text, /reset your password/);
    assert.match(calls[0].body.html, /reset-password\?token=abc123/);
  } finally {
    restore();
  }
});

test.after(() => {
  clearHttpEnv();
  delete process.env.SMTP_FROM;
});
