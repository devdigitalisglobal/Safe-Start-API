import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/errors.js';
import {
  countUnusedRecoveryCodes,
  isMfaEnrolled,
  resetUserMfa,
} from '../../services/mfaRecovery.js';
import {
  PORTAL_ROLES,
  createPortalUser,
  deactivatePortalUser,
  getPortalUser,
  mapPortalUserRow,
  reactivatePortalUser,
  updatePortalUser,
} from '../../services/portalUsers.js';
import { writeAudit } from './writeAudit.js';

/** Team management — Auto Verifi staff only. */
async function requireStaffOnly(request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  await requireAuth(request, reply);
  if (request.user!.role !== 'staff') {
    throw new AppError(403, 'Staff access denied', 'FORBIDDEN');
  }
}

const idParams = z.object({ id: z.string().uuid() });

const createUserSchema = z.object({
  email: z.string().email().max(320),
  fullName: z.string().min(2).max(100),
  role: z.enum(PORTAL_ROLES),
  schoolId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  role: z.enum(PORTAL_ROLES).optional(),
  schoolId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
});

const portalUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  schoolId: true,
  partnerId: true,
  lastActiveAt: true,
  registeredAt: true,
  deletedAt: true,
  school: { select: { name: true } },
  partner: { select: { name: true } },
} as const;

async function mapPortalUserWithMfa(
  u: Parameters<typeof mapPortalUserRow>[0]
) {
  const [mfaEnrolled, unusedRecoveryCodes] = await Promise.all([
    isMfaEnrolled(u.id),
    countUnusedRecoveryCodes(u.id),
  ]);
  return {
    ...mapPortalUserRow(u, mfaEnrolled),
    unusedRecoveryCodes,
  };
}

export default async function adminUserRoutes(app: FastifyInstance) {
  /** List portal users. */
  app.get('/', { preHandler: requireStaffOnly }, async () => {
    const rows = await prisma.user.findMany({
      where: {
        role: { in: [...PORTAL_ROLES] },
      },
      orderBy: [{ deletedAt: 'asc' }, { role: 'asc' }, { fullName: 'asc' }],
      select: portalUserSelect,
    });

    const users = await Promise.all(rows.map((row) => mapPortalUserWithMfa(row)));
    return { users };
  });

  /** Create a portal user with a one-time temporary password. */
  app.post('/', { preHandler: requireStaffOnly }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const actorId = request.user!.id;

    const { user, temporaryPassword } = await createPortalUser(body);

    await writeAudit(actorId, 'admin_portal_user_created', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return reply.status(201).send({
      ...(await mapPortalUserWithMfa(user)),
      temporaryPassword,
    });
  });

  app.post('/:id/deactivate', { preHandler: requireStaffOnly }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    if (id === actorId) {
      throw new AppError(400, 'You cannot deactivate your own account', 'BAD_REQUEST');
    }

    await deactivatePortalUser(id);
    await writeAudit(actorId, 'admin_portal_user_deactivated', { userId: id });

    return { deactivated: true, userId: id };
  });

  app.post('/:id/reactivate', { preHandler: requireStaffOnly }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    await reactivatePortalUser(id);
    await writeAudit(actorId, 'admin_portal_user_reactivated', { userId: id });

    const user = await getPortalUser(id);
    return mapPortalUserWithMfa(user);
  });

  app.post('/:id/mfa/reset', { preHandler: requireStaffOnly }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    await getPortalUser(id);
    const result = await resetUserMfa(id);

    await writeAudit(actorId, 'admin_mfa_reset', {
      userId: id,
      removedFactors: result.removedFactors,
    });

    return { reset: true, removedFactors: result.removedFactors };
  });

  /** Single portal user. */
  app.get('/:id', { preHandler: requireStaffOnly }, async (request) => {
    const { id } = idParams.parse(request.params);
    const user = await getPortalUser(id);
    return mapPortalUserWithMfa(user);
  });

  app.patch('/:id', { preHandler: requireStaffOnly }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const actorId = request.user!.id;

    const user = await updatePortalUser(id, body);

    await writeAudit(actorId, 'admin_portal_user_updated', {
      userId: id,
      role: user.role,
    });

    return mapPortalUserWithMfa(user);
  });
}
