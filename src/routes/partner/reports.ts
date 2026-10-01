import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requirePartnerScope } from '../../middleware/partnerApi.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import {
  assertPartnerSchoolAccess,
  partnerInvitationWhere,
  partnerSchoolWhere,
  partnerStudentWhere,
} from '../../partner/scope.js';
import {
  dashboardFiltersSchema,
  dateRange,
  maybeSuppress,
  MIN_COHORT_SIZE,
  mauWindow,
} from '../../dashboard/metrics.js';

const partnerFiltersSchema = dashboardFiltersSchema.omit({ schoolId: true }).extend({
  schoolId: z.string().uuid().optional(),
});

export default async function partnerReportRoutes(app: FastifyInstance) {
  const reportGuard = [
    rateLimit({ keyPrefix: 'partner-reports', limit: 120, windowMs: 60_000 }),
    requirePartnerScope('reports:read'),
  ];

  app.get('/reports/reach', { preHandler: reportGuard }, async (request) => {
    const partnerId = request.partnerApi!.partnerId;
    const filters = partnerFiltersSchema.parse(request.query);
    if (filters.schoolId) await assertPartnerSchoolAccess(partnerId, filters.schoolId);

    const range = dateRange(filters);
    const { start: mauStart, end: mauEnd } = mauWindow(filters);
    const studentScope = partnerStudentWhere(partnerId, filters);
    const registeredWhere = {
      ...studentScope,
      ...(range ? { registeredAt: range } : {}),
    };

    const partnerSchoolIds = filters.schoolId
      ? [filters.schoolId]
      : (
          await prisma.school.findMany({
            where: partnerSchoolWhere(partnerId),
            select: { id: true },
          })
        ).map((school) => school.id);

    const [
      registeredUsers,
      totalStudentsInScope,
      schoolsParticipating,
      invitationsSent,
      invitationsAccepted,
      mauFromActivity,
      mauFromSessions,
    ] = await Promise.all([
      prisma.user.count({ where: registeredWhere }),
      prisma.user.count({ where: studentScope }),
      filters.schoolId
        ? prisma.user.count({ where: studentScope }).then((n) => (n > 0 ? 1 : 0))
        : prisma.school.count({
            where: {
              ...partnerSchoolWhere(partnerId),
              users: { some: { deletedAt: null, role: 'student' } },
            },
          }),
      prisma.invitation.count({
        where: {
          ...partnerInvitationWhere(partnerId, filters),
          ...(range ? { sentAt: range } : {}),
        },
      }),
      prisma.invitation.count({
        where: {
          ...partnerInvitationWhere(partnerId, filters),
          acceptedAt: { not: null },
          ...(range ? { sentAt: range } : {}),
        },
      }),
      prisma.user.count({
        where: {
          ...studentScope,
          lastActiveAt: { gte: mauStart, lte: mauEnd },
        },
      }),
      partnerSchoolIds.length > 0
        ? prisma.event.groupBy({
            by: ['userId'],
            where: {
              type: 'session_started',
              userId: { not: null },
              occurredAt: { gte: mauStart, lte: mauEnd },
              schoolId: { in: partnerSchoolIds },
            },
          }).then((rows) => rows.length)
        : Promise.resolve(0),
    ]);

    const mau = Math.max(mauFromActivity, mauFromSessions);
    const smallCohort = filters.schoolId !== undefined && totalStudentsInScope < MIN_COHORT_SIZE;

    const inviteCohort = maybeSuppress(
      invitationsSent,
      invitationsSent > 0 ? Math.round((invitationsAccepted / invitationsSent) * 100) : null
    );

    const mauResult = smallCohort
      ? {
          suppressed: true as const,
          studentCount: totalStudentsInScope,
          reason: `Fewer than ${MIN_COHORT_SIZE} students in this cohort — figure withheld to protect privacy.`,
          value: null,
        }
      : { suppressed: false as const, studentCount: totalStudentsInScope, value: mau };

    const registeredResult = smallCohort
      ? {
          suppressed: true as const,
          studentCount: totalStudentsInScope,
          reason: `Fewer than ${MIN_COHORT_SIZE} students in this cohort — figure withheld to protect privacy.`,
          value: null,
        }
      : { suppressed: false as const, studentCount: totalStudentsInScope, value: registeredUsers };

    return {
      version: 'v1',
      filters,
      registeredUsers: {
        count: registeredResult.suppressed ? null : registeredResult.value,
        suppressed: registeredResult.suppressed,
        ...(registeredResult.suppressed ? { reason: registeredResult.reason } : {}),
      },
      schoolsParticipating: { count: schoolsParticipating },
      inviteToRegister: {
        invited: invitationsSent,
        registered: invitationsAccepted,
        conversionPercent: inviteCohort.suppressed ? null : inviteCohort.value,
        suppressed: inviteCohort.suppressed,
        ...(inviteCohort.suppressed ? { reason: inviteCohort.reason } : {}),
      },
      monthlyActiveUsers: {
        period: { from: mauStart.toISOString(), to: mauEnd.toISOString() },
        count: mauResult.suppressed ? null : mauResult.value,
        suppressed: mauResult.suppressed,
        ...(mauResult.suppressed ? { reason: mauResult.reason } : {}),
      },
    };
  });

  app.get('/reports/improvement', { preHandler: reportGuard }, async (request) => {
    const filters = partnerFiltersSchema.parse(request.query);
    if (filters.schoolId) {
      await assertPartnerSchoolAccess(request.partnerApi!.partnerId, filters.schoolId);
    }

    return {
      version: 'v1',
      filters,
      studentCount: 0,
      suppressed: true,
      reason: 'Starting Grid and Finish Line assessments are no longer part of this program.',
      overall: null,
      knowledgeAreas: null,
    };
  });
}
