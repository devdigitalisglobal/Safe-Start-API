import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { SUPER_ADMIN_ROLE } from '../src/lib/roles.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/promote-super-admin.ts <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

if (user.role === SUPER_ADMIN_ROLE) {
  console.log(`${email} is already super admin`);
} else {
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: SUPER_ADMIN_ROLE, deletedAt: null },
    select: { email: true },
  });

  if (existingSuperAdmin && existingSuperAdmin.email !== email) {
    console.error(
      `Another super admin already exists (${existingSuperAdmin.email}). Demote them first.`,
    );
    process.exit(1);
  }

  await prisma.user.update({
    where: { email },
    data: { role: SUPER_ADMIN_ROLE },
  });
  console.log(`Promoted ${email} from ${user.role} → ${SUPER_ADMIN_ROLE}`);
}

await prisma.$disconnect();
