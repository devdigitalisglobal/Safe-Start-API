import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAdminRead, requireAdminWrite } from '../../middleware/admin.js';
import { AppError } from '../../middleware/errors.js';
import { writeAudit } from './writeAudit.js';
import { randomBytes } from 'node:crypto';

const idParams = z.object({ id: z.string().uuid() });

const createSchoolSchema = z.object({
  name: z.string().min(2).max(200),
  state: z.string().max(10).optional(),
  contactEmail: z.string().email().optional(),
  inviteCode: z
    .string()
    .min(4)
    .max(20)
    .regex(/^[A-Z0-9]+$/)
    .optional(),
  partnerId: z.string().uuid().nullable().optional(),
});

const updateSchoolSchema = z.object({
  partnerId: z.string().uuid().nullable(),
});

const createInvitationSchema = z.object({
  email: z.string().email(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

function generateInviteCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

function generateInvitationCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

export default async function adminSchoolRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireAdminRead }, async () => {
    const schools = await prisma.school.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        state: true,
        contactEmail: true,
        inviteCode: true,
        status: true,
        partnerId: true,
        createdAt: true,
        partner: { select: { id: true, name: true, slug: true } },
        _count: { select: { users: true, invitations: true } },
      },
    });

    return {
      schools: schools.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        contactEmail: s.contactEmail,
        inviteCode: s.inviteCode,
        status: s.status,
        partnerId: s.partnerId,
        partnerName: s.partner?.name ?? null,
        createdAt: s.createdAt.toISOString(),
        studentCount: s._count.users,
        invitationCount: s._count.invitations,
      })),
    };
  });

  app.post('/', { preHandler: requireAdminWrite }, async (request, reply) => {
    const body = createSchoolSchema.parse(request.body);
    const userId = request.user!.id;
    const inviteCode = body.inviteCode ?? generateInviteCode();

    const existing = await prisma.school.findUnique({ where: { inviteCode } });
    if (existing) throw new AppError(409, 'Invite code already in use', 'DUPLICATE');

    const school = await prisma.school.create({
      data: {
        name: body.name,
        state: body.state,
        contactEmail: body.contactEmail,
        inviteCode,
        status: 'active',
        partnerId: body.partnerId ?? null,
      },
    });

    await writeAudit(userId, 'admin_school_created', { schoolId: school.id });

    return reply.status(201).send({
      id: school.id,
      name: school.name,
      inviteCode: school.inviteCode,
    });
  });

  app.get('/:id/invitations', { preHandler: requireAdminRead }, async (request) => {
    const { id } = idParams.parse(request.params);

    const school = await prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        partnerId: true,
        partner: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!school) throw new AppError(404, 'School not found', 'NOT_FOUND');

    const invitations = await prisma.invitation.findMany({
      where: { schoolId: id },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        email: true,
        code: true,
        sentAt: true,
        acceptedAt: true,
        expiresAt: true,
      },
    });

    return {
      school: {
        id: school.id,
        name: school.name,
        inviteCode: school.inviteCode,
        partnerId: school.partnerId,
      },
      invitations: invitations.map((i) => ({
        ...i,
        sentAt: i.sentAt.toISOString(),
        acceptedAt: i.acceptedAt?.toISOString() ?? null,
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  });

  app.post('/:id/invitations', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createInvitationSchema.parse(request.body);
    const userId = request.user!.id;

    const school = await prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        partnerId: true,
        partner: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!school) throw new AppError(404, 'School not found', 'NOT_FOUND');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);

    const invitation = await prisma.invitation.create({
      data: {
        schoolId: id,
        email: body.email.toLowerCase(),
        code: generateInvitationCode(),
        expiresAt,
      },
    });

    await writeAudit(userId, 'admin_invitation_sent', {
      schoolId: id,
      invitationId: invitation.id,
      email: invitation.email,
    });

    return reply.status(201).send({
      id: invitation.id,
      email: invitation.email,
      code: invitation.code,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  });

  app.patch('/:id', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateSchoolSchema.parse(request.body);
    const userId = request.user!.id;

    const school = await prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        partnerId: true,
        partner: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!school) throw new AppError(404, 'School not found', 'NOT_FOUND');

    if (body.partnerId) {
      const partner = await prisma.partner.findUnique({ where: { id: body.partnerId } });
      if (!partner) throw new AppError(404, 'Partner not found', 'NOT_FOUND');
    }

    const updated = await prisma.school.update({
      where: { id },
      data: { partnerId: body.partnerId },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        partnerId: true,
        partner: { select: { id: true, name: true, slug: true } },
      },
    });

    await writeAudit(userId, 'admin_school_updated', {
      schoolId: id,
      partnerId: updated.partnerId,
    });

    return {
      id: updated.id,
      name: updated.name,
      inviteCode: updated.inviteCode,
      partnerId: updated.partnerId,
      partnerName: updated.partner?.name ?? null,
    };
  });
}
