import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@planwise.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Demo user already exists:', email);
    return;
  }

  const passwordHash = await bcrypt.hash('Demo1234', 12);
  await prisma.user.create({
    data: {
      fullName: 'Demo Lecturer',
      email,
      passwordHash,
      role: 'lecturer',
      profile: {
        create: {
          institution: 'University of Zambia',
          department: 'Information Technology',
          preferences: {
            notifications: true,
            lessons: true,
            assessments: true,
            ai: true,
          },
        },
      },
    },
  });
  console.log('Seeded demo user: demo@planwise.local / Demo1234');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
