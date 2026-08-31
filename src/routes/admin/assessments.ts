import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAdminRead, requireAdminWrite } from '../../middleware/admin.js';
import { AppError } from '../../middleware/errors.js';
import { sanitizeMarkdownField, sanitizeMarkdownNullable } from '../../lib/markdownSanitize.js';
import { writeAudit } from './writeAudit.js';

const typeParams = z.object({
  type: z.enum(['starting_grid', 'finish_line']),
});

const questionParams = z.object({
  questionId: z.string().uuid(),
});

const updateQuestionSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .transform((val) => (val === undefined ? val : sanitizeMarkdownField(val))),
  explanation: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((val) => (val === undefined ? val : sanitizeMarkdownNullable(val))),
  knowledgeAreaId: z.string().uuid().optional(),
  moduleId: z.string().uuid().nullable().optional(),
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

const createQuestionSchema = z.object({
  text: z.string().min(1).max(2000).transform(sanitizeMarkdownField),
  explanation: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((val) => sanitizeMarkdownNullable(val ?? null)),
  knowledgeAreaId: z.string().uuid(),
  moduleId: z.string().uuid().nullable().optional(),
  options: z
    .array(
      z.object({
        letter: z.enum(['A', 'B', 'C', 'D']),
        text: z.string().min(1).max(1000),
        isCorrect: z.boolean(),
      })
    )
    .length(4),
});

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function validateQuestionOptions(
  options: { letter: string; isCorrect: boolean }[],
  label: string
) {
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    throw new AppError(400, `${label} must have exactly one correct option`, 'BAD_REQUEST');
  }
  const letters = options.map((o) => o.letter).sort().join(',');
  if (letters !== 'A,B,C,D') {
    throw new AppError(400, `${label} must have options A through D`, 'BAD_REQUEST');
  }
}

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

  /** Create a new assessment question. */
  app.post('/:type/questions', { preHandler: requireAdminWrite }, async (request, reply) => {
    const { type } = typeParams.parse(request.params);
    const body = createQuestionSchema.parse(request.body);
    const userId = request.user!.id;

    const assessment = await prisma.assessment.findFirst({
      where: { type },
      select: { id: true },
    });
    if (!assessment) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');

    const area = await prisma.knowledgeArea.findUnique({ where: { id: body.knowledgeAreaId } });
    if (!area) throw new AppError(400, 'Invalid knowledge area', 'BAD_REQUEST');

    if (body.moduleId) {
      const module = await prisma.module.findUnique({ where: { id: body.moduleId } });
      if (!module) throw new AppError(400, 'Invalid module', 'BAD_REQUEST');
    }

    validateQuestionOptions(body.options, 'Question');

    const maxOrder = await prisma.question.aggregate({
      where: { assessmentId: assessment.id },
      _max: { orderIndex: true },
    });
    const orderIndex = (maxOrder._max.orderIndex ?? 0) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          assessmentId: assessment.id,
          orderIndex,
          text: body.text,
          explanation: body.explanation ?? null,
          knowledgeAreaId: body.knowledgeAreaId,
          moduleId: body.moduleId ?? null,
        },
      });

      for (const letter of OPTION_LETTERS) {
        const opt = body.options.find((o) => o.letter === letter)!;
        await tx.questionOption.create({
          data: {
            questionId: question.id,
            letter,
            text: opt.text,
            isCorrect: opt.isCorrect,
          },
        });
      }

      return question;
    });

    await writeAudit(userId, 'admin_question_created', {
      questionId: created.id,
      assessmentType: type,
      orderIndex,
    });

    return reply.status(201).send({ id: created.id, orderIndex });
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

    if (body.moduleId) {
      const module = await prisma.module.findUnique({ where: { id: body.moduleId } });
      if (!module) throw new AppError(400, 'Invalid module', 'BAD_REQUEST');
    }

    if (body.options) {
      validateQuestionOptions(body.options, 'Question');
    }

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: {
          ...(body.text !== undefined ? { text: body.text } : {}),
          ...(body.explanation !== undefined ? { explanation: body.explanation } : {}),
          ...(body.knowledgeAreaId !== undefined ? { knowledgeAreaId: body.knowledgeAreaId } : {}),
          ...(body.moduleId !== undefined ? { moduleId: body.moduleId } : {}),
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
