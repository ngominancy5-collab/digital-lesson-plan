import { emailConfigured, sendMail } from './emailService.js';

export function passwordChangedTemplateName() {
  return String(process.env.NEXUS_PASSWORD_CHANGED_TEMPLATE || 'password_changed').trim();
}

export function passwordChangedMail(name) {
  const greeting = String(name || '').trim() || 'there';
  const subject = 'Your Password Has Been Changed';
  const text = [
    `Hello ${greeting},`,
    '',
    'This is a security notification to inform you that the password for your account has been successfully changed.',
    '',
    'If you made this change, no further action is required.',
    '',
    'If you did not change your password, please contact your system administrator immediately.',
    '',
    'For your security, this email does not contain your password.',
    '',
    'Regards,',
    'HRMS Administration',
  ].join('\n');
  const html = [
    `<p>Hello ${escapeHtml(greeting)},</p>`,
    '<p>This is a security notification to inform you that the password for your account has been successfully changed.</p>',
    '<p>If you made this change, no further action is required.</p>',
    '<p>If you did not change your password, please contact your system administrator immediately.</p>',
    '<p>For your security, this email does not contain your password.</p>',
    '<p>Regards,<br>HRMS Administration</p>',
  ].join('');
  return { subject, text, html };
}

export function passwordChangedTemplateData(name) {
  return { user_name: String(name || '').trim() || 'there' };
}

export function accountCreatedTemplateName() {
  return String(process.env.NEXUS_ACCOUNT_CREATED_TEMPLATE || 'account_created').trim();
}

