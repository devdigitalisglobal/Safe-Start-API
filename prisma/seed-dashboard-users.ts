/**
 * Dev-only dashboard test users.
 *
 * Creates Supabase auth accounts + profile rows for staff, partner, and
 * school_admin roles. Re-run safely — upserts by email.
 *
 * Usage:
 *   npm run seed:dashboard-users
 *
 * Set DASHBOARD_DEV_PASSWORD in .env before running (see .env.example).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:dashboard-users is for local development only.');
  process.exit(1);
}

const DEV_PASSWORD = process.env.DASHBOARD_DEV_PASSWORD;
if (!DEV_PASSWORD) {
  console.error('Set DASHBOARD_DEV_PASSWORD in .env before running seed:dashboard-users.');
  console.error('See .env.example for details.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type DashboardSeedUser = {
  email: string;
  fullName: string;
  role: 'staff' | 'partner' | 'school_admin' | 'reviewer';
  linkSchool?: boolean;
};

const users: DashboardSeedUser[] = [
  { email: 'staff@safestart.dev', fullName: 'Demo Staff', role: 'staff' },
  { email: 'partner@safestart.dev', fullName: 'Demo Partner', role: 'partner' },
  {
    email: 'schooladmin@safestart.dev',
    fullName: 'Demo School Admin',
    role: 'school_admin',
    linkSchool: true,
  },
  { email: 'reviewer@safestart.dev', fullName: 'Demo NRMA Reviewer', role: 'reviewer' },
];

async function ensureAuthUserId(email: string): Promise<string> {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });

  if (!createError && created.user) {
    return created.user.id;
  }

  const existingProfile = await prisma.user.findUnique({ where: { email } });
  if (existingProfile) return existingProfile.id;

  // Auth user may exist without a profile row — find via paginated list.
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  throw new Error(
    createError
      ? `Could not create or find auth user ${email}: ${createError.message}`
      : `Could not find auth user ${email}`
  );
}

async function main() {
  console.log('Seeding demo school and dashboard users…\n');

  const school = await prisma.school.upsert({
    where: { inviteCode: 'DEMO01' },
    create: {
      name: 'Demo High School',
      inviteCode: 'DEMO01',
      state: 'NSW',
      contactEmail: 'admin@demohigh.edu.au',
      status: 'active',
    },
    update: {
      name: 'Demo High School',
      status: 'active',
    },
  });

  console.log(`  School: ${school.name} (invite code DEMO01)`);

  for (const entry of users) {
    const authId = await ensureAuthUserId(entry.email);
    const schoolId = entry.linkSchool ? school.id : null;

    await prisma.user.upsert({
      where: { id: authId },
      create: {
        id: authId,
        email: entry.email,
        fullName: entry.fullName,
        role: entry.role,
        schoolId,
        consentVersion: 'dev-seed',
        registeredAt: new Date(),
      },
      update: {
        email: entry.email,
        fullName: entry.fullName,
        role: entry.role,
        schoolId,
        deletedAt: null,
      },
    });

    console.log(`  ${entry.role.padEnd(14)} ${entry.email}`);
  }

  console.log('\nDashboard dev users seeded. Password is DASHBOARD_DEV_PASSWORD from .env.');
  console.log('\nDone ✅');
}

main()
  .catch((err) => {
    console.error('Dashboard user seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
