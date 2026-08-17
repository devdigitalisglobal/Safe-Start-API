import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from './auth.js';
import { AppError } from './errors.js';

const DASHBOARD_ROLES = ['staff', 'partner', 'school_admin'] as const;

/** Dashboard routes — staff, partner, or school_admin only. Never students. */
export async function requireDashboardAccess(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAuth(request, reply);

  if (!request.user || !DASHBOARD_ROLES.includes(request.user.role as (typeof DASHBOARD_ROLES)[number])) {
    throw new AppError(403, 'Dashboard access denied', 'FORBIDDEN');
  }
}
