import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { syncPublishedModuleKnowledgeAreas } from '../content/syncKnowledgeArea.js';

const startSchema = z.object({
    type: z.enum(['starting_grid', 'finish_line']),
});

const answerSchema = z.object({
    questionId: z.string().uuid(),
    optionId: z.string().uuid(),
});

const attemptParams = z.object({ id: z.string().uuid() });

export default async function attemptRoutes(app: FastifyInstance) {
    /** Begin an attempt. */
    app.post('/start', { preHandler: requireAuth }, async (request, reply) => {
        const { type } = startSchema.parse(request.body);
        const userId = request.user!.id;

        const assessment = await prisma.assessment.findFirst({
            where: { type, status: 'published' },
            select: { id: true, title: true, _count: { select: { questions: true } } },
        });
        if (!assessment) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');

        // Finish Line gate — ASSUMPTION, blocked on client question B11
        if (type === 'finish_line') {
            const [total, completed] = await Promise.all([
                prisma.module.count({ where: { status: 'published' } }),
                prisma.moduleProgress.count({ where: { userId, status: 'completed' } }),
            ]);
            if (completed < total) {
                throw new AppError(
                    403,
                    `Complete all ${total} modules first (${completed} done)`,
                    'MODULES_INCOMPLETE'
                );
            }
        }

        // Resume an unfinished attempt rather than starting a new one
        const open = await prisma.assessmentAttempt.findFirst({
            where: { userId, assessmentId: assessment.id, completedAt: null },
            orderBy: { attemptNumber: 'desc' },
        });
        if (open) return { ...open, resumed: true };

        const completed = await prisma.assessmentAttempt.findFirst({
            where: { userId, assessmentId: assessment.id, completedAt: { not: null } },
            select: { id: true },
        });
        if (completed) {
            throw new AppError(409, 'Assessment already completed', 'ASSESSMENT_ALREADY_COMPLETED');
        }

        const prior = await prisma.assessmentAttempt.count({
            where: { userId, assessmentId: assessment.id },
        });

        const attempt = await prisma.assessmentAttempt.create({
            data: {
                userId,
                assessmentId: assessment.id,
                attemptNumber: prior + 1,
                totalQuestions: assessment._count.questions,
            },
        });

        await prisma.event.create({
            data: {
                userId,
                schoolId: request.user!.schoolId,
                type: 'assessment_started',
                payload: { assessmentType: type, attemptNumber: attempt.attemptNumber },
            },
        });

        return reply.status(201).send({ ...attempt, resumed: false });
    });

    /** Saved selections for an in-progress attempt — no correctness exposed. */
    app.get('/:id/answers', { preHandler: requireAuth }, async (request) => {
        const { id } = attemptParams.parse(request.params);
        const userId = request.user!.id;

        const attempt = await prisma.assessmentAttempt.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                completedAt: true,
                assessment: { select: { type: true } },
            },
        });

        if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
        if (attempt.userId !== userId) throw new AppError(403, 'Not your attempt', 'FORBIDDEN');

        const answers = await prisma.assessmentAnswer.findMany({
            where: { attemptId: id },
            select: {
                questionId: true,
                selectedOptionId: true,
                isCorrect: true,
            },
        });

        const showCorrectness =
            !!attempt.completedAt && attempt.assessment.type === 'finish_line';

        return {
            answers: answers.map(a => ({
                questionId: a.questionId,
                optionId: a.selectedOptionId,
                ...(showCorrectness ? { isCorrect: a.isCorrect } : {}),
            })),
        };
    });

    /** Submit one answer. Graded server-side. */
    app.post('/:id/answer', { preHandler: requireAuth }, async (request) => {
        const { id } = attemptParams.parse(request.params);
        const body = answerSchema.parse(request.body);
        const userId = request.user!.id;

        const attempt = await prisma.assessmentAttempt.findUnique({
            where: { id },
            select: { id: true, userId: true, assessmentId: true, completedAt: true },
        });

        if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
        // Ownership check — never trust an id from the URL alone
        if (attempt.userId !== userId) throw new AppError(403, 'Not your attempt', 'FORBIDDEN');
        if (attempt.completedAt) throw new AppError(400, 'Attempt already completed', 'COMPLETED');

        const question = await prisma.question.findFirst({
            where: { id: body.questionId, assessmentId: attempt.assessmentId },
            select: {
                id: true,
                knowledgeAreaId: true,
                options: { select: { id: true, isCorrect: true } },
            },
        });
        if (!question) throw new AppError(400, 'Question not in this assessment', 'BAD_QUESTION');

        const option = question.options.find(o => o.id === body.optionId);
        if (!option) throw new AppError(400, 'Option not for this question', 'BAD_OPTION');

        // Grading happens here, never on the client
        const isCorrect = option.isCorrect;

        const alreadyAnswered = await prisma.assessmentAnswer.findUnique({
            where: { attemptId_questionId: { attemptId: id, questionId: body.questionId } },
            select: { id: true },
        });
        if (alreadyAnswered) {
            throw new AppError(409, 'Question already answered', 'ALREADY_ANSWERED');
        }

        const answer = await prisma.assessmentAnswer.create({
            data: {
                attemptId: id,
                questionId: body.questionId,
                selectedOptionId: body.optionId,
                isCorrect,
                knowledgeAreaId: question.knowledgeAreaId,
            },
        });

        await prisma.event.create({
            data: {
                userId,
                schoolId: request.user!.schoolId,
                type: 'question_answered',
                payload: { attemptId: id, questionId: body.questionId, isCorrect },
            },
        });

        // Starting Grid returns no feedback — see note below
        const assessment = await prisma.assessment.findUnique({
            where: { id: attempt.assessmentId },
            select: { type: true },
        });

        if (assessment?.type === 'starting_grid') {
            return { saved: true, questionId: answer.questionId };
        }

        const correctOptionId = question.options.find(o => o.isCorrect)?.id;
        return { saved: true, questionId: answer.questionId, isCorrect, correctOptionId };
    });

    /** Finish an attempt and compute the score. */
    app.post('/:id/complete', { preHandler: requireAuth }, async (request) => {
        const { id } = attemptParams.parse(request.params);
        const userId = request.user!.id;

        const attempt = await prisma.assessmentAttempt.findUnique({
            where: { id },
            select: {
                id: true, userId: true, assessmentId: true,
                completedAt: true, totalQuestions: true,
            },
        });

        if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
        if (attempt.userId !== userId) throw new AppError(403, 'Not your attempt', 'FORBIDDEN');
        if (attempt.completedAt) {
            return prisma.assessmentAttempt.findUnique({ where: { id } });
        }

        const answers = await prisma.assessmentAnswer.findMany({
            where: { attemptId: id },
            select: { isCorrect: true },
        });

        const score = answers.filter(a => a.isCorrect).length;

        const updated = await prisma.assessmentAttempt.update({
            where: { id },
            data: { completedAt: new Date(), totalScore: score },
        });

        const assessment = await prisma.assessment.findUnique({
            where: { id: attempt.assessmentId },
            select: { type: true },
        });

        await prisma.event.create({
            data: {
                userId,
                schoolId: request.user!.schoolId,
                type: 'assessment_completed',
                payload: {
                    assessmentType: assessment?.type,
                    score,
                    total: attempt.totalQuestions,
                },
            },
        });

        return updated;
    });

    /**
     * The improvement table — Starting Grid vs Finish Line by knowledge area.
     * This is the client's headline KPI.
     */
    app.get('/results', { preHandler: requireAuth }, async (request) => {
        const userId = request.user!.id;

        await syncPublishedModuleKnowledgeAreas();

        const areas = await prisma.knowledgeArea.findMany({
            orderBy: { orderIndex: 'asc' },
            select: { id: true, key: true, name: true },
        });

        async function latestScores(type: string) {
            const assessment = await prisma.assessment.findFirst({
                where: { type },
                select: { id: true },
            });
            if (!assessment) return null;

            const attempt = await prisma.assessmentAttempt.findFirst({
                where: { userId, assessmentId: assessment.id, completedAt: { not: null } },
                orderBy: { completedAt: 'desc' },
                select: { id: true, totalScore: true, totalQuestions: true, completedAt: true },
            });
            if (!attempt) return null;

            const raw = await prisma.assessmentAnswer.findMany({
                where: { attemptId: attempt.id },
                select: { knowledgeAreaId: true, isCorrect: true },
            });

            const byArea = new Map<string, { correct: number; total: number }>();
            for (const a of raw) {
                const cur = byArea.get(a.knowledgeAreaId) ?? { correct: 0, total: 0 };
                cur.total += 1;
                if (a.isCorrect) cur.correct += 1;
                byArea.set(a.knowledgeAreaId, cur);
            }

            return { attempt, byArea };
        }


        
        const [start, finish] = await Promise.all([
            latestScores('starting_grid'),
            latestScores('finish_line'),
        ]);

        const rows = areas.map(area => {
            const s = start?.byArea.get(area.id);
            const f = finish?.byArea.get(area.id);
            const sPct = s && s.total ? Math.round((s.correct / s.total) * 100) : null;
            const fPct = f && f.total ? Math.round((f.correct / f.total) * 100) : null;
            return {
                key: area.key,
                name: area.name,
                startingGrid: sPct,
                finishLine: fPct,
                improvement: sPct !== null && fPct !== null ? fPct - sPct : null,
            };
        });

        const sOverall = start
            ? Math.round((start.attempt.totalScore! / start.attempt.totalQuestions!) * 100)
            : null;
        const fOverall = finish
            ? Math.round((finish.attempt.totalScore! / finish.attempt.totalQuestions!) * 100)
            : null;

        return {
            startingGrid: start
                ? {
                    score: start.attempt.totalScore,
                    total: start.attempt.totalQuestions,
                    percent: sOverall,
                    completedAt: start.attempt.completedAt,
                }
                : null,
            finishLine: finish
                ? {
                    score: finish.attempt.totalScore,
                    total: finish.attempt.totalQuestions,
                    percent: fOverall,
                    completedAt: finish.attempt.completedAt,
                }
                : null,
            overallImprovement: sOverall !== null && fOverall !== null ? fOverall - sOverall : null,
            knowledgeAreas: rows,
        };
    });
}