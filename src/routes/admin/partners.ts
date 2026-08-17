import type { FastifyInstance } from 'fastify';

import { z } from 'zod';

import { prisma } from '../../db.js';

import { requireAdminRead, requireAdminWrite } from '../../middleware/admin.js';

import { AppError } from '../../middleware/errors.js';

import { formatPartner } from '../../partners/resolve.js';

import { writeAudit } from './writeAudit.js';

import {
  generateClientId,
  generateClientSecret,
  hashPartnerSecret,
} from '../../partner/credentials.js';



const idParams = z.object({ id: z.string().uuid() });
const credentialParams = z.object({
  id: z.string().uuid(),
  credentialId: z.string().uuid(),
});

const createCredentialSchema = z.object({
  label: z.string().max(120).optional(),
});



const slugSchema = z

  .string()

  .min(2)

  .max(40)

  .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, hyphens or underscores');



const createPartnerSchema = z.object({

  slug: slugSchema,

  name: z.string().min(1).max(120),

  logoUrl: z.string().url().nullable().optional(),

  logoAlt: z.string().min(1).max(500).nullable().optional(),

  isDefault: z.boolean().optional(),

});



const updatePartnerSchema = z.object({

  name: z.string().min(1).max(120).optional(),

  logoUrl: z.string().url().nullable().optional(),

  logoAlt: z.string().min(1).max(500).nullable().optional(),

  status: z.enum(['active', 'inactive']).optional(),

  isDefault: z.boolean().optional(),

});



async function clearOtherDefaults(exceptId: string) {

  await prisma.partner.updateMany({

    where: { isDefault: true, id: { not: exceptId } },

    data: { isDefault: false },

  });

}



