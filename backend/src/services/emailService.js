import nodemailer from 'nodemailer';

const testDeliveries = [];

const HTTP_PROVIDERS = new Set(['resend', 'brevo', 'sendgrid', 'mailjet']);

function fromAddress() {
  return String(process.env.EMAIL_HTTP_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || '').trim();
}

function parseFrom(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*)<([^<>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: '', email: text };
}

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const from = fromAddress();
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = String(process.env.SMTP_USER || '').trim();
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    from,
    auth: user ? { user, pass: String(process.env.SMTP_PASS || '') } : undefined,
    requireTLS: !secure && String(process.env.SMTP_REQUIRE_TLS || 'true').toLowerCase() !== 'false',
  };
}

function httpConfig() {
  const provider = String(process.env.EMAIL_HTTP_PROVIDER || '').trim().toLowerCase();
  const apiKey = String(process.env.EMAIL_HTTP_API_KEY || '').trim();
  const from = fromAddress();
  if (!provider || !apiKey || !from || !HTTP_PROVIDERS.has(provider)) return null;
  return { provider, apiKey, from };
}

export function emailConfigured() {
  return Boolean(httpConfig() || smtpConfig());
}

function useJsonTransport() {
  return process.env.NODE_ENV === 'test' && String(process.env.SMTP_JSON || '').toLowerCase() === 'true';
}

export function takeTestDeliveries() {
  return testDeliveries.splice(0, testDeliveries.length);
}

function buildHttpRequest({ provider, apiKey, from }, { to, subject, text, html }) {
  const sender = parseFrom(from);
  if (provider === 'resend') {
    return {
      url: 'https://api.resend.com/emails',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: { from, to: [to], subject, text, html },
    };
  }
  if (provider === 'brevo') {
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: {
        sender: { email: sender.email, name: sender.name || undefined },
        to: [{ email: to }],
        subject,
        textContent: text || '',
        htmlContent: html || '',
      },
    };
  }
  if (provider === 'sendgrid') {
    return {
      url: 'https://api.sendgrid.com/v3/mail/send',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: sender.email, name: sender.name || undefined },
        subject,
        content: [
          { type: 'text/plain', value: text || '' },
          { type: 'text/html', value: html || '' },
        ],
      },
    };
  }
  const [user, pass] = apiKey.split(':');
  return {
    url: 'https://api.mailjet.com/v3.1/send',
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${pass || ''}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: {
      Messages: [{
        From: { Email: sender.email, Name: sender.name || undefined },
        To: [{ Email: to }],
        Subject: subject,
        TextPart: text || '',
        HTMLPart: html || '',
      }],
    },
  };
}

async function sendViaHttp(config, message) {
  const request = buildHttpRequest(config, message);
  let response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
  } catch (error) {
    const wrapped = new Error('Email delivery failed.');
    wrapped.code = error.code || 'EMAIL_NETWORK';
    throw wrapped;
  }

  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    console.error('HTTP email provider rejected the message.', config.provider, response.status, raw.slice(0, 300));
    const wrapped = new Error('Email delivery failed.');
    wrapped.code = 'EMAIL_SEND_FAILED';
    wrapped.status = response.status;
    throw wrapped;
  }

  let messageId = '';
  try {
    const parsed = JSON.parse(raw);
    messageId = parsed?.id || parsed?.messageId || '';
  } catch {
    messageId = '';
  }
  return { messageId: messageId || response.headers?.get?.('x-message-id') || '' };
}

export async function sendMail({ to, subject, text, html }) {
  if (useJsonTransport()) {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const info = await transport.sendMail({
      from: fromAddress() || 'no-reply@planwise.local',
      to,
      subject,
      text,
      html,
    });
    testDeliveries.push({ to, subject, text, html });
    return { messageId: info?.messageId || '' };
  }

  const http = httpConfig();
  if (http) return sendViaHttp(http, { to, subject, text, html });

  const config = smtpConfig();
  if (!config) {
    const error = new Error('Email delivery is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    requireTLS: config.requireTLS,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  let info;
  try {
    info = await transport.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    const wrapped = new Error('Email delivery failed.');
    wrapped.code = error.code || 'EMAIL_SEND_FAILED';
    throw wrapped;
  }

  return { messageId: info?.messageId || '' };
}
