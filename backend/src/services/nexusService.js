import { emailConfigured, sendMail } from './emailService.js';

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

export function emailDeliveryConfigured() {
  return nexusConfigured() || emailConfigured();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmail({ template, data }) {
  const payload = data || {};
  const name = String(payload.user_name || payload.name || '').trim() || 'there';
  const secret = String(payload.password || '').trim();
  const appName = 'PlanWise AI';
  const isReset = String(template || '').trim() === resetTemplateName();
  const isLink = /^https?:\/\//i.test(secret);

  if (isLink) {
    const purpose = isReset ? 'reset your password' : 'set up your account';
    const subject = isReset ? `Reset your ${appName} password` : `Set up your ${appName} account`;
    const cta = isReset ? 'Choose a new password' : 'Set your password';
    const text = [
      `Hello ${name},`,
      '',
      `Use the link below to ${purpose}. The link expires in 1 hour.`,
      '',
      secret,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n');
    const html = [
      `<p>Hello ${escapeHtml(name)},</p>`,
      `<p>Use the button below to ${purpose}. The link expires in 1 hour.</p>`,
      `<p><a href="${escapeHtml(secret)}">${cta}</a></p>`,
      `<p>If the button does not work, paste this link into your browser:<br>${escapeHtml(secret)}</p>`,
      '<p>If you did not request this, you can ignore this email.</p>',
    ].join('');
    return { subject, text, html };
  }

  const subject = `Your ${appName} access`;
  const text = [
    `Hello ${name},`,
    '',
    `An administrator created your ${appName} account.`,
    `Temporary password: ${secret}`,
    '',
    'Sign in and choose a new password.',
  ].join('\n');
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p>An administrator created your ${appName} account.</p>`,
    `<p>Temporary password: <strong>${escapeHtml(secret)}</strong></p>`,
    '<p>Sign in and choose a new password.</p>',
  ].join('');
  return { subject, text, html };
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

  const payload = {
    template: String(template || '').trim(),
    to: String(to || '').trim(),
    data: data || {},
  };

  if (captureOnly()) {
    captured.push(payload);
    return { requestId: 'test-request', status: 'queued' };
  }

  if (!config) {
    if (emailConfigured()) {
      const { subject, text, html } = renderEmail({ template: payload.template, data: payload.data });
      try {
        const info = await sendMail({ to: payload.to, subject, text, html });
        return { id: info.messageId || '', requestId: '', status: 'delivered' };
      } catch (error) {
        console.error('SMTP delivery failed.', error.code || 'failed');
        const wrapped = new Error('The email could not be sent.');
        wrapped.code = 'EMAIL_SEND_FAILED';
        throw wrapped;
      }
    }
    const error = new Error('Nexus email is not configured.');
    error.code = 'NEXUS_NOT_CONFIGURED';
    throw error;
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
    if (emailConfigured()) return { status: 'delivered', errorMessage: '' };
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
