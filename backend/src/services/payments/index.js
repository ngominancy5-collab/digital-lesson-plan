import { airtelConfigured, airtelMissingEnv, getAirtelCollectionStatus, initiateAirtelCollection } from './airtelMoney.js';
import { getMtnCollectionStatus, initiateMtnCollection, mtnConfigured, mtnMissingEnv } from './mtnMomo.js';
import { normalizeZmMsisdn } from './msisdn.js';

export function listPaymentMethods() {
  return [
    {
      id: 'airtel',
      name: 'Airtel Money',
      brand: 'airtel',
      configured: airtelConfigured(),
      missingEnv: airtelMissingEnv(),
    },
    {
      id: 'mtn',
      name: 'MTN MoMo',
      brand: 'mtn',
      configured: mtnConfigured(),
      missingEnv: mtnMissingEnv(),
    },
  ];
}

export function publicApiBase() {
  return String(process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`)
    .trim()
    .replace(/\/$/, '');
}

export {
  normalizeZmMsisdn,
  airtelConfigured,
  mtnConfigured,
  initiateAirtelCollection,
  initiateMtnCollection,
  getAirtelCollectionStatus,
  getMtnCollectionStatus,
};
