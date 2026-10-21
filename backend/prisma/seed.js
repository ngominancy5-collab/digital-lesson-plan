import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Production seed: remove known demo accounts. First admin is created at
 * server startup via ADMIN_EMAIL / ADMIN_PASSWORD (see ensureBootstrapAdmin).
 */
async function main() {
  const demoEmails = ['demo@planwise.local'];
  const result = await prisma.user.deleteMany({
    where: { email: { in: demoEmails } },
  });
  if (result.count) {
    console.log(`Removed ${result.count} demo account(s).`);
  } else {
    console.log('No demo accounts to remove. Bootstrap admin via ADMIN_EMAIL / ADMIN_PASSWORD.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
