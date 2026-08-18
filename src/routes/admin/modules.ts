import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import {
  requireAdminRead,
  requireAdminReview,
  requireAdminWrite,
} from '../../middleware/admin.js';
import { AppError } from '../../middleware/errors.js';
import { writeAudit } from './writeAudit.js';
import { ensureKnowledgeAreaForModule } from '../../content/syncKnowledgeArea.js';

const idParams = z.object({ id: z.string().uuid() });
const lessonParams = z.object({
  id: z.string().uuid(),
  lessonId: z.string().uuid(),
});

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

const updateModuleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(500).nullable().optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  heroImageUrl: z.string().url().nullable().optional(),
  heroImageAlt: z.string().min(1).max(500).nullable().optional(),
  outcomes: z.array(z.string().min(1).max(500)).optional(),
});

const updateLessonSchema = z.object({
  heading: z.string().min(1).max(200).optional(),
  body: z.string().max(10000).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  imageAlt: z.string().min(1).max(500).nullable().optional(),
  takeaways: z.array(z.string().min(1).max(500)).optional(),
});

const createLessonSchema = z.object({
  heading: z.string().min(1).max(200),
  body: z.string().max(10000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  imageAlt: z.string().min(1).max(500).nullable().optional(),
});

const reorderSchema = z.object({
  modules: z.array(
    z.object({
      id: z.string().uuid(),
      orderIndex: z.number().int().min(1),
    })
  ),
});

const reorderLessonsSchema = z.object({
  lessons: z.array(
    z.object({
      id: z.string().uuid(),
      orderIndex: z.number().int().min(1),
    })
  ),
});

const createModuleSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(500).optional(),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

const quizOptionSchema = z.object({
  letter: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1).max(1000),
  isCorrect: z.boolean(),
});

const quizQuestionSchema = z.object({
  orderIndex: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1).max(2000),
  options: z.array(quizOptionSchema).length(4),
});

const replaceModuleQuizSchema = z.object({
  questions: z.array(quizQuestionSchema).length(3),
});

const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;

function validateQuizPayload(questions: z.infer<typeof replaceModuleQuizSchema>['questions']) {
  const orderIndexes = questions.map((q) => q.orderIndex).sort((a, b) => a - b);
  if (orderIndexes.join(',') !== '1,2,3') {
    throw new AppError(400, 'Quiz must include questions 1, 2, and 3', 'BAD_REQUEST');
  }

  for (const question of questions) {
    const correctCount = question.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      throw new AppError(
        400,
        `Question ${question.orderIndex} must have exactly one correct option`,
        'BAD_REQUEST'
      );
    }
    const letters = question.options.map((o) => o.letter).sort().join(',');
    if (letters !== 'A,B,C,D') {
      throw new AppError(
        400,
        `Question ${question.orderIndex} must have options A through D`,
        'BAD_REQUEST'
      );
    }
  }
}

