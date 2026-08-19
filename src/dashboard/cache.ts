import { env } from '../env.js';
import type { DashboardScope } from '../middleware/scope.js';
import type { DashboardFilters } from './metrics.js';

const OVERVIEW_TTL_SEC = 180;
const SCHOOLS_TTL_SEC = 900;

type CacheUser = {
  id: string;
  role: string;
};

type MemoryEntry = {
  expiresAt: number;
  value: string;
};

const memoryStore = new Map<string, MemoryEntry>();

function hasUpstash() {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstashGet(key: string): Promise<string | null> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { result?: string | null };
  return body.result ?? null;
}

async function upstashSet(key: string, value: string, ttlSec: number): Promise<void> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([['SET', key, value, 'EX', ttlSec]]),
  });
  if (!response.ok) {
    throw new Error('Upstash SET failed');
  }
}

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSec: number): void {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

async function cacheGet(key: string): Promise<string | null> {
  if (hasUpstash()) {
    try {
      return await upstashGet(key);
    } catch {
      return memoryGet(key);
    }
  }
  return memoryGet(key);
}

async function cacheSet(key: string, value: string, ttlSec: number): Promise<void> {
  if (hasUpstash()) {
    try {
      await upstashSet(key, value, ttlSec);
      return;
    } catch {
      // fall through to memory
    }
  }
  memorySet(key, value, ttlSec);
}

export function buildOverviewCacheKey(
  user: CacheUser,
  scope: DashboardScope,
  filters: DashboardFilters
) {
  const scopePart = `${scope.schoolId ?? '-'}:${scope.partnerId ?? '-'}`;
  const filterPart = `${filters.schoolId ?? '-'}:${filters.from?.getTime() ?? '-'}:${filters.to?.getTime() ?? '-'}`;
  return `dashboard:overview:v1:${user.id}:${user.role}:${scopePart}:${filterPart}`;
}

export function buildSchoolsCacheKey(user: CacheUser) {
  return `dashboard:schools:v1:${user.id}:${user.role}`;
}

export async function readDashboardCache<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeDashboardCache<T>(key: string, value: T, ttlSec: number): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSec);
}

export { OVERVIEW_TTL_SEC, SCHOOLS_TTL_SEC };
