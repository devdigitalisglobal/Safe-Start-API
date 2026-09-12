import type { FastifyRequest } from 'fastify';
import { requireTokenAal2 } from '../auth/jwtClaims.js';
import { env } from '../env.js';

export function isPortalMfaRequired() {
  return env.PORTAL_MFA_REQUIRED !== 'false';
}

/** Require MFA (AAL2) on staff portal routes when PORTAL_MFA_REQUIRED is enabled. */
export async function requirePortalAal2(request: FastifyRequest) {
  if (!isPortalMfaRequired()) return;
  requireTokenAal2(request.headers.authorization);
}
