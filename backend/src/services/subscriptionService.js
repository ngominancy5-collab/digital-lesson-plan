import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { recordActivity } from './activityService.js';
import * as subscriptionRepository from '../repositories/subscriptionRepository.js';

const DEFAULT_CURRENCY = 'ZMW';

const DEFAULT_PLANS = [
  {
    code: 'free',
    name: 'Free',
    description: 'Essential teaching tools with monthly usage limits.',
    interval: 'none',
    priceCents: 0,
    currency: DEFAULT_CURRENCY,
    aiPromptLimit: 25,
    uploadLimit: 10,
    sortOrder: 0,
  },
  {
    code: 'pro_monthly',
    name: 'Pro Monthly',
    description: 'Higher AI and upload limits, billed every month.',
    interval: 'monthly',
    priceCents: 49900, // K499.00
    currency: DEFAULT_CURRENCY,
    aiPromptLimit: 500,
    uploadLimit: 200,
    sortOrder: 1,
  },
  {
    code: 'pro_yearly',
    name: 'Pro Yearly',
    description: 'Best value Pro plan, billed once per year.',
    interval: 'yearly',
    priceCents: 499000, // K4,990.00
    currency: DEFAULT_CURRENCY,
    aiPromptLimit: 500,
    uploadLimit: 200,
    sortOrder: 2,
  },
];

function periodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mapPlan(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    interval: plan.interval,
    priceCents: plan.priceCents,
    currency: plan.currency,
    aiPromptLimit: plan.aiPromptLimit,
    uploadLimit: plan.uploadLimit,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

export async function ensureDefaultPlans() {
  for (const plan of DEFAULT_PLANS) {
    await subscriptionRepository.upsertPlan(plan.code, {
      name: plan.name,
      description: plan.description,
      interval: plan.interval,
      priceCents: plan.priceCents,
      currency: plan.currency || DEFAULT_CURRENCY,
      aiPromptLimit: plan.aiPromptLimit,
      uploadLimit: plan.uploadLimit,
      isActive: true,
      sortOrder: plan.sortOrder,
    });
  }
}

export async function ensureUserSubscription(userId) {
  await ensureDefaultPlans();
  const existing = await subscriptionRepository.getUserSubscription(userId);
  if (existing) return existing;
  const free = await subscriptionRepository.findPlanByCode('free');
  if (!free) throw new AppError('Free plan is not configured.', 500);
  return subscriptionRepository.upsertUserSubscription(userId, {
    planId: free.id,
    status: 'free',
    provider: 'internal',
    currentPeriodStart: new Date(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

export async function listPublicPlans() {
  await ensureDefaultPlans();
  const plans = await subscriptionRepository.listPlans({ activeOnly: true });
  return plans.map(mapPlan);
}

export async function getSubscriptionSummary(userId) {
  const subscription = await ensureUserSubscription(userId);
  const usage = await subscriptionRepository.getUsagePeriod(userId, periodKey())
    || { aiPromptCount: 0, uploadCount: 0, periodKey: periodKey() };
  const plan = mapPlan(subscription.plan);
  return {
    subscription: {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      provider: subscription.provider,
      plan,
    },
    usage: {
      periodKey: usage.periodKey || periodKey(),
      aiPromptCount: usage.aiPromptCount || 0,
      uploadCount: usage.uploadCount || 0,
      aiPromptLimit: plan.aiPromptLimit,
      uploadLimit: plan.uploadLimit,
    },
  };
}

export async function assertWithinLimit(userId, kind) {
  const summary = await getSubscriptionSummary(userId);
  const { usage, subscription } = summary;
  const isAi = kind === 'ai';
  const used = isAi ? usage.aiPromptCount : usage.uploadCount;
  const limit = isAi ? usage.aiPromptLimit : usage.uploadLimit;
  if (limit >= 0 && used >= limit) {
    const label = isAi ? 'AI prompts' : 'file uploads';
    throw new AppError(
      `Your ${subscription.plan.name} plan has reached its monthly ${label} limit (${limit}). Upgrade to continue.`,
      402,
      { code: 'usage_limit', kind, used, limit, plan: subscription.plan.code },
    );
  }
  return summary;
}

export async function recordUsage(userId, kind) {
  const field = kind === 'ai' ? 'aiPromptCount' : 'uploadCount';
  return subscriptionRepository.incrementUsage(userId, periodKey(), field);
}

export async function createCheckout(userId, planCode) {
  await ensureDefaultPlans();
  const code = String(planCode || '').trim().toLowerCase();
  const plan = await subscriptionRepository.findPlanByCode(code);
  if (!plan || !plan.isActive) throw new AppError('Selected plan was not found.', 404);
  if (plan.priceCents <= 0) throw new AppError('The Free plan does not require checkout.');

  const checkoutToken = crypto.randomBytes(24).toString('hex');
  const provider = String(process.env.PAYMENT_PROVIDER || 'internal').toLowerCase();
  const tx = await subscriptionRepository.createTransaction({
    userId,
    planId: plan.id,
    amountCents: plan.priceCents,
    currency: plan.currency || DEFAULT_CURRENCY,
    status: 'pending',
    provider,
    checkoutToken,
    meta: { planCode: plan.code },
  });

  // Authoritative price always comes from the database plan record — never from the client.
  return {
    transactionId: tx.id,
    checkoutToken,
    amountCents: plan.priceCents,
    currency: plan.currency,
    plan: mapPlan(plan),
    provider,
    // Frontend route; payment is only activated after server-side confirmation.
    checkoutPath: `/billing/checkout?token=${encodeURIComponent(checkoutToken)}`,
  };
}

export async function confirmCheckout(checkoutToken, { actorUserId } = {}) {
  const token = String(checkoutToken || '').trim();
  if (!token) throw new AppError('Checkout token is required.');
  const tx = await subscriptionRepository.findTransactionByToken(token);
  if (!tx) throw new AppError('Checkout session not found.', 404);
  if (actorUserId && tx.userId !== actorUserId) {
    throw new AppError('This checkout session belongs to another account.', 403);
  }
  if (tx.status === 'paid') {
    return getSubscriptionSummary(tx.userId);
  }
  if (tx.status !== 'pending') {
    throw new AppError('This checkout session can no longer be completed.', 409);
  }
  if (!tx.plan) throw new AppError('Plan for this checkout is missing.', 500);

  const now = new Date();
  const end = new Date(now);
  if (tx.plan.interval === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);

  await subscriptionRepository.updateTransaction(tx.id, {
    status: 'paid',
    providerRef: `internal_${tx.id}`,
    meta: {
      ...(typeof tx.meta === 'object' && tx.meta ? tx.meta : {}),
      confirmedAt: now.toISOString(),
      verification: 'server_side_internal',
    },
  });

  const subscription = await subscriptionRepository.upsertUserSubscription(tx.userId, {
    planId: tx.planId,
    status: 'active',
    provider: tx.provider || 'internal',
    currentPeriodStart: now,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    providerSubscriptionId: tx.id,
  });

  await subscriptionRepository.updateTransaction(tx.id, { subscriptionId: subscription.id });

  await recordActivity({
    userId: tx.userId,
    actorRole: 'lecturer',
    type: 'billing.payment_confirmed',
    summary: `Subscription activated: ${tx.plan.name}`,
    targetType: 'subscription',
    targetId: subscription.id,
    meta: { planCode: tx.plan.code, amountCents: tx.amountCents },
  });

  return getSubscriptionSummary(tx.userId);
}

export async function cancelSubscription(userId) {
  const current = await ensureUserSubscription(userId);
  if (current.plan?.code === 'free' || current.status === 'free') {
    throw new AppError('You are already on the Free plan.');
  }
  const free = await subscriptionRepository.findPlanByCode('free');
  const updated = await subscriptionRepository.updateUserSubscription(userId, {
    cancelAtPeriodEnd: true,
    // Immediate downgrade for internal provider when period end is missing/past.
    ...(current.currentPeriodEnd && current.currentPeriodEnd > new Date()
      ? {}
      : {
        planId: free.id,
        status: 'free',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }),
  });
  await recordActivity({
    userId,
    actorRole: 'lecturer',
    type: 'billing.subscription_canceled',
    summary: 'Subscription cancellation requested',
    targetType: 'subscription',
    targetId: updated.id,
  });
  return getSubscriptionSummary(userId);
}

export async function listBillingHistory(userId) {
  const rows = await subscriptionRepository.listTransactionsForUser(userId);
  return rows.map((row) => ({
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    planCode: row.plan?.code || null,
    planName: row.plan?.name || null,
    createdAt: row.createdAt,
  }));
}

export async function listAdminBilling() {
  const [transactions, subscriptions] = await Promise.all([
    subscriptionRepository.listAllTransactions({ take: 150 }),
    subscriptionRepository.listPaidSubscriptions(),
  ]);
  return {
    transactions: transactions.map((row) => ({
      id: row.id,
      amountCents: row.amountCents,
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      planCode: row.plan?.code || null,
      planName: row.plan?.name || null,
      createdAt: row.createdAt,
      user: row.user ? {
        id: row.user.id,
        name: row.user.fullName,
        email: row.user.email,
        role: row.user.role,
      } : null,
    })),
    subscriptions: subscriptions.map((row) => ({
      id: row.id,
      status: row.status,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      currentPeriodEnd: row.currentPeriodEnd,
      planCode: row.plan?.code || null,
      planName: row.plan?.name || null,
      user: row.user ? {
        id: row.user.id,
        name: row.user.fullName,
        email: row.user.email,
        role: row.user.role,
      } : null,
    })),
  };
}

export async function getCheckoutPreview(checkoutToken, userId) {
  const tx = await subscriptionRepository.findTransactionByToken(String(checkoutToken || '').trim());
  if (!tx) throw new AppError('Checkout session not found.', 404);
  if (tx.userId !== userId) throw new AppError('This checkout session belongs to another account.', 403);
  return {
    transactionId: tx.id,
    status: tx.status,
    amountCents: tx.amountCents,
    currency: tx.currency,
    plan: mapPlan(tx.plan),
    checkoutToken: tx.checkoutToken,
  };
}