export default async function adminPartnerRoutes(app: FastifyInstance) {

  app.get('/', { preHandler: requireAdminRead }, async () => {

    const partners = await prisma.partner.findMany({

      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],

      include: { _count: { select: { schools: true } } },

    });



    return {

      partners: partners.map((partner) => ({

        id: partner.id,

        slug: partner.slug,

        name: partner.name,

        logoUrl: partner.logoUrl,

        logoAlt: partner.logoAlt,

        isDefault: partner.isDefault,

        status: partner.status,

        schoolCount: partner._count.schools,

        updatedAt: partner.updatedAt.toISOString(),

      })),

    };

  });



  app.post('/', { preHandler: requireAdminWrite }, async (request, reply) => {

    const body = createPartnerSchema.parse(request.body);

    const userId = request.user!.id;



    const existing = await prisma.partner.findUnique({ where: { slug: body.slug } });

    if (existing) throw new AppError(409, 'Partner slug already in use', 'DUPLICATE');



    if (body.logoUrl && !body.logoAlt) {

      throw new AppError(400, 'Logo alt text is required when a partner logo is set', 'BAD_REQUEST');

    }



    const partner = await prisma.partner.create({

      data: {

        slug: body.slug,

        name: body.name,

        logoUrl: body.logoUrl ?? null,

        logoAlt: body.logoAlt ?? null,

        isDefault: body.isDefault ?? false,

      },

    });



    if (partner.isDefault) {

      await clearOtherDefaults(partner.id);

    }



    await writeAudit(userId, 'admin_partner_created', { partnerId: partner.id, slug: partner.slug });



    return reply.status(201).send({

      id: partner.id,

      slug: partner.slug,

      name: partner.name,

    });

  });



  app.get('/:id', { preHandler: requireAdminRead }, async (request) => {

    const { id } = idParams.parse(request.params);



    const partner = await prisma.partner.findUnique({

      where: { id },

      include: { _count: { select: { schools: true } } },

    });

    if (!partner) throw new AppError(404, 'Partner not found', 'NOT_FOUND');



    return {

      ...formatPartner(partner),

      id: partner.id,

      slug: partner.slug,

      name: partner.name,

      isDefault: partner.isDefault,

      status: partner.status,

      schoolCount: partner._count.schools,

    };

  });



  app.patch('/:id', { preHandler: requireAdminWrite }, async (request) => {

    const { id } = idParams.parse(request.params);

    const body = updatePartnerSchema.parse(request.body);

    const userId = request.user!.id;



    const existing = await prisma.partner.findUnique({ where: { id } });

    if (!existing) throw new AppError(404, 'Partner not found', 'NOT_FOUND');



    const nextLogoUrl = body.logoUrl !== undefined ? body.logoUrl : existing.logoUrl;

    const nextLogoAlt = body.logoAlt !== undefined ? body.logoAlt : existing.logoAlt;



    if (nextLogoUrl && !nextLogoAlt) {

      throw new AppError(400, 'Logo alt text is required when a partner logo is set', 'BAD_REQUEST');

    }



    if (body.isDefault === false && existing.isDefault) {

      throw new AppError(400, 'Assign another partner as default before removing this one', 'BAD_REQUEST');

    }



    const partner = await prisma.partner.update({

      where: { id },

      data: {

        ...(body.name !== undefined ? { name: body.name } : {}),

        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),

        ...(body.logoAlt !== undefined ? { logoAlt: body.logoAlt } : {}),

        ...(body.status !== undefined ? { status: body.status } : {}),

        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),

      },

    });



    if (body.isDefault) {

      await clearOtherDefaults(partner.id);

    }



    await writeAudit(userId, 'admin_partner_updated', { partnerId: id });



    return formatPartner(partner);

  });



  app.delete('/:id', { preHandler: requireAdminWrite }, async (request) => {

    const { id } = idParams.parse(request.params);

    const userId = request.user!.id;



    const existing = await prisma.partner.findUnique({

      where: { id },

      include: { _count: { select: { schools: true } } },

    });

    if (!existing) throw new AppError(404, 'Partner not found', 'NOT_FOUND');

    if (existing.isDefault) {

      throw new AppError(400, 'Cannot delete the default partner', 'BAD_REQUEST');

    }

    if (existing._count.schools > 0) {

      throw new AppError(400, 'Reassign linked schools before deleting this partner', 'BAD_REQUEST');

    }



    await prisma.partner.delete({ where: { id } });

    await writeAudit(userId, 'admin_partner_deleted', { partnerId: id, slug: existing.slug });



    return { deleted: true, id };

  });

  app.get('/:id/credentials', { preHandler: requireAdminRead }, async (request) => {
    const { id } = idParams.parse(request.params);

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new AppError(404, 'Partner not found', 'NOT_FOUND');

    const credentials = await prisma.partnerApiCredential.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clientId: true,
        label: true,
        scopes: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    return {
      credentials: credentials.map((credential) => ({
        id: credential.id,
        clientId: credential.clientId,
        label: credential.label,
        scopes: credential.scopes,
        status: credential.status,
        lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
        createdAt: credential.createdAt.toISOString(),
        revokedAt: credential.revokedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post('/:id/credentials', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createCredentialSchema.parse(request.body ?? {});
    const userId = request.user!.id;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new AppError(404, 'Partner not found', 'NOT_FOUND');

    const clientId = generateClientId(partner.slug);
    const clientSecret = generateClientSecret();

    const credential = await prisma.partnerApiCredential.create({
      data: {
        partnerId: id,
        clientId,
        secretHash: hashPartnerSecret(clientSecret),
        label: body.label ?? null,
        scopes: 'reports:read',
      },
    });

    await writeAudit(userId, 'admin_partner_credential_created', {
      partnerId: id,
      credentialId: credential.id,
      clientId: credential.clientId,
    });

    return reply.status(201).send({
      id: credential.id,
      clientId: credential.clientId,
      clientSecret,
      scopes: credential.scopes,
      note: 'Copy the client secret now — it cannot be shown again.',
    });
  });

  app.delete('/:id/credentials/:credentialId', { preHandler: requireAdminWrite }, async (request) => {
    const { id, credentialId } = credentialParams.parse(request.params);
    const userId = request.user!.id;

    const credential = await prisma.partnerApiCredential.findFirst({
      where: { id: credentialId, partnerId: id },
    });
    if (!credential) throw new AppError(404, 'Credential not found', 'NOT_FOUND');
    if (credential.status === 'revoked') {
      return { revoked: true, id: credentialId };
    }

    await prisma.partnerApiCredential.update({
      where: { id: credentialId },
      data: { status: 'revoked', revokedAt: new Date() },
    });

    await writeAudit(userId, 'admin_partner_credential_revoked', {
      partnerId: id,
      credentialId,
      clientId: credential.clientId,
    });

    return { revoked: true, id: credentialId };
  });

}

