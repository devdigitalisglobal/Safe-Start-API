import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../middleware/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import {
  generateClientId,
  generateClientSecret,
  hashPartnerSecret,
  verifyPartnerSecret,
} from '../../partner/credentials.js';
import { issuePartnerAccessToken, PARTNER_TOKEN_TTL_SECONDS } from '../../partner/tokens.js';

const tokenBodySchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

export default async function partnerTokenRoutes(app: FastifyInstance) {
  app.post(
    '/oauth/token',
    { preHandler: rateLimit({ keyPrefix: 'partner-token', limit: 5, windowMs: 60_000 }) },
    async (request) => {
      const body = tokenBodySchema.parse(request.body);

      const credential = await prisma.partnerApiCredential.findUnique({
        where: { clientId: body.client_id },
        include: { partner: { select: { id: true, status: true } } },
      });

      if (
        !credential ||
        credential.status !== 'active' ||
        credential.partner.status !== 'active' ||
        !verifyPartnerSecret(body.client_secret, credential.secretHash)
      ) {
        throw new AppError(401, 'Invalid client credentials', 'BAD_CREDENTIALS');
      }

      const scopes = credential.scopes.split(',').map((scope) => scope.trim()).filter(Boolean);
      const accessToken = await issuePartnerAccessToken({
        partnerId: credential.partnerId,
        credentialId: credential.id,
        scopes,
      });

      await prisma.partnerApiCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: PARTNER_TOKEN_TTL_SECONDS,
        scope: scopes.join(' '),
      };
    }
  );
}
