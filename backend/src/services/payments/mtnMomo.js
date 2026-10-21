import crypto from 'node:crypto';
import { AppError } from '../../utils/errors.js';
import { amountMajorUnits } from './msisdn.js';

/**
 * MTN MoMo Collections (Request to Pay) — Zambia.
 * Docs: https://momodeveloper.mtn.com/
 *
 * Required env:
 *   MTN_MOMO_SUBSCRIPTION_KEY
 *   MTN_MOMO_API_USER
 *   MTN_MOMO_API_KEY
 *   MTN_MOMO_TARGET_ENVIRONMENT  (sandbox | mtnzambia)
 *   MTN_MOMO_BASE_URL            (optional override)
 *   MTN_MOMO_CURRENCY            (default EUR in sandbox, ZMW in production)
 *   PUBLIC_API_BASE_URL          (for X-Callback-Url)
 */

function config() {
  const subscriptionKey = String(process.env.MTN_MOMO_SUBSCRIPTION_KEY || '').trim();
  const apiUser = String(process.env.MTN_MOMO_API_USER || '').trim();
  const apiKey = String(process.env.MTN_MOMO_API_KEY || '').trim();
  const targetEnvironment = String(process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox').trim();
  const baseUrl = String(
    process.env.MTN_MOMO_BASE_URL
      || (targetEnvironment === 'sandbox'
        ? 'https://sandbox.momodeveloper.mtn.com'
        : 'https://proxy.momoapi.mtn.com'),
  ).trim().replace(/\/$/, '');
  const currency = String(process.env.MTN_MOMO_CURRENCY || (targetEnvironment === 'sandbox' ? 'EUR' : 'ZMW')).trim();
  return { subscriptionKey, apiUser, apiKey, targetEnvironment, baseUrl, currency };
}

export function mtnConfigured() {
  const c = config();
  return Boolean(c.subscriptionKey && c.apiUser && c.apiKey);
}

export function mtnMissingEnv() {
  const needed = ['MTN_MOMO_SUBSCRIPTION_KEY', 'MTN_MOMO_API_USER', 'MTN_MOMO_API_KEY'];
  return needed.filter((key) => !String(process.env[key] || '').trim());
}

async function getAccessToken() {
  const c = config();
  const basic = Buffer.from(`${c.apiUser}:${c.apiKey}`).toString('base64');
  const response = await fetch(`${c.baseUrl}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': c.subscriptionKey,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new AppError('Could not authenticate with MTN MoMo. Check API credentials.', 502, {
      code: 'mtn_auth_failed',
      status: response.status,
    });
  }
  return body.access_token;
}

export async function initiateMtnCollection({
  amountCents,
  msisdnInternational,
  externalId,
  payerMessage,
  payeeNote,
  callbackUrl,
}) {
  if (!mtnConfigured()) {
    throw new AppError(
      `MTN MoMo is not configured. Set: ${mtnMissingEnv().join(', ')}.`,
      503,
      { code: 'mtn_not_configured', missing: mtnMissingEnv() },
    );
  }
  const c = config();
  const token = await getAccessToken();
  const referenceId = crypto.randomUUID();
  const amount = amountMajorUnits(amountCents);
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Reference-Id': referenceId,
    'X-Target-Environment': c.targetEnvironment,
    'Ocp-Apim-Subscription-Key': c.subscriptionKey,
    'Content-Type': 'application/json',
  };
  if (callbackUrl) headers['X-Callback-Url'] = callbackUrl;

  const response = await fetch(`${c.baseUrl}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount,
      currency: c.currency,
      externalId: String(externalId).slice(0, 64),
      payer: { partyIdType: 'MSISDN', partyId: msisdnInternational },
      payerMessage: String(payerMessage || 'PlanWise subscription').slice(0, 160),
      payeeNote: String(payeeNote || 'PlanWise').slice(0, 160),
    }),
  });

  if (response.status !== 202) {
    const detail = await response.text().catch(() => '');
    throw new AppError(
      'MTN MoMo did not accept the payment request. Approve on your phone only after a successful request.',
      502,
      { code: 'mtn_request_rejected', status: response.status, detail: detail.slice(0, 300) },
    );
  }

  return {
    provider: 'mtn',
    providerRef: referenceId,
    status: 'pending',
    currency: c.currency,
    amount,
  };
}

export async function getMtnCollectionStatus(providerRef) {
  if (!mtnConfigured()) {
    throw new AppError(`MTN MoMo is not configured. Set: ${mtnMissingEnv().join(', ')}.`, 503);
  }
  const c = config();
  const token = await getAccessToken();
  const response = await fetch(
    `${c.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(providerRef)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': c.targetEnvironment,
        'Ocp-Apim-Subscription-Key': c.subscriptionKey,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError('Could not verify MTN MoMo payment status.', 502, {
      code: 'mtn_status_failed',
      status: response.status,
    });
  }
  const raw = String(body.status || '').toUpperCase();
  let status = 'pending';
  if (raw === 'SUCCESSFUL') status = 'paid';
  else if (raw === 'FAILED') status = 'failed';
  else if (raw === 'TIMEOUT' || raw === 'EXPIRED') status = 'expired';
  return {
    provider: 'mtn',
    providerRef,
    status,
    rawStatus: raw,
    amount: body.amount,
    currency: body.currency,
    financialTransactionId: body.financialTransactionId || '',
    reason: body.reason || '',
  };
}
