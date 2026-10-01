import { prisma } from '../db.js';
import type { DashboardScope } from '../middleware/scope.js';
import { invitationWhere, eventWhere, schoolsWithStudentsWhere } from '../middleware/scope.js';
import {
  average,
  dateRange,
  maybeSuppress,
  MIN_COHORT_SIZE,
  mauWindow,
  roundPct,
  studentWhere,
  isSmallSchoolCohort,
  type DashboardFilters,
} from './metrics.js';
import type { DashboardSharedContext } from './context.js';
import {
  EDUCATION_TYPE_VALUES,
  EDUCATION_TYPE_LABELS,
  LICENCE_STATUS_VALUES,
  LICENCE_STATUS_LABELS,
} from '../users/signupProfile.js';

/** Turn a groupBy result into an ordered, labelled breakdown with an "unknown" bucket for null. */
function buildBreakdown<K extends string>(
  values: readonly K[],
  labels: Record<K, string>,
  rows: { value: string | null; count: number }[]
) {
  const byKey = new Map(rows.map((r) => [r.value, r.count]));
  const items = values.map((key) => ({
    key,
    label: labels[key],
    count: byKey.get(key) ?? 0,
  }));
  return { items, unknown: byKey.get(null) ?? 0 };
}

export async function computeReach(scope: DashboardScope, filters: DashboardFilters) {
  const range = dateRange(filters);
  const { start: mauStart, end: mauEnd } = mauWindow(filters);

  const studentScope = studentWhere(scope);
  const registeredWhere = {
    ...studentScope,
    ...(range ? { registeredAt: range } : {}),
  };
  const eventScope = await eventWhere(scope);

  const [
    registeredUsers,
    totalStudentsInScope,
    schoolsParticipating,
    invitationsSent,
    invitationsAccepted,
    mauFromActivity,
    mauFromSessions,
    educationGroups,
    licenceGroups,
  ] = await Promise.all([
    prisma.user.count({ where: registeredWhere }),
    prisma.user.count({ where: studentScope }),
    scope.schoolId
      ? prisma.user.count({ where: studentScope }).then((n) => (n > 0 ? 1 : 0))
      : prisma.school.count({ where: schoolsWithStudentsWhere(scope) }),
    prisma.invitation.count({
      where: invitationWhere(scope, range ? { sentAt: range } : {}),
    }),
    prisma.invitation.count({
      where: invitationWhere(scope, {
        acceptedAt: { not: null },
        ...(range ? { sentAt: range } : {}),
      }),
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
        ...eventScope,
      },
    }).then((rows) => rows.length),
    prisma.user.groupBy({
      by: ['educationType'],
      where: studentScope,
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['licenceStatus'],
      where: studentScope,
      _count: { _all: true },
    }),
  ]);

  const educationRows = educationGroups.map((g) => ({
    value: g.educationType,
    count: g._count._all,
  }));
  const licenceRows = licenceGroups.map((g) => ({
    value: g.licenceStatus,
    count: g._count._all,
  }));

  const demographicsSuppressed = isSmallSchoolCohort(scope, totalStudentsInScope);
  const demographics = demographicsSuppressed
    ? {
        suppressed: true as const,
        reason: `Fewer than ${MIN_COHORT_SIZE} students in this cohort — breakdown withheld to protect privacy.`,
        educationType: null,
        licenceStatus: null,
      }
    : {
        suppressed: false as const,
        educationType: buildBreakdown(
          EDUCATION_TYPE_VALUES,
          EDUCATION_TYPE_LABELS,
          educationRows
        ),
        licenceStatus: buildBreakdown(
          LICENCE_STATUS_VALUES,
          LICENCE_STATUS_LABELS,
          licenceRows
        ),
      };

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
    demographics,
  };
}

export async function computeEngagement(
  scope: DashboardScope,
  filters: DashboardFilters,
  shared?: DashboardSharedContext
) {
  const range = dateRange(filters);

  let userIds: string[];
  if (shared) {
    userIds = shared.userIds;
  } else {
    const studentScope = studentWhere(scope);
    const students = await prisma.user.findMany({ where: studentScope, select: { id: true } });
    userIds = students.map((s) => s.id);
  }

  const [modules, totalPublishedModules] = await Promise.all([
    prisma.module.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, orderIndex: true, title: true },
    }),
    prisma.module.count({ where: { status: 'published' } }),
  ]);

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
}

const ASSESSMENTS_REMOVED_REASON =
  'Starting Grid and Finish Line assessments are no longer part of this program.';

export async function computeLearning(
  scope: DashboardScope,
  filters: DashboardFilters,
  shared?: DashboardSharedContext
) {
  const studentCount = shared?.studentCount ?? 0;
  return {
    filters,
    studentCount,
    suppressed: true,
    reason: ASSESSMENTS_REMOVED_REASON,
    scores: null,
    passRate: {
      available: false,
      value: null,
      note: 'No score-based pass mark defined.',
    },
    mostMissed: null,
    reAttempt: null,
  };
}
export async function computeImprovement(
  _scope: DashboardScope,
  filters: DashboardFilters,
  shared?: DashboardSharedContext
) {
  const studentCount = shared?.studentCount ?? 0;
  return {
    filters,
    studentCount,
    suppressed: true,
    reason: ASSESSMENTS_REMOVED_REASON,
    overall: null,
    knowledgeAreas: null,
  };
}