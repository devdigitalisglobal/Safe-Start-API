import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function moduleRoutes(app: FastifyInstance) {
  /** All published modules with this user's progress merged in. */
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;

    const modules = await prisma.module.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        orderIndex: true,
        title: true,
        subtitle: true,
        slug: true,
        heroImageUrl: true,
        heroImageAlt: true,
        outcomes: { orderBy: { orderIndex: 'asc' }, select: { text: true } },
        _count: { select: { lessons: true } },
      },
    });

    const progress = await prisma.moduleProgress.findMany({
      where: { userId },
      select: { moduleId: true, status: true, lastStepIndex: true, completedAt: true },
    });

    const progressMap = new Map(progress.map(p => [p.moduleId, p]));

    const items = modules.map(m => {
      const p = progressMap.get(m.id);
      return {
        id: m.id,
        orderIndex: m.orderIndex,
        title: m.title,
        subtitle: m.subtitle,
        slug: m.slug,
        heroImageUrl: m.heroImageUrl,
        heroImageAlt: m.heroImageAlt,
        outcomes: m.outcomes.map(o => o.text),
        stepCount: m._count.lessons,
        status: p?.status ?? 'not_started',
        lastStepIndex: p?.lastStepIndex ?? 0,
        completedAt: p?.completedAt ?? null,
      };
    });

    const completed = items.filter(i => i.status === 'completed').length;

    return {
      modules: items,
      summary: {
        total: items.length,
        completed,
        percent: items.length ? Math.round((completed / items.length) * 100) : 0,
      },
    };
  });

  /** One module with full lesson content. */
  app.get('/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const userId = request.user!.id;

    const module = await prisma.module.findFirst({
      where: { id, status: 'published' },
      select: {
        id: true,
        orderIndex: true,
        title: true,
        subtitle: true,
        slug: true,
        heroImageUrl: true,
        heroImageAlt: true,
        outcomes: { orderBy: { orderIndex: 'asc' }, select: { text: true } },
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
            takeaways: { orderBy: { orderIndex: 'asc' }, select: { text: true } },
          },
        },
      },
    });

    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const progress = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: id } },
      select: { status: true, lastStepIndex: true, completedAt: true, quizSubmittedAt: true },
    });

    return {
      ...module,
      outcomes: module.outcomes.map(o => o.text),
      lessons: module.lessons.map(l => ({
        ...l,
        takeaways: l.takeaways.map(t => t.text),
      })),
      progress: {
        status: progress?.status ?? 'not_started',
        lastStepIndex: progress?.lastStepIndex ?? 0,
        completedAt: progress?.completedAt ?? null,
        quizSubmitted: !!progress?.quizSubmittedAt,
      },
    };
  });

  /** Module quiz — 3 questions without correct answers until submitted. */
  app.get('/:id/quiz', { preHandler: requireAuth }, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const userId = request.user!.id;

    const module = await prisma.module.findFirst({
      where: { id, status: 'published' },
      select: { id: true },
    });
    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const [questions, progress, savedAnswers] = await Promise.all([
      prisma.moduleQuizQuestion.findMany({
        where: { moduleId: id },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          orderIndex: true,
          text: true,
          options: {
            orderBy: { letter: 'asc' },
            select: { id: true, letter: true, text: true },
          },
        },
      }),
      prisma.moduleProgress.findUnique({
        where: { userId_moduleId: { userId, moduleId: id } },
        select: { quizSubmittedAt: true },
      }),
      prisma.moduleQuizAnswer.findMany({
        where: { userId, moduleId: id },
        select: {
          questionId: true,
          selectedOptionId: true,
          isCorrect: true,
          question: {
            select: {
              options: { select: { id: true, isCorrect: true } },
            },
          },
        },
      }),
    ]);

    const submitted = !!progress?.quizSubmittedAt;
    const answerMap = new Map(savedAnswers.map(a => [a.questionId, a]));

    return {
      submitted,
      questions: questions.map(q => ({
        id: q.id,
        orderIndex: q.orderIndex,
        text: q.text,
        options: q.options,
      })),
      answers: submitted
        ? savedAnswers.map(a => {
            const correctOptionId =
              a.question.options.find(o => o.isCorrect)?.id ?? null;
            return {
              questionId: a.questionId,
              optionId: a.selectedOptionId,
              isCorrect: a.isCorrect,
              correctOptionId,
            };
          })
        : [],
    };
  });
}