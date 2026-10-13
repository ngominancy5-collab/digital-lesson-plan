import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = 'test-key';
process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
process.env.NEXUS_LOGIN_TEMPLATE = 'user_created';

const { loginTemplateName, sendNotification, takeCapturedNotifications } = await import('../src/services/nexusService.js');

test('login email uses the saved template and does not include a permanent password or OTP', async () => {
  const chosenPassword = 'PlanwisePermanent1!';
  const result = await sendNotification({
    template: loginTemplateName(),
    to: 'new.lecturer@example.com',
    data: {
      user_name: 'Liah Phiri',
      password: 'http://localhost:5180/reset-password?token=abc123',
    },
  });
  assert.equal(result.status, 'queued');
  const [sent] = takeCapturedNotifications();
  assert.equal(sent.template, 'user_created');
  assert.equal(sent.to, 'new.lecturer@example.com');
  assert.equal(sent.data.user_name, 'Liah Phiri');
  assert.match(sent.data.password, /reset-password\?token=/);
  assert.equal(sent.data.password.includes(chosenPassword), false);
  assert.equal(Object.hasOwn(sent.data, 'otp_code'), false);
});

test('a rejected Nexus response is not treated as success', async () => {
  process.env.NEXUS_CAPTURE = 'false';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 401,
    json: async () => ({ error: 'Invalid or missing API key' }),
  });
  try {
    await assert.rejects(
      () => sendNotification({
        template: 'user_created',
        to: 'new.lecturer@example.com',
        data: { user_name: 'Liah Phiri', password: 'http://localhost:5180/reset-password?token=abc' },
      }),
      (error) => error.code === 'NEXUS_REJECTED' && error.status === 401,
    );
  } finally {
    global.fetch = originalFetch;
    process.env.NEXUS_CAPTURE = 'true';
  }
});
