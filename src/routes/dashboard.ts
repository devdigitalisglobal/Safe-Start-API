import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { requireDashboardAccess } from '../middleware/dashboard.js';
import { AppError } from '../middleware/errors.js';
import { schoolFilter } from '../middleware/scope.js';
import { buildDashboardCsv, buildDashboardPdfHtml } from '../dashboard/export.js';
import { launchPdfBrowser } from '../dashboard/puppeteer.js';
import {
  attemptCompletedRange,
  average,
  dashboardFiltersSchema,
  dateRange,
  maybeSuppress,
  MIN_COHORT_SIZE,
  mauWindow,
  roundPct,
  studentWhere,
  isSmallSchoolCohort,
} from '../dashboard/metrics.js';

type AreaScores = Map<string, { correct: number; total: number }>;

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

async function fetchDashboardJson(
  request: FastifyRequest,
  section: 'improvement' | 'reach' | 'engagement' | 'learning'
) {
  const auth = request.headers.authorization;
  if (!auth) throw new AppError(401, 'Missing authorization header', 'NO_TOKEN');

  const query = new URLSearchParams(
    Object.entries(request.query as Record<string, string>).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  ).toString();

  const response = await request.server.inject({
    method: 'GET',
    url: `/dashboard/${section}${query ? `?${query}` : ''}`,
    headers: { authorization: auth },
  });

  if (response.statusCode >= 400) {
    throw new AppError(response.statusCode, 'Failed to load export data', 'EXPORT_FAILED');
  }

  return JSON.parse(response.payload);
}

