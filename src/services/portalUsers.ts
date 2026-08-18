import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { supabaseAdmin } from '../storage.js';
import { AppError } from '../middleware/errors.js';
import { INVITE_PORTAL_ROLES, PORTAL_DIRECTORY_ROLES, type InvitePortalRole } from '../lib/roles.js';

/** @deprecated Use INVITE_PORTAL_ROLES — super_admin is never invited via API. */
export const PORTAL_ROLES = INVITE_PORTAL_ROLES;
export type PortalRole = InvitePortalRole;

export type CreatePortalUserInput = {
  email: string;
  fullName: string;
  role: PortalRole;
  schoolId?: string | null;
  partnerId?: string | null;
};

export type UpdatePortalUserInput = {
  fullName?: string;
  role?: PortalRole;
  schoolId?: string | null;
  partnerId?: string | null;
};

function generateTempPassword() {
  return randomBytes(18).toString('base64url').slice(0, 24);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePortalUserScopes(
  role: PortalRole,
  schoolId?: string | null,
  partnerId?: string | null
) {
  if (role === 'school_admin' && !schoolId) {
    throw new AppError(400, 'School admin requires a school', 'BAD_REQUEST');
  }
  if (role === 'partner' && !partnerId) {
    throw new AppError(400, 'Partner user requires a partner organisation', 'BAD_REQUEST');
  }
  if (role === 'staff' || role === 'reviewer') {
    if (schoolId) {
      throw new AppError(400, 'Staff and reviewer accounts cannot be linked to a school', 'BAD_REQUEST');
    }
    if (partnerId) {
      throw new AppError(400, 'Staff and reviewer accounts cannot be linked to a partner', 'BAD_REQUEST');
    }
  }
}

async function assertSchoolExists(schoolId: string) {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, status: true },
  });
  if (!school) throw new AppError(400, 'Invalid school', 'BAD_REQUEST');
  if (school.status !== 'active') {
    throw new AppError(400, 'School is not active', 'BAD_REQUEST');
  }
}

async function assertPartnerExists(partnerId: string) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, status: true },
  });
  if (!partner) throw new AppError(400, 'Invalid partner', 'BAD_REQUEST');
  if (partner.status !== 'active') {
    throw new AppError(400, 'Partner is not active', 'BAD_REQUEST');
  }
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new AppError(502, 'Could not verify auth account', 'AUTH_LOOKUP_FAILED');
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

export async function createPortalUser(input: CreatePortalUserInput) {
  const email = normalizeEmail(input.email);
  validatePortalUserScopes(input.role, input.schoolId, input.partnerId);

  if (input.schoolId) await assertSchoolExists(input.schoolId);
  if (input.partnerId) await assertPartnerExists(input.partnerId);

  const existingProfile = await prisma.user.findUnique({ where: { email } });
  if (existingProfile && !existingProfile.deletedAt) {
    throw new AppError(409, 'A user with this email already exists', 'DUPLICATE');
  }

  const temporaryPassword = generateTempPassword();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() },
  });

  let authId = created.user?.id ?? null;

  if (createError) {
    authId = await findAuthUserIdByEmail(email);
    if (!authId) {
      throw new AppError(502, createError.message, 'AUTH_CREATE_FAILED');
    }
  }

  if (!authId) {
    throw new AppError(502, 'Auth user id missing after create', 'AUTH_CREATE_FAILED');
  }

  const schoolId = input.role === 'school_admin' ? input.schoolId! : null;
  const partnerId = input.role === 'partner' ? input.partnerId! : null;

  const user = await prisma.user.upsert({
    where: { id: authId },
    create: {
      id: authId,
      email,
      fullName: input.fullName.trim(),
      role: input.role,
      schoolId,
      partnerId,
      consentVersion: 'portal-provisioned',
      registeredAt: new Date(),
      deletedAt: null,
    },
    update: {
      email,
      fullName: input.fullName.trim(),
      role: input.role,
      schoolId,
      partnerId,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      schoolId: true,
      partnerId: true,
      registeredAt: true,
      lastActiveAt: true,
      deletedAt: true,
      school: { select: { name: true } },
      partner: { select: { name: true } },
    },
  });

  return { user, temporaryPassword: createError ? null : temporaryPassword };
}

export async function getPortalUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      schoolId: true,
      partnerId: true,
      registeredAt: true,
      lastActiveAt: true,
      deletedAt: true,
      school: { select: { id: true, name: true } },
      partner: { select: { id: true, name: true } },
    },
  });

  if (!user || !(PORTAL_DIRECTORY_ROLES as readonly string[]).includes(user.role)) {
    throw new AppError(404, 'Portal user not found', 'NOT_FOUND');
  }

  return user;
}

export async function updatePortalUser(userId: string, input: UpdatePortalUserInput) {
  const existing = await getPortalUser(userId);
  const role = input.role ?? (existing.role as PortalRole);
  const schoolId = input.schoolId !== undefined ? input.schoolId : existing.schoolId;
  const partnerId = input.partnerId !== undefined ? input.partnerId : existing.partnerId;

  validatePortalUserScopes(role, schoolId, partnerId);

  if (schoolId) await assertSchoolExists(schoolId);
  if (partnerId) await assertPartnerExists(partnerId);

  const nextSchoolId = role === 'school_admin' ? schoolId : null;
  const nextPartnerId = role === 'partner' ? partnerId : null;

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      schoolId: nextSchoolId,
      partnerId: nextPartnerId,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      schoolId: true,
      partnerId: true,
      registeredAt: true,
      lastActiveAt: true,
      deletedAt: true,
      school: { select: { name: true } },
      partner: { select: { name: true } },
    },
  });
}

export async function deactivatePortalUser(userId: string) {
  await getPortalUser(userId);

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });
  if (error) {
    throw new AppError(502, 'Could not deactivate auth account', 'AUTH_UPDATE_FAILED');
  }
}

export async function reactivatePortalUser(userId: string) {
  await getPortalUser(userId);

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null },
  });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });
  if (error) {
    throw new AppError(502, 'Could not reactivate auth account', 'AUTH_UPDATE_FAILED');
  }
}

export function mapPortalUserRow(
  u: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    schoolId: string | null;
    partnerId: string | null;
    registeredAt: Date;
    lastActiveAt: Date | null;
    deletedAt: Date | null;
    school?: { name: string } | null;
    partner?: { name: string } | null;
  },
  mfaEnrolled: boolean | null = null
) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    schoolId: u.schoolId,
    schoolName: u.school?.name ?? null,
    partnerId: u.partnerId,
    partnerName: u.partner?.name ?? null,
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    registeredAt: u.registeredAt.toISOString(),
    mfaEnrolled,
    status: u.deletedAt ? ('deactivated' as const) : ('active' as const),
  };
}
