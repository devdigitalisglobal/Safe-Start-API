import { prisma } from '../db.js';
import type { DashboardScope } from '../middleware/scope.js';
import { studentWhere } from './metrics.js';

export type DashboardSharedContext = {
  userIds: string[];
  studentCount: number;
};

/** Loaded once per overview request — shared by engagement and related sections. */
export async function loadSharedDashboardContext(
  scope: DashboardScope
): Promise<DashboardSharedContext> {
  const studentScope = studentWhere(scope);
  const students = await prisma.user.findMany({ where: studentScope, select: { id: true } });

  const userIds = students.map((s) => s.id);
  return {
    userIds,
    studentCount: userIds.length,
  };
}
