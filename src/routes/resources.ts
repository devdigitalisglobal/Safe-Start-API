import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
  isResourceCategory,
} from '../resources/categories.js';

const categoryParams = z.object({
  category: z.enum(RESOURCE_CATEGORIES),
});

const itemParams = z.object({
  id: z.string().uuid(),
});

export default async function resourceRoutes(app: FastifyInstance) {
  /** One resource item with full body — register before /:category. */
  app.get('/items/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = itemParams.parse(request.params);

    const item = await prisma.resourceItem.findFirst({
      where: { id, status: 'published' },
      select: {
        id: true,
        category: true,
        title: true,
        summary: true,
        body: true,
        url: true,
        orderIndex: true,
      },
    });

    if (!item) throw new AppError(404, 'Resource not found', 'NOT_FOUND');

    return {
      ...item,
      categoryTitle: isResourceCategory(item.category)
        ? RESOURCE_CATEGORY_LABELS[item.category]
        : item.category,
    };
  });

  /** Published resources grouped by category — for the learner app. */
  app.get('/', { preHandler: requireAuth }, async () => {
    const items = await prisma.resourceItem.findMany({
      where: { status: 'published' },
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }],
      select: {
        id: true,
        category: true,
        title: true,
        summary: true,
        url: true,
        orderIndex: true,
      },
    });

    const categories = RESOURCE_CATEGORIES.map((key) => ({
      key,
      title: RESOURCE_CATEGORY_LABELS[key],
      items: items.filter((item) => item.category === key),
    }));

    return { categories };
  });

  /** Items in one category. */
  app.get('/:category', { preHandler: requireAuth }, async (request) => {
    const { category } = categoryParams.parse(request.params);

    const items = await prisma.resourceItem.findMany({
      where: { category, status: 'published' },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        category: true,
        title: true,
        summary: true,
        url: true,
        orderIndex: true,
      },
    });

    return {
      category,
      title: RESOURCE_CATEGORY_LABELS[category],
      items,
    };
  });
}
