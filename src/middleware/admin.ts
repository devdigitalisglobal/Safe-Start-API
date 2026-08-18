import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from './auth.js';
import { AppError } from './errors.js';
import {
  ADMIN_READ_ROLES,
  ADMIN_REVIEW_ROLES,
  ADMIN_WRITE_ROLES,
  isAdminReadRole,
  isAdminWriteRole,
  isSuperAdmin,
} from '../lib/roles.js';

export async function requireAdminRead(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!isAdminReadRole(request.user!.role)) {
    throw new AppError(403, 'Admin access denied', 'FORBIDDEN');
  }
}

export async function requireAdminWrite(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!isAdminWriteRole(request.user!.role)) {
    throw new AppError(403, 'Admin write access denied', 'FORBIDDEN');
  }
}

export async function requireAdminReview(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!ADMIN_REVIEW_ROLES.includes(request.user!.role as (typeof ADMIN_REVIEW_ROLES)[number])) {
    throw new AppError(403, 'Review access denied', 'FORBIDDEN');
  }
}

/** Team management + MFA reset — super admin only. */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!isSuperAdmin(request.user!.role)) {
    throw new AppError(403, 'Super admin access required', 'FORBIDDEN');
  }
}

export { ADMIN_READ_ROLES, ADMIN_WRITE_ROLES, ADMIN_REVIEW_ROLES };
