/**
 * Seed learner Resources content (checklists + helpful links).
 *
 * Usage:
 *   npm run seed:resources
 *
 * Re-run safely — replaces checklists, helpful_links, and legacy guides (resources category).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentDir = join(__dirname, 'content');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function readBody(filename: string) {
  return readFileSync(join(contentDir, filename), 'utf8').trim();
}

const CHECKLIST_IDS = {
  buying: 'a1000001-0001-4000-8000-000000000001',
  maintenance: 'a1000001-0002-4000-8000-000000000002',
  documents: 'a1000001-0003-4000-8000-000000000003',
} as const;

const CHECKLISTS = [
  {
    id: CHECKLIST_IDS.buying,
    title: 'Car Buying Checklist',
    summary:
      'A practical checklist for a young or first-time buyer to use before, during and after buying a used car.',
    body: readBody('car-buying-checklist.md'),
    orderIndex: 1,
  },
  {
    id: CHECKLIST_IDS.maintenance,
    title: 'Car Maintenance Checklist',
    summary: 'Regular checks and maintenance habits to keep your car safe and road-ready.',
    body: readBody('car-maintenance-checklist.md'),
    orderIndex: 2,
  },
  {
    id: CHECKLIST_IDS.documents,
    title: 'Car Documents Checklist',
    summary: 'Documents to check, collect and keep when buying and owning your first car.',
    body: readBody('car-documents-checklist.md'),
    orderIndex: 3,
  },
] as const;

const HELPFUL_LINKS = [
  {
    title: 'Drivers licence admin',
    url: 'https://www.service.nsw.gov.au/services/nsw-driver-licence',
    orderIndex: 1,
  },
  {
    title: 'Registration renewal',
    url: 'https://www.service.nsw.gov.au/transaction/renew-a-vehicle-registration',
    orderIndex: 2,
  },
  {
    title: 'P Plate legal checks',
    url: 'https://www.service.nsw.gov.au/referral/check-prohibited-vehicles-for-provisional-p1-and-p2-drivers',
    orderIndex: 3,
  },
  { title: 'Number Plates', url: 'https://myplates.com.au', orderIndex: 4 },
  { title: 'Pre Purchase inspection', url: 'https://autoverifi.com.au', orderIndex: 5 },
  { title: 'History check', url: 'https://autoverifi.com.au', orderIndex: 6 },
  { title: 'PPSR', url: 'https://ppsr.gov.au', orderIndex: 7 },
  { title: 'Payment Escrow', url: 'https://safepay.com.au', orderIndex: 8 },
  { title: 'ANCAP rating', url: 'https://www.ancap.com.au/', orderIndex: 9 },
  { title: 'Valuation Research', url: 'https://www.redbook.com.au', orderIndex: 10 },
] as const;

async function main() {
  const removed = await prisma.resourceItem.deleteMany({
    where: { category: { in: ['checklists', 'helpful_links', 'resources'] } },
  });

  for (const checklist of CHECKLISTS) {
    await prisma.resourceItem.create({
      data: {
        id: checklist.id,
        category: 'checklists',
        title: checklist.title,
        summary: checklist.summary,
        body: checklist.body,
        url: null,
        orderIndex: checklist.orderIndex,
        status: 'published',
      },
    });
  }

  for (const link of HELPFUL_LINKS) {
    await prisma.resourceItem.create({
      data: {
        category: 'helpful_links',
        title: link.title,
        summary: null,
        body: null,
        url: link.url,
        orderIndex: link.orderIndex,
        status: 'published',
      },
    });
  }

  console.log(
    `Resources seeded: 3 checklists, ${HELPFUL_LINKS.length} helpful links (${removed.count} previous items removed).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
