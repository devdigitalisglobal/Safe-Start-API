import { z } from 'zod';

export const MIN_COHORT_SIZE = 5;

export const dashboardFiltersSchema = z.object({
  schoolId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export function attemptCompletedRange(filters: DashboardFilters) {
  if (!filters.from && !filters.to) return undefined;
  return dateRange(filters);
}

export function dateRange(filters: DashboardFilters) {
  if (!filters.from && !filters.to) return undefined;
  return {
    ...(filters.from ? { gte: filters.from } : {}),
    ...(filters.to ? { lte: filters.to } : {}),
  };
}

/** Calendar-month window for MAU — uses `to` filter or current month. */
export function mauWindow(filters: DashboardFilters) {
  const anchor = filters.to ?? new Date();
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

import type { DashboardScope } from '../middleware/scope.js';

export function studentWhere(scope: DashboardScope) {
  if (scope.partnerId) {
    return {
      deletedAt: null,
      role: 'student' as const,
      school: {
        partnerId: scope.partnerId,
        status: 'active' as const,
        ...(scope.schoolId ? { id: scope.schoolId } : {}),
      },
    };
  }

  return {
    deletedAt: null,
    role: 'student' as const,
    ...(scope.schoolId ? { schoolId: scope.schoolId } : {}),
  };
}

export function isSmallSchoolCohort(scope: DashboardScope, studentCount: number) {
  return scope.schoolId !== undefined && studentCount < MIN_COHORT_SIZE;
}

export type SuppressedValue<T> =
  | { suppressed: false; studentCount: number; value: T }
  | { suppressed: true; studentCount: number; reason: string; value: null };

export function maybeSuppress<T>(
  studentCount: number,
  value: T
): SuppressedValue<T> {
  if (studentCount < MIN_COHORT_SIZE) {
    return {
      suppressed: true,
      studentCount,
      reason: `Fewer than ${MIN_COHORT_SIZE} students in this cohort — figure withheld to protect privacy.`,
      value: null,
    };
  }
  return { suppressed: false, studentCount, value };
}

export function roundPct(correct: number, total: number) {
  if (total === 0) return null;
  return Math.round((correct / total) * 100);
}

export function average(nums: (number | null)[]) {
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}
