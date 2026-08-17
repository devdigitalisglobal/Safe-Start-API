import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const email = process.argv[2] ?? 'test@example.com';

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

if (user.role === 'staff') {
  console.log(`${email} is already staff`);
} else {
  await prisma.user.update({
    where: { email },
    data: { role: 'staff' },
  });
  console.log(`Promoted ${email} from ${user.role} → staff`);
}

await prisma.$disconnect();
