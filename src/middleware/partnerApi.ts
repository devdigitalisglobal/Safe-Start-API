import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { AppError } from './errors.js';
import { verifyPartnerAccessToken } from '../partner/tokens.js';

export function requirePartnerScope(...requiredScopes: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing authorization header', 'NO_TOKEN');
    }

    let claims;
    try {
      claims = await verifyPartnerAccessToken(header.slice(7));
    } catch {
      throw new AppError(401, 'Invalid or expired partner token', 'BAD_TOKEN');
    }

    const credential = await prisma.partnerApiCredential.findUnique({
      where: { id: claims.credentialId },
      select: {
        id: true,
        partnerId: true,
        status: true,
        scopes: true,
      },
    });

    if (!credential || credential.status !== 'active' || credential.partnerId !== claims.partnerId) {
      throw new AppError(401, 'Partner credential is not active', 'BAD_TOKEN');
    }

    const granted = credential.scopes.split(',').map((scope) => scope.trim());
    const missing = requiredScopes.filter((scope) => !granted.includes(scope));
    if (missing.length > 0) {
      throw new AppError(403, 'Insufficient partner scope', 'FORBIDDEN');
    }

    request.partnerApi = {
      partnerId: credential.partnerId,
      credentialId: credential.id,
      scopes: granted,
    };

    prisma.partnerApiCredential
      .update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});
  };
}
