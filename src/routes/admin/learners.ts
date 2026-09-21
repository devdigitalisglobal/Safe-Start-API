import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSuperAdmin } from '../../middleware/admin.js';
import {
  deleteLearnerByAdmin,
  getLearnerDetail,
  listLearners,
  revokeLearnerSessions,
  sendLearnerPasswordReset,
  suspendLearner,
  unsuspendLearner,
} from '../../services/learnerAdmin.js';
import { writeAudit } from './writeAudit.js';

const idParams = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  schoolId: z.string().uuid().optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const suspendBodySchema = z.object({
  reason: z.string().trim().max(200).optional().nullable(),
});

export default async function adminLearnerRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireSuperAdmin }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return listLearners(query);
  });

  app.get('/:id', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    return getLearnerDetail(id);
  });

  app.post('/:id/suspend', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = suspendBodySchema.parse(request.body ?? {});
    const actorId = request.user!.id;

    const learner = await suspendLearner(id, body.reason);
    await writeAudit(actorId, 'admin_learner_suspended', {
      userId: id,
      reason: body.reason ?? null,
    });
    return learner;
  });

  app.post('/:id/unsuspend', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    const learner = await unsuspendLearner(id);
    await writeAudit(actorId, 'admin_learner_unsuspended', { userId: id });
    return learner;
  });

  app.post('/:id/delete', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    const result = await deleteLearnerByAdmin(id);
    await writeAudit(actorId, 'admin_learner_deleted', { userId: id });
    return result;
  });

  app.post('/:id/reset-password', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    const result = await sendLearnerPasswordReset(id);
    await writeAudit(actorId, 'admin_learner_password_reset', {
      userId: id,
      email: result.email,
    });
    return result;
  });

  app.post('/:id/revoke-sessions', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    await revokeLearnerSessions(id);
    await writeAudit(actorId, 'admin_learner_sessions_revoked', { userId: id });
    return { revoked: true, userId: id };
  });
}
