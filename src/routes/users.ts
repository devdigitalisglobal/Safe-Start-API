import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { verifyToken, requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { env } from '../env.js';
import { buildPartnerConsentInfo, PARTNER_CONSENT_VERSION } from '../partners/consent.js';
import { buildFullName, signupProfileFields } from '../users/signupProfile.js';

const createProfileSchema = z.object({
  ...signupProfileFields,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  consentVersion: z.string(),
  inviteCode: z.string().optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
});

const partnerConsentSchema = z.object({
  consentVersion: z.literal(PARTNER_CONSENT_VERSION),
  granted: z.boolean(),
  memberRef: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers or hyphens only')
    .max(30)
    .optional(),
});

export default async function userRoutes(app: FastifyInstance) {
  /** Create the profile after Supabase signup. */
  app.post('/me', {
    preHandler: [
      rateLimit({ keyPrefix: 'register', limit: 5, windowMs: 60_000 }),
      verifyToken,
    ],
  }, async (request, reply) => {
    const body = createProfileSchema.parse(request.body);
    const authId = request.authId!;
    const email = request.authEmail;

    if (!email) throw new AppError(400, 'Token missing email claim');

    const existing = await prisma.user.findUnique({ where: { id: authId } });
    if (existing) throw new AppError(409, 'Profile already exists', 'DUPLICATE');

    let schoolId: string | null = null;
    let invitedAt: Date | null = null;

    if (body.inviteCode) {
      const school = await prisma.school.findUnique({
        where: { inviteCode: body.inviteCode.toUpperCase() },
      });
      if (!school) throw new AppError(400, 'Invalid invite code', 'BAD_CODE');
      if (school.status !== 'active') throw new AppError(400, 'This school is not active');

      schoolId = school.id;

      const invitation = await prisma.invitation.findFirst({
        where: { schoolId: school.id, email, acceptedAt: null },
      });
      if (invitation) {
        invitedAt = invitation.sentAt;
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      }
    }

    const dob = new Date(body.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw new AppError(400, 'Invalid date of birth');

    const age = Math.floor((Date.now() - dob.getTime()) / 31557600000);
    if (age < 13) throw new AppError(400, 'You must be at least 13 to use this app', 'TOO_YOUNG');
    if (age > 120) throw new AppError(400, 'Invalid date of birth');

    const user = await prisma.user.create({
      data: {
        id: authId,
        email,
        fullName: buildFullName(body.firstName, body.lastName),
        firstName: body.firstName,
        lastName: body.lastName,
        mobile: body.mobile,
        suburb: body.suburb,
        state: body.state,
        dateOfBirth: dob,
        schoolId,
        invitedAt,
        consentVersion: body.consentVersion,
        consentAt: new Date(),
        role: 'student',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        lastName: true,
        mobile: true,
        suburb: true,
        state: true,
        role: true,
        schoolId: true,
        registeredAt: true,
      },
    });

    await prisma.event.create({
      data: { userId: user.id, schoolId, type: 'user_registered' },
    });

    return reply.status(201).send(user);
  });

  /** Current profile. */
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        lastName: true,
        mobile: true,
        suburb: true,
        state: true,
        dateOfBirth: true,
        role: true,
        registeredAt: true,
        partnerMemberRef: true,
        partnerConsentVersion: true,
        partnerConsentAt: true,
        partnerConsentGranted: true,
        school: {
          select: {
            id: true,
            name: true,
            partner: {
              select: { id: true, name: true, slug: true, isDefault: true, status: true },
            },
          },
        },
      },
    });

    if (!user) throw new AppError(404, 'Profile not found', 'NO_PROFILE');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      suburb: user.suburb,
      state: user.state,
      dateOfBirth: user.dateOfBirth,
      role: user.role,
      registeredAt: user.registeredAt?.toISOString() ?? null,
      schoolId: user.school?.id ?? null,
      school: user.school ? { id: user.school.id, name: user.school.name } : null,
      partnerConsent: buildPartnerConsentInfo(user),
    };
  });

  /** Record explicit partner data-sharing consent (e.g. NRMA member linkage). */
  app.post('/me/partner-consent', { preHandler: requireAuth }, async (request) => {
    const body = partnerConsentSchema.parse(request.body);
    const userId = request.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        partnerConsentAt: true,
        schoolId: true,
        school: {
          select: {
            partner: {
              select: { id: true, name: true, slug: true, isDefault: true, status: true },
            },
          },
        },
      },
    });

    if (!user) throw new AppError(404, 'Profile not found', 'NO_PROFILE');
    if (user.partnerConsentAt) {
      throw new AppError(409, 'Partner consent already recorded', 'DUPLICATE');
    }

    const partner = user.school?.partner;
    if (!partner || partner.isDefault || partner.status !== 'active') {
      throw new AppError(400, 'Your school is not linked to a co-branding partner', 'BAD_REQUEST');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        partnerConsentVersion: body.consentVersion,
        partnerConsentAt: new Date(),
        partnerConsentGranted: body.granted,
        partnerMemberRef: body.granted ? (body.memberRef ?? null) : null,
      },
      select: {
        partnerMemberRef: true,
        partnerConsentVersion: true,
        partnerConsentAt: true,
        partnerConsentGranted: true,
        school: {
          select: {
            partner: {
              select: { id: true, name: true, slug: true, isDefault: true, status: true },
            },
          },
        },
      },
    });

    await prisma.event.create({
      data: {
        userId,
        schoolId: user.schoolId,
        type: 'partner_consent_recorded',
        payload: {
          partnerId: partner.id,
          partnerSlug: partner.slug,
          granted: body.granted,
          hasMemberRef: !!updated.partnerMemberRef,
        },
      },
    });

    return {
      partnerConsent: buildPartnerConsentInfo(updated),
    };
  });

  /** Update profile. */
  app.patch('/me', { preHandler: requireAuth }, async (request) => {
    const body = updateProfileSchema.parse(request.body);
    return prisma.user.update({
      where: { id: request.user!.id },
      data: body,
      select: { id: true, fullName: true, email: true },
    });
  });

  /** Delete account — APP 12/13 and App Store requirement. */
  app.delete('/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.id;
    const schoolId = request.user!.schoolId;

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
      request.log.warn(
        { userId, status: authDelete.status },
        'Supabase auth user delete failed after profile anonymisation'
      );
      throw new AppError(
        502,
        'Account deletion could not be completed. Please contact support.',
        'AUTH_DELETE_FAILED'
      );
    }

    return reply.status(204).send();
  });
}