import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from './auth.js';
import { AppError } from './errors.js';

/** CMS read — internal staff and NRMA reviewers. */
const ADMIN_READ_ROLES = ['staff', 'reviewer'] as const;

/** CMS write — edit content, submit for review, publish. Staff only. */
const ADMIN_WRITE_ROLES = ['staff'] as const;

/** Approve or reject modules in review. NRMA reviewers only. */
const ADMIN_REVIEW_ROLES = ['reviewer'] as const;

export async function requireAdminRead(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!ADMIN_READ_ROLES.includes(request.user!.role as (typeof ADMIN_READ_ROLES)[number])) {
    throw new AppError(403, 'Admin access denied', 'FORBIDDEN');
  }
}

export async function requireAdminWrite(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!ADMIN_WRITE_ROLES.includes(request.user!.role as (typeof ADMIN_WRITE_ROLES)[number])) {
    throw new AppError(403, 'Admin write access denied', 'FORBIDDEN');
  }
}

export async function requireAdminReview(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!ADMIN_REVIEW_ROLES.includes(request.user!.role as (typeof ADMIN_REVIEW_ROLES)[number])) {
    throw new AppError(403, 'Review access denied', 'FORBIDDEN');
  }
}

export { ADMIN_READ_ROLES, ADMIN_WRITE_ROLES, ADMIN_REVIEW_ROLES };
