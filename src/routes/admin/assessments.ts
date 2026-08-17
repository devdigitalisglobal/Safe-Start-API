import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAdminRead, requireAdminWrite } from '../../middleware/admin.js';
import { AppError } from '../../middleware/errors.js';
import { writeAudit } from './writeAudit.js';

const typeParams = z.object({
  type: z.enum(['starting_grid', 'finish_line']),
});

const questionParams = z.object({
  questionId: z.string().uuid(),
});

const updateQuestionSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  explanation: z.string().max(2000).nullable().optional(),
  knowledgeAreaId: z.string().uuid().optional(),
  options: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        letter: z.enum(['A', 'B', 'C', 'D']),
        text: z.string().min(1).max(1000),
        isCorrect: z.boolean(),
      })
    )
    .length(4)
    .optional(),
});

export default async function adminAssessmentRoutes(app: FastifyInstance) {
  /** Knowledge areas for question tagging. */
  app.get('/knowledge-areas', { preHandler: requireAdminRead }, async () => {
    const areas = await prisma.knowledgeArea.findMany({
      orderBy: { orderIndex: 'asc' },
      select: { id: true, key: true, name: true, orderIndex: true },
    });
    return { knowledgeAreas: areas };
  });

  /** Published assessments available for CMS editing. */
  app.get('/', { preHandler: requireAdminRead }, async () => {
    const assessments = await prisma.assessment.findMany({
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        title: true,
        subtitle: true,
        status: true,
        _count: { select: { questions: true } },
      },
    });

    return {
      assessments: assessments.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        subtitle: a.subtitle,
        status: a.status,
        questionCount: a._count.questions,
      })),
    };
  });

  /** All questions for an assessment — includes correct answers (admin only). */
  app.get('/:type/questions', { preHandler: requireAdminRead }, async (request) => {
    const { type } = typeParams.parse(request.params);

    const assessment = await prisma.assessment.findFirst({
      where: { type },
      select: { id: true, type: true, title: true },
    });
    if (!assessment) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');

    const questions = await prisma.question.findMany({
      where: { assessmentId: assessment.id },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        orderIndex: true,
        text: true,
        explanation: true,
        knowledgeArea: { select: { id: true, key: true, name: true } },
        module: { select: { id: true, title: true } },
        options: {
          orderBy: { letter: 'asc' },
          select: { id: true, letter: true, text: true, isCorrect: true },
        },
      },
    });

    return { assessment, questions };
  });

  /** Update question text, knowledge area, and options. */
  app.patch('/questions/:questionId', { preHandler: requireAdminWrite }, async (request) => {
    const { questionId } = questionParams.parse(request.params);
    const body = updateQuestionSchema.parse(request.body);
    const userId = request.user!.id;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
    if (!question) throw new AppError(404, 'Question not found', 'NOT_FOUND');

    if (body.knowledgeAreaId) {
      const area = await prisma.knowledgeArea.findUnique({ where: { id: body.knowledgeAreaId } });
      if (!area) throw new AppError(400, 'Invalid knowledge area', 'BAD_REQUEST');
    }

    if (body.options) {
      const correctCount = body.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        throw new AppError(400, 'Exactly one option must be marked correct', 'BAD_REQUEST');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: {
          ...(body.text !== undefined ? { text: body.text } : {}),
          ...(body.explanation !== undefined ? { explanation: body.explanation } : {}),
          ...(body.knowledgeAreaId !== undefined ? { knowledgeAreaId: body.knowledgeAreaId } : {}),
        },
      });

      if (body.options) {
        for (const opt of body.options) {
          const existing = opt.id
            ? question.options.find((o) => o.id === opt.id)
            : question.options.find((o) => o.letter === opt.letter);

          if (existing) {
            await tx.questionOption.update({
              where: { id: existing.id },
              data: { text: opt.text, isCorrect: opt.isCorrect },
            });
          }
        }
      }
    });

    await writeAudit(userId, 'admin_question_updated', { questionId });

    return { saved: true, questionId };
  });
}
