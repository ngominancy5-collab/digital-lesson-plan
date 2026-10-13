const captured = [];

function nexusConfig() {
  const apiKey = String(process.env.NEXUS_API_KEY || '').trim();
  const baseUrl = String(process.env.NEXUS_BASE_URL || '').trim().replace(/\/$/, '');
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl };
}

export function nexusConfigured() {
  return Boolean(nexusConfig());
}

export function loginTemplateName() {
  return String(process.env.NEXUS_ACCOUNT_SETUP_TEMPLATE || process.env.NEXUS_LOGIN_TEMPLATE || 'user_created').trim();
}

export function resetTemplateName() {
  return String(process.env.NEXUS_PASSWORD_RESET_TEMPLATE || 'password_reset').trim();
}

export function takeCapturedNotifications() {
  return captured.splice(0, captured.length);
}

function captureOnly() {
  return process.env.NODE_ENV === 'test' && String(process.env.NEXUS_CAPTURE || '').toLowerCase() === 'true';
}

export async function sendNotification({ template, to, data }) {
  const config = nexusConfig();
  if (!config && !captureOnly()) {
    const error = new Error('Nexus email is not configured.');
    error.code = 'NEXUS_NOT_CONFIGURED';
    throw error;
  }

  const payload = {
    template: String(template || '').trim(),
    to: String(to || '').trim(),
    data: data || {},
  };

  if (captureOnly()) {
    captured.push(payload);
    return { requestId: 'test-request', status: 'queued' };
  }

  let response;
  try {
    response = await fetch(`${config.baseUrl}/notifications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Nexus notification request failed.', error.code || 'NETWORK');
    const wrapped = new Error('Nexus could not be reached.');
    wrapped.code = 'NEXUS_NETWORK';
    throw wrapped;
  }

  const body = await response.json().catch(() => ({}));
  if (response.status !== 202) {
    console.error('Nexus rejected the notification.', response.status, body.error || body.message || 'rejected');
    const wrapped = new Error('Nexus did not accept the notification.');
    wrapped.code = 'NEXUS_REJECTED';
    wrapped.status = response.status;
    throw wrapped;
  }

  return {
    id: body.id,
    requestId: body.request_id || '',
    status: body.status || 'queued',
  };
}

export async function getNotificationStatus(requestId) {
  const config = nexusConfig();
  if (!config) {
    const error = new Error('Nexus email is not configured.');
    error.code = 'NEXUS_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(`${config.baseUrl}/notifications/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Nexus status lookup failed.', response.status, body.error || 'failed');
    const error = new Error('Could not read the Nexus delivery status.');
    error.status = response.status;
    throw error;
  }
  return {
    id: body.id,
    status: body.status || '',
    errorMessage: body.error_message || '',
    template: body.template || '',
  };
}
