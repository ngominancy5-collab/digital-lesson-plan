/**
 * Copy User (+ Profile) rows from LOCAL_DATABASE_URL → Neon DATABASE_URL.
 * Preserves password hashes so the same credentials work on Neon.
 */
import { PrismaClient } from '@prisma/client';

const localUrl = process.env.LOCAL_DATABASE_URL;
const neonUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!localUrl) {
  console.error('LOCAL_DATABASE_URL is required (previous local Postgres URL).');
  process.exit(1);
}
if (!neonUrl || !/neon\.tech/i.test(neonUrl)) {
  console.error('DATABASE_URL / DATABASE_URL_UNPOOLED must point at Neon.');
  process.exit(1);
}
if (localUrl === neonUrl) {
  console.error('Local and Neon URLs are the same; nothing to sync.');
  process.exit(1);
}

const local = new PrismaClient({ datasources: { db: { url: localUrl } } });
const neon = new PrismaClient({ datasources: { db: { url: neonUrl } } });

function profilePayload(profile) {
  if (!profile) return undefined;
  return {
    institution: profile.institution ?? '',
    department: profile.department ?? '',
    specialization: profile.specialization ?? '',
    educationLevel: profile.educationLevel ?? '',
    phone: profile.phone ?? '',
    preferences: profile.preferences ?? {},
  };
}

async function main() {
  const users = await local.user.findMany({ include: { profile: true } });
  console.log(`Found ${users.length} local user(s) to sync.`);

  let upserted = 0;
  for (const user of users) {
    const { profile, ...row } = user;
    const profileData = profilePayload(profile);

    await neon.user.upsert({
      where: { email: row.email },
      create: {
        id: row.id,
        fullName: row.fullName,
        username: row.username,
        email: row.email,
        passwordHash: row.passwordHash,
        role: row.role,
        requestedRole: row.requestedRole,
        accountStatus: row.accountStatus,
        emailVerified: row.emailVerified,
        mustChangePassword: row.mustChangePassword,
        roleConfirmed: row.roleConfirmed,
        approvedAt: row.approvedAt,
        approvedById: row.approvedById,
        profileImage: row.profileImage,
        credentialEmailStatus: row.credentialEmailStatus,
        credentialEmailSentAt: row.credentialEmailSentAt,
        confirmationEmailStatus: row.confirmationEmailStatus,
        confirmationEmailSentAt: row.confirmationEmailSentAt,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        profile: profileData ? { create: profileData } : undefined,
      },
      update: {
        fullName: row.fullName,
        username: row.username,
        passwordHash: row.passwordHash,
        role: row.role,
        requestedRole: row.requestedRole,
        accountStatus: row.accountStatus,
        emailVerified: row.emailVerified,
        mustChangePassword: row.mustChangePassword,
        roleConfirmed: row.roleConfirmed,
        approvedAt: row.approvedAt,
        approvedById: row.approvedById,
        profileImage: row.profileImage,
        credentialEmailStatus: row.credentialEmailStatus,
        credentialEmailSentAt: row.credentialEmailSentAt,
        confirmationEmailStatus: row.confirmationEmailStatus,
        confirmationEmailSentAt: row.confirmationEmailSentAt,
        lastLoginAt: row.lastLoginAt,
        ...(profileData
          ? {
              profile: {
                upsert: {
                  create: profileData,
                  update: profileData,
                },
              },
            }
          : {}),
      },
    });
    upserted += 1;
    console.log(`  synced: ${row.email} (${row.role}/${row.accountStatus})`);
  }

  const neonCount = await neon.user.count();
  console.log(`Done. Upserted ${upserted}. Neon user count: ${neonCount}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.allSettled([local.$disconnect(), neon.$disconnect()]);
  });
