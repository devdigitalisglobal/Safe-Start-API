import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.js';
import { AppError } from '../middleware/errors.js';
import { env } from '../env.js';
import { supabaseAdmin } from '../storage.js';

const LEARNER_ROLE = 'student';

export type LearnerStatusFilter = 'active' | 'suspended' | 'deleted';

export type ListLearnersInput = {
  q?: string;
  schoolId?: string;
  status?: LearnerStatusFilter;
  page?: number;
  limit?: number;
};

const learnerListSelect = {
  id: true,
  email: true,
  fullName: true,
  firstName: true,
  lastName: true,
  schoolId: true,
  registeredAt: true,
  lastActiveAt: true,
  deletedAt: true,
  suspendedAt: true,
  suspendedReason: true,
  school: { select: { id: true, name: true } },
} as const;

function passwordResetRedirectTo() {
  return 'https://safestartdrivers.com.au/set-password';
}

export function mapLearnerRow(u: {
  id: string;
  email: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  schoolId: string | null;
  registeredAt: Date;
  lastActiveAt: Date | null;
  deletedAt: Date | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  school?: { id: string; name: string } | null;
}) {
  let status: 'active' | 'suspended' | 'deleted' = 'active';
  if (u.deletedAt) status = 'deleted';
  else if (u.suspendedAt) status = 'suspended';

  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    firstName: u.firstName,
    lastName: u.lastName,
    schoolId: u.schoolId,
    schoolName: u.school?.name ?? null,
    registeredAt: u.registeredAt.toISOString(),
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
    suspendedReason: u.suspendedReason,
    deletedAt: u.deletedAt?.toISOString() ?? null,
    status,
  };
}

/** Load a student profile or 404. */
export async function getLearnerOrThrow(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: LEARNER_ROLE },
    select: learnerListSelect,
  });
  if (!user) {
    throw new AppError(404, 'Learner not found', 'NOT_FOUND');
  }
  return user;
}

export async function listLearners(input: ListLearnersInput) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    role: LEARNER_ROLE,
  };

  if (input.schoolId) {
    where.schoolId = input.schoolId;
  }

  if (input.status === 'active') {
    where.deletedAt = null;
    where.suspendedAt = null;
  } else if (input.status === 'suspended') {
    where.deletedAt = null;
    where.suspendedAt = { not: null };
  } else if (input.status === 'deleted') {
    where.deletedAt = { not: null };
  }

  const q = input.q?.trim();
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ deletedAt: 'asc' }, { suspendedAt: 'asc' }, { registeredAt: 'desc' }],
      skip,
      take: limit,
      select: learnerListSelect,
    }),
  ]);

  return {
    learners: rows.map(mapLearnerRow),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getLearnerDetail(userId: string) {
  const user = await getLearnerOrThrow(userId);

  const [modulesCompleted, modulesInProgress, publishedModuleCount] = await Promise.all([
    prisma.moduleProgress.count({
      where: { userId, status: 'completed' },
    }),
    prisma.moduleProgress.count({
      where: { userId, status: 'in_progress' },
    }),
    prisma.module.count({ where: { status: 'published' } }),
  ]);

  return {
    ...mapLearnerRow(user),
    progress: {
      modulesCompleted,
      modulesInProgress,
      courseCompleted: publishedModuleCount > 0 && modulesCompleted >= publishedModuleCount,
    },
  };
}

export async function revokeLearnerSessions(userId: string) {
  await getLearnerOrThrow(userId);
  const { error } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
  if (error) {
    throw new AppError(502, 'Could not revoke sessions', 'AUTH_UPDATE_FAILED');
  }
}

export async function suspendLearner(userId: string, reason?: string | null) {
  const user = await getLearnerOrThrow(userId);
  if (user.deletedAt) {
    throw new AppError(400, 'Deleted accounts cannot be suspended', 'BAD_REQUEST');
  }
  if (user.suspendedAt) {
    throw new AppError(400, 'Learner is already suspended', 'BAD_REQUEST');
  }

  const trimmed = reason?.trim() || null;
  if (trimmed && trimmed.length > 200) {
    throw new AppError(400, 'Suspension reason must be 200 characters or fewer', 'BAD_REQUEST');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      suspendedAt: new Date(),
      suspendedReason: trimmed,
    },
  });

  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });
  if (banError) {
    throw new AppError(502, 'Could not suspend auth account', 'AUTH_UPDATE_FAILED');
  }

  await supabaseAdmin.auth.admin.signOut(userId, 'global').catch(() => {});

  return getLearnerDetail(userId);
}

export async function unsuspendLearner(userId: string) {
  const user = await getLearnerOrThrow(userId);
  if (user.deletedAt) {
    throw new AppError(400, 'Deleted accounts cannot be unsuspended', 'BAD_REQUEST');
  }
  if (!user.suspendedAt) {
    throw new AppError(400, 'Learner is not suspended', 'BAD_REQUEST');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      suspendedAt: null,
      suspendedReason: null,
    },
  });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });
  if (error) {
    throw new AppError(502, 'Could not unsuspend auth account', 'AUTH_UPDATE_FAILED');
  }

  return getLearnerDetail(userId);
}

export async function sendLearnerPasswordReset(userId: string) {
  const user = await getLearnerOrThrow(userId);
  if (user.deletedAt) {
    throw new AppError(400, 'Cannot reset password for a deleted account', 'BAD_REQUEST');
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(user.email, {
    redirectTo: passwordResetRedirectTo(),
  });
  if (error) {
    throw new AppError(502, 'Could not send password reset email', 'AUTH_UPDATE_FAILED');
  }

  return { sent: true, email: user.email };
}

/**
 * Anonymise learner PII and remove Supabase auth — APP 12/13.
 * Used by self-delete and super-admin delete.
 */
export async function anonymiseLearnerAccount(userId: string, options?: { schoolId?: string | null }) {
  const schoolId =
    options?.schoolId !== undefined
      ? options.schoolId
      : (
          await prisma.user.findUnique({
            where: { id: userId },
            select: { schoolId: true },
          })
        )?.schoolId ?? null;

  const anonymisedEmail = `deleted-${randomBytes(16).toString('hex')}@deleted.local`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: anonymisedEmail,
        fullName: 'Deleted user',
        firstName: null,
        lastName: null,
        mobile: null,
        suburb: null,
        state: null,
        educationType: null,
        licenceStatus: null,
        dateOfBirth: null,
        schoolId: null,
        partnerMemberRef: null,
        partnerConsentVersion: null,
        partnerConsentAt: null,
        partnerConsentGranted: null,
        consentVersion: null,
        consentAt: null,
        guardianConsentAt: null,
        invitedAt: null,
        lastActiveAt: null,
        expoPushToken: null,
        suspendedAt: null,
        suspendedReason: null,
      },
    }),
    prisma.event.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.event.create({
      data: {
        type: 'account_deleted',
        schoolId,
        occurredAt: new Date(),
      },
    }),
  ]);

  const authDelete = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!authDelete.ok) {
    throw new AppError(
      502,
      'Account deletion could not be completed. Please contact support.',
      'AUTH_DELETE_FAILED'
    );
  }
}

export async function deleteLearnerByAdmin(userId: string) {
  const user = await getLearnerOrThrow(userId);
  if (user.deletedAt) {
    throw new AppError(400, 'Learner is already deleted', 'BAD_REQUEST');
  }

  await anonymiseLearnerAccount(userId, { schoolId: user.schoolId });
  return { deleted: true, userId };
}
