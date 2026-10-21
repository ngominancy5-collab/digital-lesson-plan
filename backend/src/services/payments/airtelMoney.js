import crypto from 'node:crypto';
import { AppError } from '../../utils/errors.js';
import { amountMajorUnits } from './msisdn.js';

/**
 * Airtel Money Collections API — Zambia.
 * Docs: https://developers.airtel.africa/
 *
 * Required env:
 *   AIRTEL_MONEY_CLIENT_ID
 *   AIRTEL_MONEY_CLIENT_SECRET
 *   AIRTEL_MONEY_MODE           (sandbox | live)
 *   AIRTEL_MONEY_BASE_URL       (optional)
 *   AIRTEL_MONEY_COUNTRY        (default ZM)
 *   AIRTEL_MONEY_CURRENCY       (default ZMW)
 */

function config() {
  const clientId = String(process.env.AIRTEL_MONEY_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.AIRTEL_MONEY_CLIENT_SECRET || '').trim();
  const mode = String(process.env.AIRTEL_MONEY_MODE || 'sandbox').trim().toLowerCase();
  const baseUrl = String(
    process.env.AIRTEL_MONEY_BASE_URL
      || (mode === 'live' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa'),
  ).trim().replace(/\/$/, '');
  const country = String(process.env.AIRTEL_MONEY_COUNTRY || 'ZM').trim();
  const currency = String(process.env.AIRTEL_MONEY_CURRENCY || 'ZMW').trim();
  return { clientId, clientSecret, mode, baseUrl, country, currency };
}

export function airtelConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret);
}

export function airtelMissingEnv() {
  const needed = ['AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET'];
  return needed.filter((key) => !String(process.env[key] || '').trim());
}

async function getAccessToken() {
  const c = config();
  const response = await fetch(`${c.baseUrl}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const body = await response.json().catch(() => ({}));
  const token = body.access_token || body.token?.access_token;
  if (!response.ok || !token) {
    // Some Airtel environments use client_secret_key grant type.
    const retry = await fetch(`${c.baseUrl}/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        grant_type: 'client_secret_key',
      }),
    });
    const retryBody = await retry.json().catch(() => ({}));
    const retryToken = retryBody.access_token || retryBody.token?.access_token;
    if (!retry.ok || !retryToken) {
      throw new AppError('Could not authenticate with Airtel Money. Check API credentials.', 502, {
        code: 'airtel_auth_failed',
        status: response.status,
      });
    }
    return retryToken;
  }
  return token;
}

export async function initiateAirtelCollection({
  amountCents,
  msisdnLocal,
  transactionId,
  reference,
}) {
  if (!airtelConfigured()) {
    throw new AppError(
      `Airtel Money is not configured. Set: ${airtelMissingEnv().join(', ')}.`,
      503,
      { code: 'airtel_not_configured', missing: airtelMissingEnv() },
    );
  }
  const c = config();
  const token = await getAccessToken();
  const id = String(transactionId || crypto.randomUUID()).slice(0, 50);
  const amount = amountMajorUnits(amountCents);

  const response = await fetch(`${c.baseUrl}/merchant/v1/payments/`, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Country': c.country,
      'X-Currency': c.currency,
    },
    body: JSON.stringify({
      reference: String(reference || 'PlanWise subscription').slice(0, 25),
      subscriber: {
        country: c.country,
        currency: c.currency,
        msisdn: msisdnLocal,
      },
      transaction: {
        amount,
        country: c.country,
        currency: c.currency,
        id,
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  const ok = response.ok && (body.status?.success === true || body.status?.code === '200' || body.data);
  if (!ok && response.status >= 400) {
    throw new AppError(
      body.status?.message || 'Airtel Money did not accept the payment request.',
      502,
      { code: 'airtel_request_rejected', status: response.status, body },
    );
  }

  const airtelId = body.data?.transaction?.id || body.data?.transaction?.airtel_money_id || id;
  return {
    provider: 'airtel',
    providerRef: String(airtelId),
    merchantTransactionId: id,
    status: 'pending',
    currency: c.currency,
    amount,
    raw: body,
  };
}

export async function getAirtelCollectionStatus(merchantTransactionId) {
  if (!airtelConfigured()) {
    throw new AppError(`Airtel Money is not configured. Set: ${airtelMissingEnv().join(', ')}.`, 503);
  }
  const c = config();
  const token = await getAccessToken();
  const response = await fetch(
    `${c.baseUrl}/standard/v1/payments/${encodeURIComponent(merchantTransactionId)}`,
    {
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${token}`,
        'X-Country': c.country,
        'X-Currency': c.currency,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError('Could not verify Airtel Money payment status.', 502, {
      code: 'airtel_status_failed',
      status: response.status,
    });
  }
  const txnStatus = String(
    body.data?.transaction?.status
      || body.data?.status
      || body.status?.response_code
      || '',
  ).toUpperCase();
  let status = 'pending';
  if (['TS', 'SUCCESS', 'SUCCESSFUL', 'TIP'].includes(txnStatus) || txnStatus.includes('SUCCESS')) {
    status = 'paid';
  } else if (['TF', 'FAILED', 'FAILURE'].includes(txnStatus) || txnStatus.includes('FAIL')) {
    status = 'failed';
  } else if (['TE', 'EXPIRED', 'TIMEOUT'].includes(txnStatus)) {
    status = 'expired';
  }
  return {
    provider: 'airtel',
    providerRef: String(body.data?.transaction?.airtel_money_id || merchantTransactionId),
    merchantTransactionId,
    status,
    rawStatus: txnStatus,
    amount: body.data?.transaction?.amount,
    currency: body.data?.transaction?.currency || c.currency,
    reason: body.status?.message || '',
    raw: body,
  };
}