async function assertModuleQuizComplete(moduleId: string) {
  const questions = await prisma.moduleQuizQuestion.findMany({
    where: { moduleId },
    orderBy: { orderIndex: 'asc' },
    include: { options: { orderBy: { letter: 'asc' } } },
  });

  if (questions.length !== 3) {
    throw new AppError(
      400,
      'Module quiz must have exactly 3 questions before publish',
      'QUIZ_INCOMPLETE'
    );
  }

  try {
    validateQuizPayload(
      questions.map((q) => ({
        orderIndex: q.orderIndex as 1 | 2 | 3,
        text: q.text,
        options: q.options.map((o) => ({
          letter: o.letter as 'A' | 'B' | 'C' | 'D',
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      }))
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'Module quiz is incomplete', 'QUIZ_INCOMPLETE');
  }
}

function slugifyTitle(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return base || 'module';
}

async function uniqueModuleSlug(preferred: string) {
  let slug = preferred;
  let suffix = 2;
  while (await prisma.module.findUnique({ where: { slug } })) {
    slug = `${preferred}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export default async function adminModuleRoutes(app: FastifyInstance) {
  /** All modules — any status (CMS view). */
  app.get('/', { preHandler: requireAdminRead }, async () => {
    const modules = await prisma.module.findMany({
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        orderIndex: true,
        title: true,
        subtitle: true,
        slug: true,
        status: true,
        heroImageUrl: true,
        updatedAt: true,
        _count: { select: { lessons: true, outcomes: true } },
      },
    });

    return {
      modules: modules.map((m) => ({
        id: m.id,
        orderIndex: m.orderIndex,
        title: m.title,
        subtitle: m.subtitle,
        slug: m.slug,
        status: m.status,
        heroImageUrl: m.heroImageUrl,
        updatedAt: m.updatedAt.toISOString(),
        lessonCount: m._count.lessons,
        outcomeCount: m._count.outcomes,
      })),
    };
  });

  /** Create a new draft module with a starter lesson. */
  app.post('/', { preHandler: requireAdminWrite }, async (request, reply) => {
    const body = createModuleSchema.parse(request.body);
    const userId = request.user!.id;
    const slug = await uniqueModuleSlug(body.slug ?? slugifyTitle(body.title));

    const maxOrder = await prisma.module.aggregate({ _max: { orderIndex: true } });
    const orderIndex = (maxOrder._max.orderIndex ?? 0) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const module = await tx.module.create({
        data: {
          orderIndex,
          title: body.title,
          subtitle: body.subtitle ?? null,
          slug,
          status: 'draft',
        },
      });

      await tx.lesson.create({
        data: {
          moduleId: module.id,
          orderIndex: 1,
          type: 'lesson',
          heading: 'Introduction',
          body: '',
        },
      });

      await tx.lesson.create({
        data: {
          moduleId: module.id,
          orderIndex: 2,
          type: 'summary',
          heading: 'Key Takeaways',
        },
      });

      return module;
    });

    await ensureKnowledgeAreaForModule(created);

    await writeAudit(userId, 'admin_module_created', {
      moduleId: created.id,
      title: created.title,
      slug: created.slug,
    });

    return reply.status(201).send({
      id: created.id,
      orderIndex: created.orderIndex,
      title: created.title,
      slug: created.slug,
      status: created.status,
    });
  });

  /** Re-order modules (drag-reorder) — must be registered before /:id. */
  app.post('/reorder', { preHandler: requireAdminWrite }, async (request) => {
    const { modules } = reorderSchema.parse(request.body);
    const userId = request.user!.id;

    await prisma.$transaction(
      modules.map((m) =>
        prisma.module.update({
          where: { id: m.id },
          data: { orderIndex: m.orderIndex },
        })
      )
    );

    const updatedModules = await prisma.module.findMany({
      where: { id: { in: modules.map((m) => m.id) } },
      select: { id: true, slug: true, title: true, orderIndex: true },
    });
    for (const module of updatedModules) {
      await ensureKnowledgeAreaForModule(module);
    }

    await writeAudit(userId, 'admin_modules_reordered', {
      count: modules.length,
    });

    return { saved: true };
  });

  /** One module with editable content. */
  app.get('/:id', { preHandler: requireAdminRead }, async (request) => {
    const { id } = idParams.parse(request.params);

    const module = await prisma.module.findUnique({
      where: { id },
      select: {
        id: true,
        orderIndex: true,
        title: true,
        subtitle: true,
        slug: true,
        status: true,
        heroImageUrl: true,
        heroImageAlt: true,
        updatedAt: true,
        outcomes: { orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true, text: true } },
        lessons: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            type: true,
            heading: true,
            body: true,
            icon: true,
            imageUrl: true,
            imageAlt: true,
            takeaways: { orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true, text: true } },
          },
        },
      },
    });

    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');
    return module;
  });

  /** Module quiz for CMS — includes correct answers. */
  app.get('/:id/quiz', { preHandler: requireAdminRead }, async (request) => {
    const { id } = idParams.parse(request.params);

    const module = await prisma.module.findUnique({ where: { id }, select: { id: true } });
    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const questions = await prisma.moduleQuizQuestion.findMany({
      where: { moduleId: id },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        orderIndex: true,
        text: true,
        options: {
          orderBy: { letter: 'asc' },
          select: { id: true, letter: true, text: true, isCorrect: true },
        },
      },
    });

    return { moduleId: id, questions };
  });

  /** Replace all module quiz questions atomically. */
  app.put('/:id/quiz', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = replaceModuleQuizSchema.parse(request.body);
    const userId = request.user!.id;

    const module = await prisma.module.findUnique({ where: { id }, select: { id: true } });
    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    validateQuizPayload(body.questions);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.moduleQuizQuestion.findMany({
        where: { moduleId: id },
        include: { options: true },
      });

      for (const question of body.questions) {
        let row = existing.find((item) => item.orderIndex === question.orderIndex);
        if (row) {
          row = await tx.moduleQuizQuestion.update({
            where: { id: row.id },
            data: { text: question.text },
            include: { options: true },
          });
        } else {
          row = await tx.moduleQuizQuestion.create({
            data: { moduleId: id, orderIndex: question.orderIndex, text: question.text },
            include: { options: true },
          });
        }

        for (const letter of QUIZ_LETTERS) {
          const payload = question.options.find((o) => o.letter === letter)!;
          const existingOption = row.options.find((o) => o.letter === letter);
          if (existingOption) {
            await tx.moduleQuizOption.update({
              where: { id: existingOption.id },
              data: { text: payload.text, isCorrect: payload.isCorrect },
            });
          } else {
            await tx.moduleQuizOption.create({
              data: {
                questionId: row.id,
                letter,
                text: payload.text,
                isCorrect: payload.isCorrect,
              },
            });
          }
        }
      }

      const keepOrderIndexes = new Set<number>(body.questions.map((q) => q.orderIndex));
      for (const stale of existing.filter((q) => !keepOrderIndexes.has(q.orderIndex))) {
        await tx.moduleQuizQuestion.delete({ where: { id: stale.id } });
      }
    });

    await writeAudit(userId, 'admin_module_quiz_updated', { moduleId: id });

    const questions = await prisma.moduleQuizQuestion.findMany({
      where: { moduleId: id },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        orderIndex: true,
        text: true,
        options: {
          orderBy: { letter: 'asc' },
          select: { id: true, letter: true, text: true, isCorrect: true },
        },
      },
    });

    return { moduleId: id, questions };
  });

  /** Update module metadata, workflow status, and/or outcomes. */
  app.patch('/:id', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateModuleSchema.parse(request.body);
    const userId = request.user!.id;

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    if (body.slug && body.slug !== existing.slug) {
      const clash = await prisma.module.findUnique({ where: { slug: body.slug } });
      if (clash) throw new AppError(409, 'Slug already in use', 'DUPLICATE');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const module = await tx.module.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
          ...(body.heroImageUrl !== undefined ? { heroImageUrl: body.heroImageUrl } : {}),
          ...(body.heroImageAlt !== undefined ? { heroImageAlt: body.heroImageAlt } : {}),
        },
      });

      if (body.outcomes) {
        await tx.moduleOutcome.deleteMany({ where: { moduleId: id } });
        await tx.moduleOutcome.createMany({
          data: body.outcomes.map((text, index) => ({
            moduleId: id,
            orderIndex: index + 1,
            text,
          })),
        });
      }

      return module;
    });

    await ensureKnowledgeAreaForModule(updated);

    await writeAudit(userId, 'admin_module_updated', {
      moduleId: id,
      fields: Object.keys(body),
    });

    return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt.toISOString() };
  });

  /** Add a content lesson before the summary step. */
  app.post('/:id/lessons', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createLessonSchema.parse(request.body ?? {});
    const userId = request.user!.id;

    const existingModule = await prisma.module.findUnique({
      where: { id },
      include: { lessons: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!existingModule) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const summary = existingModule.lessons.find((lesson) => lesson.type === 'summary');
    const insertOrder = summary?.orderIndex ?? existingModule.lessons.length + 1;

    const created = await prisma.$transaction(async (tx) => {
      if (summary) {
        const toShift = await tx.lesson.findMany({
          where: { moduleId: id, orderIndex: { gte: insertOrder } },
          orderBy: { orderIndex: 'desc' },
        });
        for (const lesson of toShift) {
          await tx.lesson.update({
            where: { id: lesson.id },
            data: { orderIndex: lesson.orderIndex + 1 },
          });
        }
      }

      return tx.lesson.create({
        data: {
          moduleId: id,
          orderIndex: insertOrder,
          type: 'lesson',
          heading: body.heading,
          body: body.body ?? '',
          imageUrl: body.imageUrl ?? null,
          imageAlt: body.imageAlt ?? null,
        },
      });
    });

    await writeAudit(userId, 'admin_lesson_created', {
      moduleId: id,
      lessonId: created.id,
      heading: created.heading,
    });

    return reply.status(201).send({
      id: created.id,
      orderIndex: created.orderIndex,
      type: created.type,
      heading: created.heading,
    });
  });

  /** Re-order lesson steps — Key Takeaways must remain last. */
  app.post('/:id/lessons/reorder', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { lessons } = reorderLessonsSchema.parse(request.body);
    const userId = request.user!.id;

    const existing = await prisma.lesson.findMany({
      where: { moduleId: id },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, type: true, orderIndex: true },
    });
    if (existing.length === 0) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    if (lessons.length !== existing.length) {
      throw new AppError(400, 'Reorder must include every lesson step', 'BAD_REQUEST');
    }

    const existingById = new Map(existing.map((lesson) => [lesson.id, lesson]));
    for (const lesson of lessons) {
      if (!existingById.has(lesson.id)) {
        throw new AppError(400, 'Unknown lesson in reorder payload', 'BAD_REQUEST');
      }
    }

    const summary = existing.find((lesson) => lesson.type === 'summary');
    if (summary) {
      const maxOrder = Math.max(...lessons.map((lesson) => lesson.orderIndex));
      const summaryEntry = lessons.find((lesson) => lesson.id === summary.id);
      if (!summaryEntry || summaryEntry.orderIndex !== maxOrder) {
        throw new AppError(400, 'Key Takeaways must remain the final step', 'BAD_REQUEST');
      }
    }

    const orders = lessons.map((lesson) => lesson.orderIndex).sort((a, b) => a - b);
    const expected = Array.from({ length: lessons.length }, (_, index) => index + 1);
    if (orders.some((value, index) => value !== expected[index])) {
      throw new AppError(400, 'Lesson order must be a continuous sequence from 1', 'BAD_REQUEST');
    }

    await prisma.$transaction(
      lessons.map((lesson) =>
        prisma.lesson.update({
          where: { id: lesson.id },
          data: { orderIndex: lesson.orderIndex },
        })
      )
    );

    await writeAudit(userId, 'admin_lessons_reordered', { moduleId: id });

    return { saved: true };
  });

  /** Update a single lesson and optional takeaways. */
  app.patch('/:id/lessons/:lessonId', { preHandler: requireAdminWrite }, async (request) => {
    const { id, lessonId } = lessonParams.parse(request.params);
    const body = updateLessonSchema.parse(request.body);
    const userId = request.user!.id;

    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, moduleId: id },
    });
    if (!lesson) throw new AppError(404, 'Lesson not found', 'NOT_FOUND');

    await prisma.$transaction(async (tx) => {
      await tx.lesson.update({
        where: { id: lessonId },
        data: {
          ...(body.heading !== undefined ? { heading: body.heading } : {}),
          ...(body.body !== undefined ? { body: body.body } : {}),
          ...(body.icon !== undefined ? { icon: body.icon } : {}),
          ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
          ...(body.imageAlt !== undefined ? { imageAlt: body.imageAlt } : {}),
        },
      });

      if (body.takeaways) {
        await tx.lessonTakeaway.deleteMany({ where: { lessonId } });
        await tx.lessonTakeaway.createMany({
          data: body.takeaways.map((text, index) => ({
            lessonId,
            orderIndex: index + 1,
            text,
          })),
        });
      }
    });

    await writeAudit(userId, 'admin_lesson_updated', { moduleId: id, lessonId });
    return { saved: true, lessonId };
  });

  /** Delete a content lesson — summary step cannot be removed. */
  app.delete('/:id/lessons/:lessonId', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id, lessonId } = lessonParams.parse(request.params);
    const userId = request.user!.id;

    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, moduleId: id },
    });
    if (!lesson) throw new AppError(404, 'Lesson not found', 'NOT_FOUND');

    if (lesson.type === 'summary') {
      throw new AppError(400, 'The Key Takeaways step cannot be deleted', 'BAD_REQUEST');
    }

    const contentLessonCount = await prisma.lesson.count({
      where: { moduleId: id, type: 'lesson' },
    });
    if (contentLessonCount <= 1) {
      throw new AppError(400, 'Each module must keep at least one lesson step', 'BAD_REQUEST');
    }

    await prisma.$transaction(async (tx) => {
      await tx.lesson.delete({ where: { id: lessonId } });

      const remaining = await tx.lesson.findMany({
        where: { moduleId: id },
        orderBy: { orderIndex: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        remaining.map((row, index) =>
          tx.lesson.update({
            where: { id: row.id },
            data: { orderIndex: index + 1 },
          })
        )
      );
    });

    await writeAudit(userId, 'admin_lesson_deleted', {
      moduleId: id,
      lessonId,
      heading: lesson.heading,
    });

    return reply.send({ deleted: true, id: lessonId });
  });

  /** Delete a module and re-pack order indexes. Learner progress on this module is removed. */
  app.delete('/:id', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const userId = request.user!.id;

    const existing = await prisma.module.findUnique({
      where: { id },
      include: {
        _count: { select: { progress: true } },
        lessons: { select: { id: true } },
      },
    });
    if (!existing) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const lessonIds = existing.lessons.map((lesson) => lesson.id);

    await prisma.$transaction(async (tx) => {
      if (lessonIds.length) {
        await tx.lessonView.deleteMany({ where: { lessonId: { in: lessonIds } } });
      }
      await tx.moduleProgress.deleteMany({ where: { moduleId: id } });
      await tx.question.updateMany({
        where: { moduleId: id },
        data: { moduleId: null },
      });
      await tx.module.delete({ where: { id } });

      const knowledgeArea = await tx.knowledgeArea.findUnique({
        where: { key: existing.slug },
        select: { id: true, _count: { select: { questions: true, answers: true } } },
      });
      if (knowledgeArea && knowledgeArea._count.questions === 0 && knowledgeArea._count.answers === 0) {
        await tx.knowledgeArea.delete({ where: { id: knowledgeArea.id } });
      }

      const remaining = await tx.module.findMany({
        orderBy: { orderIndex: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        remaining.map((module, index) =>
          tx.module.update({
            where: { id: module.id },
            data: { orderIndex: index + 1 },
          })
        )
      );
    });

    await writeAudit(userId, 'admin_module_deleted', {
      moduleId: id,
      title: existing.title,
      slug: existing.slug,
      progressRowsRemoved: existing._count.progress,
    });

    return reply.send({ deleted: true, id });
  });

  /** Staff submits a draft module for NRMA review. */
  app.post('/:id/submit-review', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const userId = request.user!.id;

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Module not found', 'NOT_FOUND');
    if (existing.status !== 'draft') {
      throw new AppError(400, 'Only draft modules can be submitted for review', 'INVALID_STATUS');
    }

    await assertModuleQuizComplete(id);

    const module = await prisma.module.update({
      where: { id },
      data: { status: 'review' },
    });

    await writeAudit(userId, 'admin_module_submitted_review', { moduleId: id });

    return reply.send({
      id: module.id,
      status: module.status,
      updatedAt: module.updatedAt.toISOString(),
    });
  });

  /** NRMA reviewer approves a module in review. */
  app.post('/:id/approve', { preHandler: requireAdminReview }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const userId = request.user!.id;

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Module not found', 'NOT_FOUND');
    if (existing.status !== 'review') {
      throw new AppError(400, 'Only modules in review can be approved', 'INVALID_STATUS');
    }

    const module = await prisma.module.update({
      where: { id },
      data: { status: 'approved' },
    });

    await writeAudit(userId, 'admin_module_approved', { moduleId: id });

    return reply.send({
      id: module.id,
      status: module.status,
      updatedAt: module.updatedAt.toISOString(),
    });
  });

  /** NRMA reviewer sends a module back to draft. */
  app.post('/:id/reject', { preHandler: requireAdminReview }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = rejectSchema.parse(request.body ?? {});
    const userId = request.user!.id;

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Module not found', 'NOT_FOUND');
    if (existing.status !== 'review') {
      throw new AppError(400, 'Only modules in review can be rejected', 'INVALID_STATUS');
    }

    const module = await prisma.module.update({
      where: { id },
      data: { status: 'draft' },
    });

    await writeAudit(userId, 'admin_module_rejected', {
      moduleId: id,
      ...(body.reason ? { reason: body.reason } : {}),
    });

    return reply.send({
      id: module.id,
      status: module.status,
      updatedAt: module.updatedAt.toISOString(),
    });
  });

  /** Publish an approved module — makes it visible to learners. */
  app.post('/:id/publish', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const userId = request.user!.id;

    const existing = await prisma.module.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Module not found', 'NOT_FOUND');
    if (existing.status !== 'approved') {
      throw new AppError(
        400,
        'Only approved modules can be published',
        'INVALID_STATUS'
      );
    }

    await assertModuleQuizComplete(id);

    const module = await prisma.module.update({
      where: { id },
      data: { status: 'published' },
    });

    await ensureKnowledgeAreaForModule(module);

    await writeAudit(userId, 'admin_module_published', { moduleId: id });

    return reply.send({
      id: module.id,
      status: module.status,
      publishedAt: module.updatedAt.toISOString(),
    });
  });
}
