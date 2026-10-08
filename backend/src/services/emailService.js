import nodemailer from 'nodemailer';

const testDeliveries = [];

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const from = String(process.env.SMTP_FROM || process.env.MAIL_FROM || '').trim();
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

export function emailConfigured() {
  return Boolean(smtpConfig());
}

function useJsonTransport() {
  return process.env.NODE_ENV === 'test' && String(process.env.SMTP_JSON || '').toLowerCase() === 'true';
}

export function takeTestDeliveries() {
  return testDeliveries.splice(0, testDeliveries.length);
}

export async function sendMail({ to, subject, text, html }) {
  const config = smtpConfig();
  if (!config) {
    const error = new Error('Email delivery is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const transport = useJsonTransport()
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
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

  if (useJsonTransport()) {
    testDeliveries.push({ to, subject, text, html });
  }
  return { messageId: info?.messageId || '' };
}
