import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

/** Runtime DB URL — session pooler (5432) on Vercel; DATABASE_URL elsewhere. */
function resolveRuntimeConnectionString(): string {
  const raw =
    process.env.VERCEL && env.DIRECT_URL ? env.DIRECT_URL : env.DATABASE_URL;
  const url = new URL(raw);

  // pgbouncer=true is only for transaction pooler (6543).
  if (url.port === '5432' || url.port === '') {
    url.searchParams.delete('pgbouncer');
  }

  return url.toString();
}

const isProduction = env.NODE_ENV === 'production';

const pool = new pg.Pool({
  connectionString: resolveRuntimeConnectionString(),
  max: isProduction ? 1 : 10,
  idleTimeoutMillis: isProduction ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  ...(isProduction ? { ssl: { rejectUnauthorized: false } } : {}),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
