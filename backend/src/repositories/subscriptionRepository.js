import prisma from '../config/database.js';

export function listPlans({ activeOnly = true } = {}) {
  return prisma.subscriptionPlan.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
  });
}

export function findPlanByCode(code) {
  return prisma.subscriptionPlan.findUnique({ where: { code } });
}

export function findPlanById(id) {
  return prisma.subscriptionPlan.findUnique({ where: { id } });
}

export function upsertPlan(code, data) {
  return prisma.subscriptionPlan.upsert({
    where: { code },
    create: { code, ...data },
    update: data,
  });
}

export function getUserSubscription(userId) {
  return prisma.userSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
}

export function upsertUserSubscription(userId, data) {
  return prisma.userSubscription.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    include: { plan: true },
  });
}

export function updateUserSubscription(userId, data) {
  return prisma.userSubscription.update({
    where: { userId },
    data,
    include: { plan: true },
  });
}

export function getUsagePeriod(userId, periodKey) {
  return prisma.usagePeriod.findUnique({
    where: { userId_periodKey: { userId, periodKey } },
  });
}

export function upsertUsagePeriod(userId, periodKey, data) {
  return prisma.usagePeriod.upsert({
    where: { userId_periodKey: { userId, periodKey } },
    create: { userId, periodKey, ...data },
    update: data,
  });
}

export function incrementUsage(userId, periodKey, field) {
  const create = { userId, periodKey, aiPromptCount: 0, uploadCount: 0, [field]: 1 };
  return prisma.usagePeriod.upsert({
    where: { userId_periodKey: { userId, periodKey } },
    create,
    update: { [field]: { increment: 1 } },
  });
}

export function createTransaction(data) {
  return prisma.billingTransaction.create({ data });
}

export function findTransactionByToken(checkoutToken) {
  return prisma.billingTransaction.findUnique({
    where: { checkoutToken },
    include: { plan: true, user: true },
  });
}

export function findTransactionById(id) {
  return prisma.billingTransaction.findUnique({
    where: { id },
    include: { plan: true },
  });
}

export function updateTransaction(id, data) {
  return prisma.billingTransaction.update({ where: { id }, data });
}

export function listTransactionsForUser(userId) {
  return prisma.billingTransaction.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export function listAllTransactions({ take = 100 } = {}) {
  return prisma.billingTransaction.findMany({
    include: {
      plan: true,
      user: { select: { id: true, fullName: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export function listPaidSubscriptions() {
  return prisma.userSubscription.findMany({
    where: {
      OR: [
        { status: 'active' },
        { status: 'past_due' },
        { status: 'canceled' },
      ],
      plan: { code: { not: 'free' } },
    },
    include: {
      plan: true,
      user: { select: { id: true, fullName: true, email: true, role: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}
