import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

/**
 * Returns the school filter this user is permitted to query.
 * Staff and partners see everything; everyone else is locked to their own school.
 *
 * Every school-scoped query must go through this. Never build a where clause
 * directly from a query parameter.
 */
export function schoolFilter(
  request: FastifyRequest,
  requestedSchoolId?: string
): { schoolId?: string } {
  const user = request.user;
  if (!user) throw new AppError(401, 'Not authenticated');

  // Internal staff and partners may query across schools
  if (user.role === 'staff' || user.role === 'super_admin' || user.role === 'partner') {
    return requestedSchoolId ? { schoolId: requestedSchoolId } : {};
  }

  // Everyone else is confined to their own school
  if (!user.schoolId) {
    throw new AppError(403, 'Not linked to a school', 'NO_SCHOOL');
  }

  if (requestedSchoolId && requestedSchoolId !== user.schoolId) {
    throw new AppError(403, 'Cannot access another school', 'FORBIDDEN');
  }

  return { schoolId: user.schoolId };
}