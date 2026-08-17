import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.js';
import { AppError } from '../middleware/errors.js';

export type PartnerReportFilters = {
  schoolId?: string;
};

export async function assertPartnerSchoolAccess(partnerId: string, schoolId: string) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, partnerId, status: 'active' },
    select: { id: true },
  });
  if (!school) {
    throw new AppError(403, 'School is not linked to this partner', 'FORBIDDEN');
  }
}

export function partnerStudentWhere(
  partnerId: string,
  filters: PartnerReportFilters = {}
): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    role: 'student',
    school: {
      partnerId,
      status: 'active',
      ...(filters.schoolId ? { id: filters.schoolId } : {}),
    },
  };
}

export function partnerSchoolWhere(partnerId: string, filters: PartnerReportFilters = {}) {
  return {
    partnerId,
    status: 'active' as const,
    ...(filters.schoolId ? { id: filters.schoolId } : {}),
  };
}

export function partnerInvitationWhere(partnerId: string, filters: PartnerReportFilters = {}) {
  return {
    school: partnerSchoolWhere(partnerId, filters),
  };
}
