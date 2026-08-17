import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';

const moduleParams = z.object({ id: z.string().uuid() });

const stepSchema = z.object({
  stepIndex: z.number().int().min(0),
  timeSpentSeconds: z.number().int().min(0).max(1800).optional(),
});

const lessonViewSchema = z.object({
  lessonId: z.string().uuid(),
  timeSpentSeconds: z.number().int().min(0).max(1800).optional(),
});

const quizSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        optionId: z.string().uuid(),
      })
    )
    .min(1)
    .max(10),
});

/** Guard: modules are locked until the Starting Grid is complete. */
async function assertStartingGridComplete(userId: string) {
  const sg = await prisma.assessment.findFirst({
    where: { type: 'starting_grid' },
    select: { id: true },
  });
  if (!sg) return;

  const done = await prisma.assessmentAttempt.findFirst({
    where: { userId, assessmentId: sg.id, completedAt: { not: null } },
    select: { id: true },
  });

  if (!done) {
    throw new AppError(403, 'Complete the Starting Grid first', 'GRID_REQUIRED');
  }
}

export default async function progressRoutes(app: FastifyInstance) {
  /** Overall progress summary. */
  app.get('/', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;

    const [modules, progress] = await Promise.all([
      prisma.module.findMany({
        where: { status: 'published' },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, orderIndex: true, title: true },
      }),
      prisma.moduleProgress.findMany({
        where: { userId },
        select: {
          moduleId: true,
          status: true,
          lastStepIndex: true,
          startedAt: true,
          completedAt: true,
          timeSpentSeconds: true,
        },
      }),
    ]);

    const map = new Map(progress.map(p => [p.moduleId, p]));
    const items = modules.map(m => {
      const p = map.get(m.id);
      return {
        moduleId: m.id,
        orderIndex: m.orderIndex,
        title: m.title,
        status: p?.status ?? 'not_started',
        lastStepIndex: p?.lastStepIndex ?? 0,
        startedAt: p?.startedAt ?? null,
        completedAt: p?.completedAt ?? null,
        timeSpentSeconds: p?.timeSpentSeconds ?? 0,
      };
    });

    const completed = items.filter(i => i.status === 'completed');
    const inProgress = items.filter(i => i.status === 'in_progress');

    return {
      total: items.length,
      completed: completed.length,
      percent: items.length ? Math.round((completed.length / items.length) * 100) : 0,
      totalTimeSeconds: items.reduce((s, i) => s + i.timeSpentSeconds, 0),
      modules: items,
      completedModules: completed,
      inProgressModules: inProgress,
    };
  });

  /** Start (or resume) a module. */
  app.post('/modules/:id/start', { preHandler: requireAuth }, async (request) => {
    const { id } = moduleParams.parse(request.params);
    const userId = request.user!.id;

    await assertStartingGridComplete(userId);

    const module = await prisma.module.findFirst({
      where: { id, status: 'published' },
      select: { id: true },
    });
    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const existing = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: id } },
    });

    // Never downgrade a completed module
    if (existing?.status === 'completed') {
      return existing;
    }

    const progress = await prisma.moduleProgress.upsert({
      where: { userId_moduleId: { userId, moduleId: id } },
      update: { status: 'in_progress' },
      create: {
        userId,
        moduleId: id,
        status: 'in_progress',
        startedAt: new Date(),
      },
    });

    if (!existing) {
      await prisma.event.create({
        data: {
          userId,
          schoolId: request.user!.schoolId,
          type: 'module_started',
          payload: { moduleId: id },
        },
      });
    }

    return progress;
  });

  /** Record step position and elapsed time. */
  app.post('/modules/:id/step', { preHandler: requireAuth }, async (request) => {
    const { id } = moduleParams.parse(request.params);
    const body = stepSchema.parse(request.body);
    const userId = request.user!.id;

    const existing = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: id } },
    });
    if (!existing) throw new AppError(400, 'Module not started', 'NOT_STARTED');

    return prisma.moduleProgress.update({
      where: { userId_moduleId: { userId, moduleId: id } },
      data: {
        // Only move forward — going back shouldn't reset the resume point
        lastStepIndex: Math.max(existing.lastStepIndex, body.stepIndex),
        timeSpentSeconds: existing.timeSpentSeconds + (body.timeSpentSeconds ?? 0),
      },
    });
  });

  /** Submit all module quiz answers — idempotent once locked in. */
  app.post('/modules/:id/quiz', { preHandler: requireAuth }, async (request) => {
    const { id } = moduleParams.parse(request.params);
    const body = quizSubmitSchema.parse(request.body);
    const userId = request.user!.id;

    const progress = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: id } },
    });
    if (!progress) throw new AppError(400, 'Module not started', 'NOT_STARTED');

    const module = await prisma.module.findFirst({
      where: { id, status: 'published' },
      select: { id: true },
    });
    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const questions = await prisma.moduleQuizQuestion.findMany({
      where: { moduleId: id },
      orderBy: { orderIndex: 'asc' },
      include: { options: true },
    });

    if (questions.length === 0) {
      throw new AppError(404, 'No quiz for this module', 'NOT_FOUND');
    }

    if (progress.quizSubmittedAt) {
      const existing = await prisma.moduleQuizAnswer.findMany({
        where: { userId, moduleId: id },
        include: { question: { include: { options: true } } },
      });
      return {
        submitted: true,
        locked: true,
        results: existing.map(a => ({
          questionId: a.questionId,
          optionId: a.selectedOptionId,
          isCorrect: a.isCorrect,
          correctOptionId: a.question.options.find(o => o.isCorrect)?.id ?? null,
        })),
      };
    }

    if (body.answers.length !== questions.length) {
      throw new AppError(
        400,
        `Submit answers for all ${questions.length} questions`,
        'INCOMPLETE_QUIZ'
      );
    }

    const questionMap = new Map(questions.map(q => [q.id, q]));
    const results: {
      questionId: string;
      optionId: string;
      isCorrect: boolean;
      correctOptionId: string | null;
    }[] = [];

    for (const answer of body.answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new AppError(400, 'Invalid question for this module', 'FORBIDDEN');
      }
      const option = question.options.find(o => o.id === answer.optionId);
      if (!option) {
        throw new AppError(400, 'Invalid option for this question', 'FORBIDDEN');
      }
      const correctOptionId = question.options.find(o => o.isCorrect)?.id ?? null;
      const isCorrect = option.isCorrect;
      results.push({
        questionId: question.id,
        optionId: option.id,
        isCorrect,
        correctOptionId,
      });

      await prisma.moduleQuizAnswer.upsert({
        where: {
          userId_moduleId_questionId: {
            userId,
            moduleId: id,
            questionId: question.id,
          },
        },
        update: {
          selectedOptionId: option.id,
          isCorrect,
        },
        create: {
          userId,
          moduleId: id,
          questionId: question.id,
          selectedOptionId: option.id,
          isCorrect,
        },
      });
    }

    await prisma.moduleProgress.update({
      where: { userId_moduleId: { userId, moduleId: id } },
      data: { quizSubmittedAt: new Date() },
    });

    await prisma.event.create({
      data: {
        userId,
        schoolId: request.user!.schoolId,
        type: 'module_quiz_submitted',
        payload: { moduleId: id, correct: results.filter(r => r.isCorrect).length },
      },
    });

    return { submitted: true, locked: true, results };
  });

  /** Mark a module complete. */
  app.post('/modules/:id/complete', { preHandler: requireAuth }, async (request) => {
    const { id } = moduleParams.parse(request.params);
    const userId = request.user!.id;

    const module = await prisma.module.findFirst({
      where: { id, status: 'published' },
      select: {
        lessons: { orderBy: { orderIndex: 'asc' }, select: { id: true, type: true, orderIndex: true } },
        quizQuestions: { select: { id: true }, take: 1 },
      },
    });
    if (!module) throw new AppError(404, 'Module not found', 'NOT_FOUND');

    const existing = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: id } },
    });
    if (!existing) throw new AppError(400, 'Module not started', 'NOT_STARTED');

    const summaryIndex = module.lessons.findIndex(l => l.type === 'summary');
    const hasQuiz = module.quizQuestions.length > 0;

    if (hasQuiz && !existing.quizSubmittedAt) {
      throw new AppError(403, 'Complete the module quiz first', 'QUIZ_REQUIRED');
    }

    if (summaryIndex >= 0 && existing.lastStepIndex < summaryIndex) {
      throw new AppError(403, 'Complete all lessons first', 'MODULE_INCOMPLETE');
    }

    // Legacy fallback: modules without quiz still require final lesson index
    if (!hasQuiz) {
      const finalStepIndex = module.lessons.length - 1;
      if (finalStepIndex >= 0 && existing.lastStepIndex < finalStepIndex) {
        throw new AppError(403, 'Complete all lessons first', 'MODULE_INCOMPLETE');
      }
    }

    // Idempotent — completing twice doesn't move the timestamp or re-fire the event
    if (existing.status === 'completed') return existing;

    const progress = await prisma.moduleProgress.update({
      where: { userId_moduleId: { userId, moduleId: id } },
      data: { status: 'completed', completedAt: new Date() },
    });

    await prisma.event.create({
      data: {
        userId,
        schoolId: request.user!.schoolId,
        type: 'module_completed',
        payload: { moduleId: id, timeSpentSeconds: progress.timeSpentSeconds },
      },
    });

    return progress;
  });

  /** Record a lesson step view — powers drop-off analysis. */
  app.post('/lessons/view', { preHandler: requireAuth }, async (request) => {
    const body = lessonViewSchema.parse(request.body);
    const userId = request.user!.id;

    const lesson = await prisma.lesson.findUnique({
      where: { id: body.lessonId },
      select: { id: true, moduleId: true, orderIndex: true },
    });
    if (!lesson) throw new AppError(404, 'Lesson not found', 'NOT_FOUND');

    const progress = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: lesson.moduleId } },
      select: { status: true },
    });
    if (!progress || progress.status === 'not_started') {
      throw new AppError(403, 'Start the module before recording lesson views', 'NOT_STARTED');
    }

    await prisma.lessonView.create({
      data: {
        userId,
        lessonId: body.lessonId,
        timeSpentSeconds: body.timeSpentSeconds ?? 0,
      },
    });

    await prisma.event.create({
      data: {
        userId,
        schoolId: request.user!.schoolId,
        type: 'step_viewed',
        payload: {
          lessonId: body.lessonId,
          moduleId: lesson.moduleId,
          stepIndex: lesson.orderIndex,
        },
      },
    });

    return { ok: true };
  });
}