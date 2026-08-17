import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

function buildConnectionString(): string {
  const url = new URL(env.DATABASE_URL);

  if (env.NODE_ENV === 'production') {
    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }
  }

  return url.toString();
}

const pool = new pg.Pool({
  connectionString: buildConnectionString(),
  max: env.NODE_ENV === 'production' ? 1 : 10,
  idleTimeoutMillis: env.NODE_ENV === 'production' ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