export function accountCreatedMail(name) {
  const greeting = String(name || '').trim() || 'there';
  const subject = 'Welcome to PlanWise AI — Your Account Is Successfully Created';
  const text = [
    `Hello ${greeting},`,
    '',
    'Congratulations! Your PlanWise AI account has been successfully created, and you now have access to your dashboard.',
    '',
    "You can now start exploring PlanWise AI's features and tools to support your teaching and lesson-planning activities.",
    '',
    'Thank you for joining PlanWise AI.',
    '',
    'Best regards,',
    'The PlanWise AI Team',
  ].join('\n');
  const html = [
    `<p>Hello ${escapeHtml(greeting)},</p>`,
    '<p>Congratulations! Your PlanWise AI account has been successfully created, and you now have access to your dashboard.</p>',
    "<p>You can now start exploring PlanWise AI's features and tools to support your teaching and lesson-planning activities.</p>",
    '<p>Thank you for joining PlanWise AI.</p>',
    '<p>Best regards,<br>The PlanWise AI Team</p>',
  ].join('');
  return { subject, text, html };
}

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
  const templateName = String(template || '').trim();
  if (templateName === passwordChangedTemplateName() || templateName === 'password_changed') {
    return passwordChangedMail(name);
  }
  if (templateName === accountCreatedTemplateName() || templateName === 'account_created') {
    return accountCreatedMail(name);
  }
  const secret = String(payload.password || '').trim();
  const loginUrl = String(payload.login_url || payload.loginUrl || '').trim();
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
    `An administrator approved your ${appName} account.`,
    `Username: ${name}`,
    `Temporary password: ${secret}`,
    loginUrl ? `Sign in here: ${loginUrl}` : 'Sign in to PlanWise AI and choose a new password.',
    '',
    'You must choose a new password the first time you sign in.',
  ].join('\n');
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p>An administrator approved your ${appName} account.</p>`,
    `<p>Username: <strong>${escapeHtml(name)}</strong><br>Temporary password: <strong>${escapeHtml(secret)}</strong></p>`,
    loginUrl
      ? `<p><a href="${escapeHtml(loginUrl)}">Sign in to PlanWise AI</a></p><p>If the button does not work, paste this link into your browser:<br>${escapeHtml(loginUrl)}</p>`
      : '<p>Sign in to PlanWise AI and choose a new password.</p>',
    '<p>You must choose a new password the first time you sign in.</p>',
  ].join('');
  return { subject, text, html };
}

export function loginTemplateName() {
  return String(
    process.env.NEXUS_ACCOUNT_SETUP_TEMPLATE
      || process.env.NEXUS_LOGIN_TEMPLATE
      || 'Planwise Ai Login credentials',
  ).trim();
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

async function sendViaHttpEmail({ template, to, data }) {
  if (!emailConfigured()) {
    const error = new Error('HTTP email is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  const { subject, text, html } = renderEmail({ template, data });
  try {
    const info = await sendMail({ to, subject, text, html });
    return { id: info.messageId || '', requestId: '', status: 'delivered', provider: 'mailjet' };
  } catch (error) {
    console.error('Email delivery failed.', error.code || error.message || 'failed');
    const wrapped = new Error('The email could not be sent.');
    wrapped.code = 'EMAIL_SEND_FAILED';
    throw wrapped;
  }
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
      return sendViaHttpEmail(payload);
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
    console.error('Nexus notification request failed.', error.code || error.message || 'NETWORK');
    if (emailConfigured()) {
      console.error('Falling back to HTTP email provider after Nexus network failure.');
      return sendViaHttpEmail(payload);
    }
    const wrapped = new Error('Nexus could not be reached.');
    wrapped.code = 'NEXUS_NETWORK';
    throw wrapped;
  }

  const raw = await response.text().catch(() => '');
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw: raw.slice(0, 500) };
  }

  if (response.status !== 202) {
    const detail = body.error || body.message || body.ErrorMessage || raw.slice(0, 300) || 'rejected';
    console.error('Nexus rejected the notification.', response.status, detail);
    if (emailConfigured()) {
      console.error('Falling back to HTTP email provider after Nexus rejection.');
      try {
        return await sendViaHttpEmail(payload);
      } catch (fallbackError) {
        console.error('HTTP email fallback also failed.', fallbackError.code || fallbackError.message || 'failed');
      }
    }
    const wrapped = new Error(`Nexus did not accept the notification (${response.status}): ${detail}`);
    wrapped.code = 'NEXUS_REJECTED';
    wrapped.status = response.status;
    throw wrapped;
  }

  const accepted = {
    id: body.id,
    requestId: body.request_id || String(body.id || ''),
    status: body.status || 'queued',
    provider: 'nexus',
  };
  console.info('Nexus accepted notification.', accepted.requestId || 'queued');

  // Nexus returns 202 before rendering. Poll briefly so missing templates
  // fall through to the HTTP email provider instead of a silent inbox miss.
  const delivery = await waitForNexusDelivery(accepted.requestId || accepted.id);
  if (delivery && isFailedDelivery(delivery.status)) {
    console.error(
      'Nexus delivery failed after accept.',
      delivery.status,
      delivery.errorMessage || delivery.template || 'unknown',
    );
    if (emailConfigured()) {
      console.error('Falling back to HTTP email provider after Nexus delivery failure.');
      return sendViaHttpEmail(payload);
    }
    const wrapped = new Error(
      `Nexus accepted the notification but could not deliver it: ${delivery.errorMessage || delivery.status}`,
    );
    wrapped.code = 'NEXUS_DELIVERY_FAILED';
    throw wrapped;
  }
  if (delivery?.status) accepted.status = delivery.status;
  return accepted;
}

function isFailedDelivery(status) {
  const value = String(status || '').trim().toLowerCase();
  return value === 'failed' || value === 'error' || value === 'rejected';
}

async function waitForNexusDelivery(requestId, { attempts = 6, delayMs = 400 } = {}) {
  const id = String(requestId || '').trim();
  if (!id) return null;
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      last = await getNotificationStatus(id);
      const status = String(last.status || '').trim().toLowerCase();
      if (!status || status === 'queued' || status === 'pending' || status === 'processing') {
        await sleep(delayMs);
        continue;
      }
      return last;
    } catch (error) {
      console.error('Nexus status poll failed.', error.message || error.code || 'failed');
      await sleep(delayMs);
    }
  }
  return last;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
