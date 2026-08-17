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
  attemptCompletedRange,
  average,
  dashboardFiltersSchema,
  dateRange,
  maybeSuppress,
  MIN_COHORT_SIZE,
  mauWindow,
  roundPct,
} from '../../dashboard/metrics.js';

type AreaScores = Map<string, { correct: number; total: number }>;

const partnerFiltersSchema = dashboardFiltersSchema.omit({ schoolId: true }).extend({
  schoolId: z.string().uuid().optional(),
});

async function scoresByKnowledgeAreaForAttempts(attemptIds: string[]) {
  if (attemptIds.length === 0) return new Map<string, AreaScores>();

  const answers = await prisma.assessmentAnswer.findMany({
    where: { attemptId: { in: attemptIds } },
    select: { attemptId: true, knowledgeAreaId: true, isCorrect: true },
  });

  const byAttempt = new Map<string, AreaScores>();
  for (const a of answers) {
    let byArea = byAttempt.get(a.attemptId);
    if (!byArea) {
      byArea = new Map();
      byAttempt.set(a.attemptId, byArea);
    }
    const cur = byArea.get(a.knowledgeAreaId) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (a.isCorrect) cur.correct += 1;
    byArea.set(a.knowledgeAreaId, cur);
  }
  return byAttempt;
}

function pctFromAreaScores(byArea: AreaScores, areaId: string) {
  const s = byArea.get(areaId);
  if (!s) return null;
  return roundPct(s.correct, s.total);
}

async function latestCompletedAttemptsByUser(
  assessmentId: string,
  userIds: string[],
  completedAt?: { gte?: Date; lte?: Date }
) {
  if (userIds.length === 0) return new Map<string, { id: string }>();

  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      assessmentId,
      userId: { in: userIds },
      completedAt: { not: null, ...completedAt },
    },
    select: { id: true, userId: true, completedAt: true },
    orderBy: { completedAt: 'desc' },
  });

  const latest = new Map<string, { id: string }>();
  for (const a of attempts) {
    if (!latest.has(a.userId)) latest.set(a.userId, { id: a.id });
  }
  return latest;
}

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
    const partnerId = request.partnerApi!.partnerId;
    const filters = partnerFiltersSchema.parse(request.query);
    if (filters.schoolId) await assertPartnerSchoolAccess(partnerId, filters.schoolId);

    const completedAt = attemptCompletedRange(filters);

    const [areas, sgAssessment, flAssessment] = await Promise.all([
      prisma.knowledgeArea.findMany({
        orderBy: { orderIndex: 'asc' },
        select: { id: true, key: true, name: true },
      }),
      prisma.assessment.findFirst({
        where: { type: 'starting_grid' },
        select: { id: true },
      }),
      prisma.assessment.findFirst({
        where: { type: 'finish_line' },
        select: { id: true },
      }),
    ]);

    if (!sgAssessment || !flAssessment) {
      return {
        version: 'v1',
        filters,
        studentCount: 0,
        suppressed: true,
        reason: 'Assessments not configured',
        overall: null,
        knowledgeAreas: null,
      };
    }

    const students = await prisma.user.findMany({
      where: partnerStudentWhere(partnerId, filters),
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);

    const [sgByUser, flByUser] = await Promise.all([
      latestCompletedAttemptsByUser(sgAssessment.id, studentIds, completedAt),
      latestCompletedAttemptsByUser(flAssessment.id, studentIds, completedAt),
    ]);

    const pairedUserIds = studentIds.filter((id) => sgByUser.has(id) && flByUser.has(id));
    const cohort = maybeSuppress(pairedUserIds.length, true);

    if (cohort.suppressed) {
      return {
        version: 'v1',
        filters,
        studentCount: cohort.studentCount,
        suppressed: true,
        reason: cohort.reason,
        overall: null,
        knowledgeAreas: null,
      };
    }

    const sgAttemptIds = pairedUserIds.map((id) => sgByUser.get(id)!.id);
    const flAttemptIds = pairedUserIds.map((id) => flByUser.get(id)!.id);

    const [sgScoresByAttempt, flScoresByAttempt, attemptMeta] = await Promise.all([
      scoresByKnowledgeAreaForAttempts(sgAttemptIds),
      scoresByKnowledgeAreaForAttempts(flAttemptIds),
      prisma.assessmentAttempt.findMany({
        where: { id: { in: [...sgAttemptIds, ...flAttemptIds] } },
        select: { id: true, totalScore: true, totalQuestions: true },
      }),
    ]);

    const metaById = new Map(attemptMeta.map((a) => [a.id, a]));

    const userAreaPcts: {
      sg: Map<string, number | null>;
      fl: Map<string, number | null>;
      sgOverall: number | null;
      flOverall: number | null;
    }[] = [];

    for (const userId of pairedUserIds) {
      const sgAttemptId = sgByUser.get(userId)!.id;
      const flAttemptId = flByUser.get(userId)!.id;
      const sgScores = sgScoresByAttempt.get(sgAttemptId) ?? new Map();
      const flScores = flScoresByAttempt.get(flAttemptId) ?? new Map();
      const sgAttempt = metaById.get(sgAttemptId);
      const flAttempt = metaById.get(flAttemptId);

      const sgAreas = new Map<string, number | null>();
      const flAreas = new Map<string, number | null>();
      for (const area of areas) {
        sgAreas.set(area.id, pctFromAreaScores(sgScores, area.id));
        flAreas.set(area.id, pctFromAreaScores(flScores, area.id));
      }

      userAreaPcts.push({
        sg: sgAreas,
        fl: flAreas,
        sgOverall:
          sgAttempt?.totalScore != null && sgAttempt.totalQuestions
            ? roundPct(sgAttempt.totalScore, sgAttempt.totalQuestions)
            : null,
        flOverall:
          flAttempt?.totalScore != null && flAttempt.totalQuestions
            ? roundPct(flAttempt.totalScore, flAttempt.totalQuestions)
            : null,
      });
    }

    const knowledgeAreas = areas.map((area) => {
      const sgPct = average(userAreaPcts.map((u) => u.sg.get(area.id) ?? null));
      const flPct = average(userAreaPcts.map((u) => u.fl.get(area.id) ?? null));
      return {
        key: area.key,
        name: area.name,
        startingGrid: sgPct,
        finishLine: flPct,
        improvement: sgPct != null && flPct != null ? flPct - sgPct : null,
      };
    });

    const overallSg = average(userAreaPcts.map((u) => u.sgOverall));
    const overallFl = average(userAreaPcts.map((u) => u.flOverall));

    return {
      version: 'v1',
      filters,
      studentCount: pairedUserIds.length,
      suppressed: false,
      overall: {
        startingGrid: overallSg,
        finishLine: overallFl,
        improvement: overallSg != null && overallFl != null ? overallFl - overallSg : null,
      },
      knowledgeAreas,
    };
  });
}
