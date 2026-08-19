import type { FastifyBaseLogger } from 'fastify';

export const DASHBOARD_SLOW_MS = 1000;
export const DB_SLOW_QUERY_MS = 1000;

export function dashboardTimer() {
  return performance.now();
}

export function logDashboardEvent(
  log: FastifyBaseLogger | undefined,
  event: string,
  startedAt: number,
  meta?: Record<string, unknown>
) {
  if (!log) return;

  const durationMs = Math.round(performance.now() - startedAt);
  const payload = { dashboardEvent: event, durationMs, ...meta };

  if (durationMs >= DASHBOARD_SLOW_MS) {
    log.warn(payload, 'Slow dashboard operation');
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    log.info(payload, 'Dashboard operation');
  }
}
