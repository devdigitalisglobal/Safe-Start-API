import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../middleware/errors.js';
import { requireSuperAdmin } from '../../middleware/admin.js';
import {
  INVITE_PORTAL_ROLES,
  PORTAL_DIRECTORY_ROLES,
  isSuperAdmin,
} from '../../lib/roles.js';
import {
  countUnusedRecoveryCodes,
  isMfaEnrolled,
  resetUserMfa,
} from '../../services/mfaRecovery.js';
import {
  createPortalUser,
  deactivatePortalUser,
  getPortalUser,
  mapPortalUserRow,
  reactivatePortalUser,
  updatePortalUser,
} from '../../services/portalUsers.js';
import { writeAudit } from './writeAudit.js';

const idParams = z.object({ id: z.string().uuid() });

const createUserSchema = z.object({
  email: z.string().email().max(320),
  fullName: z.string().min(2).max(100),
  role: z.enum(INVITE_PORTAL_ROLES),
  schoolId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  role: z.enum(INVITE_PORTAL_ROLES).optional(),
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

async function mapPortalUserWithMfa(u: Parameters<typeof mapPortalUserRow>[0]) {
  const [mfaEnrolled, unusedRecoveryCodes] = await Promise.all([
    isMfaEnrolled(u.id),
    countUnusedRecoveryCodes(u.id),
  ]);
  return {
    ...mapPortalUserRow(u, mfaEnrolled),
    unusedRecoveryCodes,
  };
}

function assertMutablePortalTarget(userId: string, role: string) {
  if (isSuperAdmin(role)) {
    throw new AppError(403, 'Super admin accounts are managed outside the Team page', 'FORBIDDEN');
  }
}

export default async function adminUserRoutes(app: FastifyInstance) {
  /** List portal users — super admin only. */
  app.get('/', { preHandler: requireSuperAdmin }, async () => {
    const rows = await prisma.user.findMany({
      where: {
        role: { in: [...PORTAL_DIRECTORY_ROLES] },
      },
      orderBy: [{ deletedAt: 'asc' }, { role: 'asc' }, { fullName: 'asc' }],
      select: portalUserSelect,
    });

    const users = await Promise.all(rows.map((row) => mapPortalUserWithMfa(row)));
    return { users };
  });

  /** Create a portal user with a one-time temporary password. */
  app.post('/', { preHandler: requireSuperAdmin }, async (request, reply) => {
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

  app.post('/:id/deactivate', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    if (id === actorId) {
      throw new AppError(400, 'You cannot deactivate your own account', 'BAD_REQUEST');
    }

    const target = await getPortalUser(id);
    assertMutablePortalTarget(id, target.role);

    await deactivatePortalUser(id);
    await writeAudit(actorId, 'admin_portal_user_deactivated', { userId: id });

    return { deactivated: true, userId: id };
  });

  app.post('/:id/reactivate', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    await reactivatePortalUser(id);
    await writeAudit(actorId, 'admin_portal_user_reactivated', { userId: id });

    const user = await getPortalUser(id);
    return mapPortalUserWithMfa(user);
  });

  /** Reset MFA — super admin only; never for super admin accounts. */
  app.post('/:id/mfa/reset', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const actorId = request.user!.id;

    if (id === actorId) {
      throw new AppError(400, 'You cannot reset your own MFA from the Team page', 'BAD_REQUEST');
    }

    const target = await getPortalUser(id);
    assertMutablePortalTarget(id, target.role);

    const result = await resetUserMfa(id);

    await writeAudit(actorId, 'admin_mfa_reset', {
      userId: id,
      removedFactors: result.removedFactors,
    });

    return { reset: true, removedFactors: result.removedFactors };
  });

  app.get('/:id', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const user = await getPortalUser(id);
    return mapPortalUserWithMfa(user);
  });

  app.patch('/:id', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const actorId = request.user!.id;

    const existing = await getPortalUser(id);
    assertMutablePortalTarget(id, existing.role);

    const user = await updatePortalUser(id, body);

    await writeAudit(actorId, 'admin_portal_user_updated', {
      userId: id,
      role: user.role,
    });

    return mapPortalUserWithMfa(user);
  });
}
