import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from './auth.js';
import { AppError } from './errors.js';
import { isDashboardRole } from '../lib/roles.js';

/** Dashboard routes — staff, super admin, partner, or school_admin. Never students. */
export async function requireDashboardAccess(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAuth(request, reply);

  if (!request.user || !isDashboardRole(request.user.role)) {
    throw new AppError(403, 'Dashboard access denied', 'FORBIDDEN');
  }
}
