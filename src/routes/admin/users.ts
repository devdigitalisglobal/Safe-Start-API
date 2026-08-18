import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/errors.js';

/** Team management — Auto Verifi staff only (Phase 1 will add POST/PATCH). */
async function requireStaffOnly(request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  await requireAuth(request, reply);
  if (request.user!.role !== 'staff') {
    throw new AppError(403, 'Staff access denied', 'FORBIDDEN');
  }
}

export default async function adminUserRoutes(app: FastifyInstance) {
  /** List portal users. Phase 1: filters, pagination, MFA flags. */
  app.get('/', { preHandler: requireStaffOnly }, async () => {
    const rows = await prisma.user.findMany({
      where: {
        role: { in: ['staff', 'partner', 'school_admin', 'reviewer'] },
        deletedAt: null,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        schoolId: true,
        lastActiveAt: true,
        registeredAt: true,
        school: { select: { id: true, name: true } },
      },
    });

    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        schoolId: u.schoolId,
        schoolName: u.school?.name ?? null,
        partnerId: null as string | null,
        partnerName: null as string | null,
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
        registeredAt: u.registeredAt.toISOString(),
        mfaEnrolled: null as boolean | null,
        status: 'active' as const,
      })),
    };
  });
}
