import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireTokenAal2 } from '../auth/jwtClaims.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { writeAudit } from '../routes/admin/writeAudit.js';
import {
  generateRecoveryCodes,
  getMfaStatus,
  isMfaEnrolled,
  redeemRecoveryCode,
} from '../services/mfaRecovery.js';

const redeemSchema = z.object({
  code: z.string().min(8).max(32),
});

export default async function mfaRecoveryRoutes(app: FastifyInstance) {
  /** MFA enrollment + recovery code status for the signed-in portal user. */
  app.get('/status', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    return getMfaStatus(userId);
  });

  /** Create a fresh set of recovery codes. Requires an enrolled authenticator (AAL2). */
  app.post('/recovery-codes/generate', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    requireTokenAal2(request.headers.authorization);

    if (!(await isMfaEnrolled(userId))) {
      throw new AppError(400, 'Enroll an authenticator before generating recovery codes', 'MFA_NOT_ENROLLED');
    }

    const codes = await generateRecoveryCodes(userId);
    await writeAudit(userId, 'mfa_recovery_codes_generated', { count: codes.length });

    return { codes };
  });

  /** Redeem a one-time recovery code — wipes MFA factors so the user can re-enroll. */
  app.post('/recovery-codes/redeem', {
    preHandler: [
      requireAuth,
      rateLimit({ keyPrefix: 'mfa-recovery-redeem', limit: 8, windowMs: 60_000 }),
    ],
  }, async (request) => {
    const userId = request.user!.id;
    const body = redeemSchema.parse(request.body);

    const result = await redeemRecoveryCode(userId, body.code);
    await writeAudit(userId, 'mfa_recovery_code_redeemed', {
      removedFactors: result.removedFactors,
    });

    return { redeemed: true, reenrollRequired: true };
  });
}
