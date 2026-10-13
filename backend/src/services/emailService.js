// HTTP-based transactional email. Render's free plan blocks outbound SMTP
// (ports 25/465/587), so we send over HTTPS (443) via a provider REST API.
//
// Supported providers (set EMAIL_HTTP_PROVIDER, default "mailjet"):
//   mailjet  -> MAILJET_API_KEY + MAILJET_API_SECRET (Basic auth)
//   brevo    -> BREVO_API_KEY (api-key header)
//
// Sender address comes from EMAIL_FROM (e.g. "PlanWise AI <you@example.com>").
// If nothing is configured, emailConfigured() is false and the API keeps its
// in-UI fallback (showing setup/reset links and the temporary password).

function fromAddress() {
  return String(
    process.env.EMAIL_FROM
    || process.env.EMAIL_HTTP_FROM
    || process.env.SMTP_FROM
    || process.env.MAIL_FROM
    || '',
  ).trim();
}

export function parseFrom(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*)<([^<>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: '', email: text };
}

function mailjetCredentials() {
  const key = String(process.env.MAILJET_API_KEY || '').trim();
  const secret = String(process.env.MAILJET_API_SECRET || '').trim();
  if (key && secret) return { key, secret };
  const combo = String(process.env.EMAIL_HTTP_API_KEY || '').trim();
  const index = combo.indexOf(':');
  if (index > 0) {
    const publicKey = combo.slice(0, index).trim();
    const secretKey = combo.slice(index + 1).trim();
    if (publicKey && secretKey) return { key: publicKey, secret: secretKey };
  }
  return null;
}

function brevoKey() {
  return String(process.env.BREVO_API_KEY || process.env.EMAIL_HTTP_API_KEY || '').trim();
}

function provider() {
  return String(process.env.EMAIL_HTTP_PROVIDER || 'mailjet').trim().toLowerCase();
}

export function emailConfigured() {
  if (!fromAddress()) return false;
  if (provider() === 'brevo') return Boolean(brevoKey());
  return Boolean(mailjetCredentials());
}

export function buildEmailRequest({ to, subject, text, html }) {
  const sender = parseFrom(fromAddress());
  if (provider() === 'brevo') {
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: { accept: 'application/json', 'api-key': brevoKey(), 'content-type': 'application/json' },
      body: {
        sender: { email: sender.email, name: sender.name || undefined },
        to: [{ email: to }],
        subject,
        textContent: text || '',
        htmlContent: html || '',
      },
    };
  }
  const creds = mailjetCredentials() || { key: '', secret: '' };
  return {
    url: 'https://api.mailjet.com/v3.1/send',
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.key}:${creds.secret}`).toString('base64')}`,
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

export async function sendMail({ to, subject, text, html }) {
  if (!emailConfigured()) {
    const error = new Error('Email delivery is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const { url, headers, body } = buildEmailRequest({ to, subject, text, html });
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    const error = new Error('Email delivery failed.');
    error.code = 'EMAIL_NETWORK';
    throw error;
  }

  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    console.error('Email provider rejected the message.', provider(), response.status, raw.slice(0, 300));
    const error = new Error('Email delivery failed.');
    error.code = 'EMAIL_SEND_FAILED';
    error.status = response.status;
    throw error;
  }

  let messageId = '';
  try {
    const parsed = JSON.parse(raw);
    messageId = parsed?.Messages?.[0]?.To?.[0]?.MessageID
      || parsed?.messageId
      || '';
  } catch {
    messageId = '';
  }
  return { messageId: messageId || '' };
}

// Best-effort send: never throws, so account flows still succeed and the UI
// fallback keeps working when email is not configured or a provider fails.
export async function trySendMail(message) {
  if (!emailConfigured()) return { sent: false, reason: 'not-configured' };
  try {
    await sendMail(message);
    return { sent: true };
  } catch (error) {
    console.error('Email send failed:', error.code || error.message);
    return { sent: false, reason: 'failed' };
  }
}
