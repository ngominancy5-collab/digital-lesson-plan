import prisma from '../config/database.js';

export function listByUser(userId) {
  return prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });
}

export function findOwned(userId, id) {
  return prisma.aiConversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

export function findOwnedBrief(userId, id) {
  return prisma.aiConversation.findFirst({ where: { id, userId } });
}

export function create(userId, title) {
  return prisma.aiConversation.create({
    data: { userId, title },
    include: { messages: true },
  });
}

export function addMessages(conversationId, userMessage, assistantMessage) {
  return prisma.aiMessage.createMany({
    data: [
      { conversationId, sender: 'user', message: userMessage },
      { conversationId, sender: 'assistant', message: assistantMessage },
    ],
  });
}

export function updateConversation(id, data) {
  return prisma.aiConversation.update({
    where: { id },
    data,
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

export function recentMessages(conversationId, take = 40) {
  return prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take,
  });
}
