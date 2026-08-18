import type { FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { assertPartnerSchoolAccess } from '../partner/scope.js';
import { AppError } from './errors.js';

/** Dashboard / reporting query scope — never build filters from raw query params alone. */
export type DashboardScope = {
  schoolId?: string;
  partnerId?: string;
};

/**
 * Resolves the school/partner filter this user is permitted to query.
 * Validates partner school access when a specific school is requested.
 */
export async function resolveDashboardScope(
  request: FastifyRequest,
  requestedSchoolId?: string
): Promise<DashboardScope> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Not authenticated', 'NO_TOKEN');

  if (user.role === 'staff' || user.role === 'super_admin') {
    return requestedSchoolId ? { schoolId: requestedSchoolId } : {};
  }

  if (user.role === 'partner') {
    if (!user.partnerId) {
      throw new AppError(403, 'Partner account is not linked to an organisation', 'NO_PARTNER');
    }
    if (requestedSchoolId) {
      await assertPartnerSchoolAccess(user.partnerId, requestedSchoolId);
      return { partnerId: user.partnerId, schoolId: requestedSchoolId };
    }
    return { partnerId: user.partnerId };
  }

  if (!user.schoolId) {
    throw new AppError(403, 'Not linked to a school', 'NO_SCHOOL');
  }

  if (requestedSchoolId && requestedSchoolId !== user.schoolId) {
    throw new AppError(403, 'Cannot access another school', 'FORBIDDEN');
  }

  return { schoolId: user.schoolId };
}

/** @deprecated Use resolveDashboardScope — sync helper kept for non-partner paths if needed. */
export function schoolFilter(
  request: FastifyRequest,
  requestedSchoolId?: string
): DashboardScope {
  const user = request.user;
  if (!user) throw new AppError(401, 'Not authenticated', 'NO_TOKEN');

  if (user.role === 'staff' || user.role === 'super_admin') {
    return requestedSchoolId ? { schoolId: requestedSchoolId } : {};
  }

  if (user.role === 'partner') {
    if (!user.partnerId) {
      throw new AppError(403, 'Partner account is not linked to an organisation', 'NO_PARTNER');
    }
    if (requestedSchoolId) {
      throw new AppError(
        400,
        'Partner scope requires async validation — use resolveDashboardScope',
        'BAD_REQUEST'
      );
    }
    return { partnerId: user.partnerId };
  }

  if (!user.schoolId) {
    throw new AppError(403, 'Not linked to a school', 'NO_SCHOOL');
  }

  if (requestedSchoolId && requestedSchoolId !== user.schoolId) {
    throw new AppError(403, 'Cannot access another school', 'FORBIDDEN');
  }

  return { schoolId: user.schoolId };
}

export function invitationWhere(scope: DashboardScope, extra: Record<string, unknown> = {}) {
  if (scope.schoolId) {
    return { schoolId: scope.schoolId, ...extra };
  }
  if (scope.partnerId) {
    return {
      school: { partnerId: scope.partnerId, status: 'active' as const },
      ...extra,
    };
  }
  return extra;
}

export async function eventWhere(scope: DashboardScope, extra: Record<string, unknown> = {}) {
  if (scope.schoolId) {
    return { schoolId: scope.schoolId, ...extra };
  }
  if (scope.partnerId) {
    const schools = await prisma.school.findMany({
      where: {
        partnerId: scope.partnerId,
        status: 'active',
      },
      select: { id: true },
    });
    const schoolIds = schools.map((s) => s.id);
    if (schoolIds.length === 0) {
      return { schoolId: { in: [] as string[] }, ...extra };
    }
    return { schoolId: { in: schoolIds }, ...extra };
  }
  return extra;
}

export function schoolsWithStudentsWhere(scope: DashboardScope) {
  const studentSome = { some: { deletedAt: null, role: 'student' as const } };
  if (scope.schoolId) {
    return {
      id: scope.schoolId,
      status: 'active' as const,
      users: studentSome,
    };
  }
  if (scope.partnerId) {
    return {
      partnerId: scope.partnerId,
      status: 'active' as const,
      users: studentSome,
    };
  }
  return {
    status: 'active' as const,
    users: studentSome,
  };
}
