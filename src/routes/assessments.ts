import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';

const paramsSchema = z.object({
  type: z.enum(['starting_grid', 'finish_line']),
});

export default async function assessmentRoutes(app: FastifyInstance) {
  /** Assessment questions. Correct answers deliberately excluded. */
  app.get('/:type', { preHandler: requireAuth }, async (request) => {
    const { type } = paramsSchema.parse(request.params);
    const userId = request.user!.id;

    const assessment = await prisma.assessment.findFirst({
      where: { type, status: 'published' },
      select: {
        id: true,
        type: true,
        title: true,
        subtitle: true,
        description: true,
        heroImageUrl: true,
        heroImageAlt: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            text: true,
            knowledgeArea: { select: { key: true, name: true } },
            module: { select: { id: true, title: true, orderIndex: true } },
            options: {
              orderBy: { letter: 'asc' },
              // isCorrect is NOT selected — see the rule above
              select: { id: true, letter: true, text: true },
            },
          },
        },
      },
    });

    if (!assessment) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');

    const attempts = await prisma.assessmentAttempt.findMany({
      where: { userId, assessmentId: assessment.id },
      orderBy: { attemptNumber: 'desc' },
      select: {
        id: true,
        attemptNumber: true,
        startedAt: true,
        completedAt: true,
        totalScore: true,
        totalQuestions: true,
        _count: { select: { answers: true } },
      },
    });

    return {
      ...assessment,
      questionCount: assessment.questions.length,
      attempts: attempts.map(({ _count, ...attempt }) => ({
        ...attempt,
        answeredCount: _count.answers,
      })),
      hasCompleted: attempts.some(a => a.completedAt !== null),
    };
  });

  /** Where should this user go when they open the app? */
  app.get('/status/gates', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;

    const [startingGrid, finishLine] = await Promise.all([
      prisma.assessment.findFirst({ where: { type: 'starting_grid' }, select: { id: true } }),
      prisma.assessment.findFirst({ where: { type: 'finish_line' }, select: { id: true } }),
    ]);

    const [sgAttempt, sgInProgress, flAttempt, totalModules, completedModules] = await Promise.all([
      startingGrid
        ? prisma.assessmentAttempt.findFirst({
            where: { userId, assessmentId: startingGrid.id, completedAt: { not: null } },
          })
        : null,
      startingGrid
        ? prisma.assessmentAttempt.findFirst({
            where: {
              userId,
              assessmentId: startingGrid.id,
              completedAt: null,
              answers: { some: {} },
            },
          })
        : null,
      finishLine
        ? prisma.assessmentAttempt.findFirst({
            where: { userId, assessmentId: finishLine.id, completedAt: { not: null } },
          })
        : null,
      prisma.module.count({ where: { status: 'published' } }),
      prisma.moduleProgress.count({ where: { userId, status: 'completed' } }),
    ]);

    const startingGridDone = !!sgAttempt;
    const allModulesDone = totalModules > 0 && completedModules >= totalModules;

    return {
      startingGrid: { required: true, completed: startingGridDone, inProgress: !!sgInProgress },
      modules: {
        unlocked: startingGridDone,
        total: totalModules,
        completed: completedModules,
      },
      finishLine: {
        // ASSUMPTION: requires all modules complete. Client question B11, unanswered.
        unlocked: allModulesDone,
        completed: !!flAttempt,
      },
      nextAction: !startingGridDone
        ? 'starting_grid'
        : !allModulesDone
        ? 'modules'
        : !flAttempt
        ? 'finish_line'
        : 'complete',
    };
  });
}