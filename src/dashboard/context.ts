import { prisma } from '../db.js';
import type { DashboardScope } from '../middleware/scope.js';
import { studentWhere } from './metrics.js';

export type DashboardSharedContext = {
  userIds: string[];
  studentCount: number;
  sgAssessment: { id: string } | null;
  flAssessment: { id: string } | null;
  knowledgeAreas: { id: string; key: string; name: string }[];
};

/** Loaded once per overview request — shared by engagement, learning, and improvement. */
export async function loadSharedDashboardContext(
  scope: DashboardScope
): Promise<DashboardSharedContext> {
  const studentScope = studentWhere(scope);
  const [students, sgAssessment, flAssessment, knowledgeAreas] = await Promise.all([
    prisma.user.findMany({ where: studentScope, select: { id: true } }),
    prisma.assessment.findFirst({
      where: { type: 'starting_grid' },
      select: { id: true },
    }),
    prisma.assessment.findFirst({
      where: { type: 'finish_line' },
      select: { id: true },
    }),
    prisma.knowledgeArea.findMany({
      orderBy: { orderIndex: 'asc' },
      select: { id: true, key: true, name: true },
    }),
  ]);

  const userIds = students.map((s) => s.id);
  return {
    userIds,
    studentCount: userIds.length,
    sgAssessment,
    flAssessment,
    knowledgeAreas,
  };
}
