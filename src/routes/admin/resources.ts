import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAdminRead, requireAdminWrite } from '../../middleware/admin.js';
import { AppError } from '../../middleware/errors.js';
import { RESOURCE_CATEGORIES } from '../../resources/categories.js';
import { writeAudit } from './writeAudit.js';

const idParams = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  category: z.enum(RESOURCE_CATEGORIES),
  title: z.string().min(1).max(200),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().max(20000).nullable().optional(),
  url: z.string().url().nullable().optional(),
  orderIndex: z.number().int().min(1).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

const updateSchema = createSchema.partial();

export default async function adminResourceRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireAdminRead }, async () => {
    const items = await prisma.resourceItem.findMany({
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }],
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        summary: item.summary,
        body: item.body,
        url: item.url,
        orderIndex: item.orderIndex,
        status: item.status,
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  });

  app.post('/', { preHandler: requireAdminWrite }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const userId = request.user!.id;

    const maxOrder = await prisma.resourceItem.aggregate({
      where: { category: body.category },
      _max: { orderIndex: true },
    });

    const item = await prisma.resourceItem.create({
      data: {
        category: body.category,
        title: body.title,
        summary: body.summary ?? null,
        body: body.body ?? null,
        url: body.url ?? null,
        orderIndex: body.orderIndex ?? (maxOrder._max.orderIndex ?? 0) + 1,
        status: body.status ?? 'draft',
      },
    });

    await writeAudit(userId, 'admin_resource_created', {
      resourceId: item.id,
      category: item.category,
    });

    return reply.status(201).send({
      id: item.id,
      category: item.category,
      title: item.title,
      status: item.status,
    });
  });

  app.patch('/:id', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateSchema.parse(request.body);
    const userId = request.user!.id;

    const existing = await prisma.resourceItem.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resource not found', 'NOT_FOUND');

    const item = await prisma.resourceItem.update({
      where: { id },
      data: {
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.orderIndex !== undefined ? { orderIndex: body.orderIndex } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });

    await writeAudit(userId, 'admin_resource_updated', { resourceId: id });

    return {
      id: item.id,
      status: item.status,
      updatedAt: item.updatedAt.toISOString(),
    };
  });

  app.delete('/:id', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const userId = request.user!.id;

    const existing = await prisma.resourceItem.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resource not found', 'NOT_FOUND');

    await prisma.resourceItem.delete({ where: { id } });
    await writeAudit(userId, 'admin_resource_deleted', { resourceId: id });

    return { deleted: true, id };
  });
}
