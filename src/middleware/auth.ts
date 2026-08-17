import type { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { AppError } from './errors.js';

// jose fetches and caches the key set, and handles rotation automatically
const JWKS = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  schoolId: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    authId?: string;
    authEmail?: string;
  }
}

/**
 * Verifies the token and extracts the Supabase user id.
 * Does NOT require a profile row — use this on the registration route,
 * where the profile doesn't exist yet.
 */
export async function verifyToken(request: FastifyRequest) {
  const header = request.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing authorization header', 'NO_TOKEN');
  }

  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
    });

    if (!payload.sub) {
      throw new AppError(401, 'Invalid token', 'BAD_TOKEN');
    }

    request.authId = payload.sub;
    request.authEmail = payload.email as string | undefined;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'Invalid or expired token', 'BAD_TOKEN');
  }
}

/**
 * Verifies the token AND loads the profile.
 * Use this on every protected route.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  await verifyToken(request);

  const user = await prisma.user.findUnique({
    where: { id: request.authId! },
    select: {
      id: true,
      email: true,
      role: true,
      schoolId: true,
      deletedAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'Profile not found. Complete registration.', 'NO_PROFILE');
  }

  if (user.deletedAt) {
    throw new AppError(403, 'Account has been deleted', 'DELETED');
  }

  request.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
  };

  // Fire and forget — powers the "monthly active users" metric.
  // Deliberately not awaited: a failed timestamp update must never fail the request.
  prisma.user
    .update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    })
    .catch(() => {});
}

/**
 * Attaches the user when a valid token and profile exist.
 * Missing or invalid tokens are ignored — for public routes that personalize when logged in.
 */
export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return;

  try {
    await verifyToken(request);
  } catch {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: request.authId! },
    select: {
      id: true,
      email: true,
      role: true,
      schoolId: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) return;

  request.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
  };
}

/**
 * Restricts a route to specific roles.
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      await requireAuth(request, reply);
    }
    if (!roles.includes(request.user!.role)) {
      throw new AppError(403, 'Insufficient permissions', 'FORBIDDEN');
    }
  };
}