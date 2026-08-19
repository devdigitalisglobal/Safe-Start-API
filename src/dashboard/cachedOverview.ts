import {
  buildOverviewCacheKey,
  buildSchoolsCacheKey,
  OVERVIEW_TTL_SEC,
  readDashboardCache,
  SCHOOLS_TTL_SEC,
  writeDashboardCache,
} from './cache.js';
import { computeDashboardOverview } from './overview.js';
import { dashboardTimer, logDashboardEvent } from './observability.js';
import type { DashboardScope } from '../middleware/scope.js';
import type { DashboardFilters } from './metrics.js';
import type { FastifyBaseLogger } from 'fastify';

type CacheUser = {
  id: string;
  role: string;
};

export type DashboardOverviewResult = Awaited<ReturnType<typeof computeDashboardOverview>>;

export async function getDashboardOverviewCached(
  user: CacheUser,
  scope: DashboardScope,
  filters: DashboardFilters,
  log?: FastifyBaseLogger
): Promise<DashboardOverviewResult> {
  const startedAt = dashboardTimer();
  const key = buildOverviewCacheKey(user, scope, filters);
  const cached = await readDashboardCache<DashboardOverviewResult>(key);

  if (cached) {
    logDashboardEvent(log, 'overview_cache_hit', startedAt, {
      role: user.role,
      schoolId: scope.schoolId ?? null,
    });
    return cached;
  }

  const result = await computeDashboardOverview(scope, filters);
  await writeDashboardCache(key, result, OVERVIEW_TTL_SEC);
  logDashboardEvent(log, 'overview_cache_miss', startedAt, {
    role: user.role,
    schoolId: scope.schoolId ?? null,
  });
  return result;
}

export async function getDashboardSchoolsCached<T>(
  user: CacheUser,
  load: () => Promise<T>,
  log?: FastifyBaseLogger
): Promise<T> {
  const startedAt = dashboardTimer();
  const key = buildSchoolsCacheKey(user);
  const cached = await readDashboardCache<T>(key);

  if (cached) {
    logDashboardEvent(log, 'schools_cache_hit', startedAt, { role: user.role });
    return cached;
  }

  const result = await load();
  await writeDashboardCache(key, result, SCHOOLS_TTL_SEC);
  logDashboardEvent(log, 'schools_cache_miss', startedAt, { role: user.role });
  return result;
}