export default async function dashboardRoutes(app: FastifyInstance) {
  /** Schools list for dashboard filter (scoped by role). */
  app.get('/schools', { preHandler: requireDashboardAccess }, async (request) => {
    const user = request.user!;

    if (user.role === 'school_admin') {
      if (!user.schoolId) return { schools: [] };
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { id: true, name: true },
      });
      return { schools: school ? [school] : [] };
    }

    const schools = await prisma.school.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { schools };
  });

  /**
   * Reach — downloads, registrations, schools, invite conversion, MAU.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/reach', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = schoolFilter(request, filters.schoolId);
    const range = dateRange(filters);
    const { start: mauStart, end: mauEnd } = mauWindow(filters);

    const studentScope = studentWhere(scope);
    const registeredWhere = {
      ...studentScope,
      ...(range ? { registeredAt: range } : {}),
    };

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
      scope.schoolId
        ? prisma.user.count({ where: studentScope }).then((n) => (n > 0 ? 1 : 0))
        : prisma.school.count({
            where: {
              status: 'active',
              users: { some: { deletedAt: null, role: 'student' } },
            },
          }),
      prisma.invitation.count({
        where: {
          ...(scope.schoolId ? { schoolId: scope.schoolId } : {}),
          ...(range ? { sentAt: range } : {}),
        },
      }),
      prisma.invitation.count({
        where: {
          ...(scope.schoolId ? { schoolId: scope.schoolId } : {}),
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
      prisma.event.groupBy({
        by: ['userId'],
        where: {
          type: 'session_started',
          userId: { not: null },
          occurredAt: { gte: mauStart, lte: mauEnd },
          ...(scope.schoolId ? { schoolId: scope.schoolId } : {}),
        },
      }).then((rows) => rows.length),
    ]);

    const mau = Math.max(mauFromActivity, mauFromSessions);
    const smallCohort = scope.schoolId !== undefined && totalStudentsInScope < MIN_COHORT_SIZE;

    const inviteCohort = maybeSuppress(
      invitationsSent,
      invitationsSent > 0
        ? Math.round((invitationsAccepted / invitationsSent) * 100)
        : null
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
      filters,
      appDownloads: {
        available: false,
        value: null,
        note: 'Not measurable in-app — requires App Store Connect / Play Console access (client B6).',
      },
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

  /**
   * Engagement — module starts/completions, completion rate, time, drop-off, popularity.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/engagement', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = schoolFilter(request, filters.schoolId);
    const range = dateRange(filters);

    const studentScope = studentWhere(scope);
    const [students, modules, totalPublishedModules] = await Promise.all([
      prisma.user.findMany({ where: studentScope, select: { id: true } }),
      prisma.module.findMany({
        where: { status: 'published' },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, orderIndex: true, title: true },
      }),
      prisma.module.count({ where: { status: 'published' } }),
    ]);

    const userIds = students.map((s) => s.id);
    const studentCount = userIds.length;
    const smallCohort = isSmallSchoolCohort(scope, studentCount);
    const suppressionReason = `Fewer than ${MIN_COHORT_SIZE} students in this cohort — figure withheld to protect privacy.`;

    if (userIds.length === 0) {
      return {
        filters,
        studentCount: 0,
        suppressed: false,
        summary: {
          modulesStarted: 0,
          modulesCompleted: 0,
          programCompletionRate: null,
          averageModulesPerStudent: null,
          averageTimePerModuleSeconds: null,
        },
        byModule: modules.map((m) => ({
          moduleId: m.id,
          orderIndex: m.orderIndex,
          title: m.title,
          started: 0,
          completed: 0,
        })),
        dropOff: null,
        popularity: { most: null, least: null },
      };
    }

    const progressBase = { userId: { in: userIds } };

    const [startedByModule, completedByModule, avgTime, completedPerUser, lessons, lessonViews] =
      await Promise.all([
        prisma.moduleProgress.groupBy({
          by: ['moduleId'],
          where: {
            ...progressBase,
            status: { in: ['in_progress', 'completed'] },
            ...(range ? { startedAt: range } : {}),
          },
          _count: { _all: true },
        }),
        prisma.moduleProgress.groupBy({
          by: ['moduleId'],
          where: {
            ...progressBase,
            status: 'completed',
            ...(range ? { completedAt: range } : {}),
          },
          _count: { _all: true },
        }),
        prisma.moduleProgress.aggregate({
          where: {
            ...progressBase,
            status: 'completed',
            ...(range ? { completedAt: range } : {}),
          },
          _avg: { timeSpentSeconds: true },
        }),
        prisma.moduleProgress.groupBy({
          by: ['userId'],
          where: {
            ...progressBase,
            status: 'completed',
            ...(range ? { completedAt: range } : {}),
          },
          _count: { moduleId: true },
        }),
        prisma.lesson.findMany({
          where: { module: { status: 'published' } },
          select: {
            id: true,
            orderIndex: true,
            heading: true,
            moduleId: true,
            module: { select: { title: true, orderIndex: true } },
          },
          orderBy: [{ moduleId: 'asc' }, { orderIndex: 'asc' }],
        }),
        prisma.lessonView.groupBy({
          by: ['lessonId'],
          where: {
            userId: { in: userIds },
            ...(range ? { viewedAt: range } : {}),
          },
          _count: { userId: true },
        }),
      ]);

    const startsMap = new Map(startedByModule.map((r) => [r.moduleId, r._count._all]));
    const completesMap = new Map(completedByModule.map((r) => [r.moduleId, r._count._all]));
    const viewsMap = new Map(lessonViews.map((v) => [v.lessonId, v._count.userId]));

    const modulesStarted = startedByModule.reduce((sum, r) => sum + r._count._all, 0);
    const modulesCompleted = completedByModule.reduce((sum, r) => sum + r._count._all, 0);

    const fullyCompleteUsers = completedPerUser.filter(
      (r) => r._count.moduleId >= totalPublishedModules
    ).length;

    const byModule = modules.map((m) => ({
      moduleId: m.id,
      orderIndex: m.orderIndex,
      title: m.title,
      started: startsMap.get(m.id) ?? 0,
      completed: completesMap.get(m.id) ?? 0,
    }));

    // Largest step-to-step drop within any module (drop-off point).
    let dropOff: {
      moduleTitle: string;
      moduleOrderIndex: number;
      lessonHeading: string;
      stepIndex: number;
      viewsAtStep: number;
      viewsAtNextStep: number;
      dropCount: number;
      dropPercent: number;
    } | null = null;

    const lessonsByModule = new Map<string, typeof lessons>();
    for (const lesson of lessons) {
      const list = lessonsByModule.get(lesson.moduleId) ?? [];
      list.push(lesson);
      lessonsByModule.set(lesson.moduleId, list);
    }

    for (const [, moduleLessons] of lessonsByModule) {
      const sorted = [...moduleLessons].sort((a, b) => a.orderIndex - b.orderIndex);
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const viewsAtStep = viewsMap.get(current.id) ?? 0;
        const viewsAtNextStep = viewsMap.get(next.id) ?? 0;
        const dropCount = viewsAtStep - viewsAtNextStep;
        if (dropCount <= 0) continue;
        const dropPercent = viewsAtStep > 0 ? Math.round((dropCount / viewsAtStep) * 100) : 0;
        if (!dropOff || dropCount > dropOff.dropCount) {
          dropOff = {
            moduleTitle: current.module.title,
            moduleOrderIndex: current.module.orderIndex,
            lessonHeading: current.heading,
            stepIndex: current.orderIndex,
            viewsAtStep,
            viewsAtNextStep,
            dropCount,
            dropPercent,
          };
        }
      }
    }

    const ranked = [...byModule].sort((a, b) => b.started - a.started);
    const popularity = {
      most: ranked[0]?.started ? ranked[0] : null,
      least: ranked.length ? ranked[ranked.length - 1] : null,
    };

    const summary = {
      modulesStarted,
      modulesCompleted,
      programCompletionRate: roundPct(fullyCompleteUsers, studentCount),
      averageModulesPerStudent:
        studentCount > 0 ? Math.round((modulesCompleted / studentCount) * 10) / 10 : null,
      averageTimePerModuleSeconds: avgTime._avg.timeSpentSeconds
        ? Math.round(avgTime._avg.timeSpentSeconds)
        : null,
    };

    if (smallCohort) {
      return {
        filters,
        studentCount,
        suppressed: true,
        reason: suppressionReason,
        summary: null,
        byModule: null,
        dropOff: null,
        popularity: null,
      };
    }

    return {
      filters,
      studentCount,
      suppressed: false,
      summary,
      byModule,
      dropOff,
      popularity: {
        most: popularity.most
          ? {
              moduleId: popularity.most.moduleId,
              title: popularity.most.title,
              starts: popularity.most.started,
            }
          : null,
        least: popularity.least
          ? {
              moduleId: popularity.least.moduleId,
              title: popularity.least.title,
              starts: popularity.least.started,
            }
          : null,
      },
    };
  });

  /**
   * Learning — pre/post scores, pass rate, most-missed questions, re-attempt rate.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/learning', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = schoolFilter(request, filters.schoolId);
    const completedAt = attemptCompletedRange(filters);
    const startedAt = dateRange(filters);
    const suppressionReason = `Fewer than ${MIN_COHORT_SIZE} students in this cohort — figure withheld to protect privacy.`;

    const studentScope = studentWhere(scope);
    const [students, sgAssessment, flAssessment] = await Promise.all([
      prisma.user.findMany({ where: studentScope, select: { id: true } }),
      prisma.assessment.findFirst({
        where: { type: 'starting_grid' },
        select: { id: true },
      }),
      prisma.assessment.findFirst({
        where: { type: 'finish_line' },
        select: { id: true },
      }),
    ]);

    const userIds = students.map((s) => s.id);
    const studentCount = userIds.length;
    const smallCohort = isSmallSchoolCohort(scope, studentCount);

    const passRate = {
      available: false,
      value: null,
      note: 'No score-based pass mark defined (assumption A4; client decision pending B5).',
    };

    if (!sgAssessment || !flAssessment) {
      return {
        filters,
        studentCount,
        suppressed: true,
        reason: 'Assessments not configured',
        scores: null,
        passRate,
        mostMissed: null,
        reAttempt: null,
      };
    }

    if (userIds.length === 0) {
      return {
        filters,
        studentCount: 0,
        suppressed: false,
        scores: {
          suppressed: false,
          studentCount: 0,
          startingGrid: null,
          finishLine: null,
          improvement: null,
          pairedStudents: 0,
        },
        passRate,
        mostMissed: { suppressed: false, studentCount: 0, questions: [] },
        reAttempt: {
          studentsStarted: 0,
          studentsWithReAttempt: 0,
          ratePercent: null,
          byAssessment: [],
        },
      };
    }

    const [sgByUser, flByUser, startedUsers, reAttemptUsers, reAttemptByAssessment] =
      await Promise.all([
        latestCompletedAttemptsByUser(sgAssessment.id, userIds, completedAt),
        latestCompletedAttemptsByUser(flAssessment.id, userIds, completedAt),
        prisma.assessmentAttempt.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
            ...(startedAt ? { startedAt } : {}),
          },
        }),
        prisma.assessmentAttempt.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
            attemptNumber: { gt: 1 },
            ...(startedAt ? { startedAt } : {}),
          },
        }),
        prisma.assessmentAttempt.groupBy({
          by: ['assessmentId'],
          where: {
            userId: { in: userIds },
            attemptNumber: { gt: 1 },
            ...(startedAt ? { startedAt } : {}),
          },
          _count: { _all: true },
        }),
      ]);

    const pairedUserIds = userIds.filter((id) => sgByUser.has(id) && flByUser.has(id));
    const pairedCohort = maybeSuppress(pairedUserIds.length, true);

    let scores: {
      startingGrid: number | null;
      finishLine: number | null;
      improvement: number | null;
      pairedStudents: number;
    } | null = null;

    if (!pairedCohort.suppressed) {
      const sgAttemptIds = pairedUserIds.map((id) => sgByUser.get(id)!.id);
      const flAttemptIds = pairedUserIds.map((id) => flByUser.get(id)!.id);

      const attemptMeta = await prisma.assessmentAttempt.findMany({
        where: { id: { in: [...sgAttemptIds, ...flAttemptIds] } },
        select: { id: true, totalScore: true, totalQuestions: true },
      });
      const metaById = new Map(attemptMeta.map((a) => [a.id, a]));

      const sgOverall = average(
        pairedUserIds.map((userId) => {
          const attempt = metaById.get(sgByUser.get(userId)!.id);
          return attempt?.totalScore != null && attempt.totalQuestions
            ? roundPct(attempt.totalScore, attempt.totalQuestions)
            : null;
        })
      );
      const flOverall = average(
        pairedUserIds.map((userId) => {
          const attempt = metaById.get(flByUser.get(userId)!.id);
          return attempt?.totalScore != null && attempt.totalQuestions
            ? roundPct(attempt.totalScore, attempt.totalQuestions)
            : null;
        })
      );

      scores = {
        startingGrid: sgOverall,
        finishLine: flOverall,
        improvement:
          sgOverall !== null && flOverall !== null ? flOverall - sgOverall : null,
        pairedStudents: pairedUserIds.length,
      };
    }

    const completedAttempts = await prisma.assessmentAttempt.findMany({
      where: {
        userId: { in: userIds },
        completedAt: { not: null, ...completedAt },
      },
      select: { id: true, userId: true },
    });
    const completedAttemptIds = completedAttempts.map((a) => a.id);
    const studentsWithCompletedAttempts = new Set(completedAttempts.map((a) => a.userId)).size;

    let mostMissed: {
      questionId: string;
      text: string;
      assessmentType: string;
      knowledgeArea: string;
      missCount: number;
      answerCount: number;
      missRatePercent: number;
    }[] | null = null;

    const answersCohort = maybeSuppress(studentsWithCompletedAttempts, true);
    if (!answersCohort.suppressed && completedAttemptIds.length > 0) {
      const [incorrectByQuestion, totalByQuestion] = await Promise.all([
        prisma.assessmentAnswer.groupBy({
          by: ['questionId'],
          where: { attemptId: { in: completedAttemptIds }, isCorrect: false },
          _count: { _all: true },
        }),
        prisma.assessmentAnswer.groupBy({
          by: ['questionId'],
          where: { attemptId: { in: completedAttemptIds } },
          _count: { _all: true },
        }),
      ]);

      const totalMap = new Map(totalByQuestion.map((r) => [r.questionId, r._count._all]));
      const ranked = incorrectByQuestion
        .map((r) => ({
          questionId: r.questionId,
          missCount: r._count._all,
          answerCount: totalMap.get(r.questionId) ?? 0,
        }))
        .filter((r) => r.missCount > 0)
        .sort((a, b) => b.missCount - a.missCount)
        .slice(0, 10);

      if (ranked.length > 0) {
        const questions = await prisma.question.findMany({
          where: { id: { in: ranked.map((r) => r.questionId) } },
          select: {
            id: true,
            text: true,
            knowledgeArea: { select: { name: true } },
            assessment: { select: { type: true } },
          },
        });
        const questionById = new Map(questions.map((q) => [q.id, q]));

        mostMissed = ranked.map((r) => {
          const q = questionById.get(r.questionId);
          return {
            questionId: r.questionId,
            text: q?.text ?? '',
            assessmentType: q?.assessment.type ?? 'unknown',
            knowledgeArea: q?.knowledgeArea.name ?? '',
            missCount: r.missCount,
            answerCount: r.answerCount,
            missRatePercent: roundPct(r.missCount, r.answerCount) ?? 0,
          };
        });
      } else {
        mostMissed = [];
      }
    }

    const assessmentIds = [...new Set(reAttemptByAssessment.map((r) => r.assessmentId))];
    const assessmentTypes =
      assessmentIds.length > 0
        ? await prisma.assessment.findMany({
            where: { id: { in: assessmentIds } },
            select: { id: true, type: true, title: true },
          })
        : [];
    const typeByAssessmentId = new Map(assessmentTypes.map((a) => [a.id, a]));

    const reAttempt = {
      studentsStarted: startedUsers.length,
      studentsWithReAttempt: reAttemptUsers.length,
      ratePercent: roundPct(reAttemptUsers.length, startedUsers.length),
      byAssessment: reAttemptByAssessment.map((r) => {
        const meta = typeByAssessmentId.get(r.assessmentId);
        return {
          assessmentType: meta?.type ?? 'unknown',
          title: meta?.title ?? '',
          reAttempts: r._count._all,
        };
      }),
    };

    if (smallCohort) {
      return {
        filters,
        studentCount,
        suppressed: true,
        reason: suppressionReason,
        scores: null,
        passRate,
        mostMissed: null,
        reAttempt: null,
      };
    }

    const scoresResult = pairedCohort.suppressed
      ? {
          suppressed: true as const,
          studentCount: pairedCohort.studentCount,
          reason: pairedCohort.reason,
          startingGrid: null,
          finishLine: null,
          improvement: null,
          pairedStudents: pairedUserIds.length,
        }
      : {
          suppressed: false as const,
          studentCount: pairedCohort.studentCount,
          ...scores!,
        };

    const mostMissedResult = answersCohort.suppressed
      ? {
          suppressed: true as const,
          studentCount: answersCohort.studentCount,
          reason: answersCohort.reason,
          questions: null,
        }
      : {
          suppressed: false as const,
          studentCount: studentsWithCompletedAttempts,
          questions: mostMissed ?? [],
        };

    return {
      filters,
      studentCount,
      suppressed: false,
      scores: scoresResult,
      passRate,
      mostMissed: mostMissedResult,
      reAttempt,
    };
  });

  /**
   * Hero KPI — program-wide improvement by knowledge area.
   * Aggregate only; never returns student-level rows.
   */
  app.get(
    '/improvement',
    { preHandler: requireDashboardAccess },
    async (request) => {
      const filters = dashboardFiltersSchema.parse(request.query);
      const scope = schoolFilter(request, filters.schoolId);
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
          filters,
          studentCount: 0,
          suppressed: true,
          reason: 'Assessments not configured',
          overall: null,
          knowledgeAreas: null,
        };
      }

      const students = await prisma.user.findMany({
        where: {
          deletedAt: null,
          role: 'student',
          ...scope,
        },
        select: { id: true },
      });
      const studentIds = students.map((s) => s.id);

      const [sgByUser, flByUser] = await Promise.all([
        latestCompletedAttemptsByUser(sgAssessment.id, studentIds, completedAt),
        latestCompletedAttemptsByUser(flAssessment.id, studentIds, completedAt),
      ]);

      // Only students who completed both assessments count toward the cohort.
      const pairedUserIds = studentIds.filter(
        (id) => sgByUser.has(id) && flByUser.has(id)
      );

      const cohort = maybeSuppress(pairedUserIds.length, true);

      if (cohort.suppressed) {
        return {
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
          improvement: sgPct !== null && flPct !== null ? flPct - sgPct : null,
        };
      });

      const sgOverall = average(userAreaPcts.map((u) => u.sgOverall));
      const flOverall = average(userAreaPcts.map((u) => u.flOverall));

      return {
        filters,
        studentCount: cohort.studentCount,
        suppressed: false,
        overall: {
          startingGrid: sgOverall,
          finishLine: flOverall,
          improvement:
            sgOverall !== null && flOverall !== null ? flOverall - sgOverall : null,
        },
        knowledgeAreas,
      };
    }
  );

  /** CSV export — respects active filters and suppression rules. */
  app.get('/export/csv', { preHandler: requireDashboardAccess }, async (request, reply) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const [improvement, reach, engagement, learning] = await Promise.all([
      fetchDashboardJson(request, 'improvement'),
      fetchDashboardJson(request, 'reach'),
      fetchDashboardJson(request, 'engagement'),
      fetchDashboardJson(request, 'learning'),
    ]);

    const csv = buildDashboardCsv({
      filters: {
        schoolId: filters.schoolId,
        from: filters.from?.toISOString().slice(0, 10),
        to: filters.to?.toISOString().slice(0, 10),
      },
      improvement,
      reach,
      engagement,
      learning,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="safe-start-dashboard-${stamp}.csv"`);
    return reply.send(csv);
  });

  /** Branded PDF export — hero KPI layout; respects filters and suppression. */
  app.get('/export/pdf', { preHandler: requireDashboardAccess }, async (request, reply) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const [improvement, reach, engagement] = await Promise.all([
      fetchDashboardJson(request, 'improvement'),
      fetchDashboardJson(request, 'reach'),
      fetchDashboardJson(request, 'engagement'),
    ]);

    const html = buildDashboardPdfHtml({
      filters: {
        schoolId: filters.schoolId,
        from: filters.from?.toISOString().slice(0, 10),
        to: filters.to?.toISOString().slice(0, 10),
      },
      improvement,
      reach,
      engagement,
    });

    const browser = await launchPdfBrowser();

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="safe-start-dashboard-${stamp}.pdf"`);
      return reply.send(pdf);
    } finally {
      await browser.close();
    }
  });
}
