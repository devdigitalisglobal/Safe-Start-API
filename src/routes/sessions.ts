import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes — one event per app open, not per request

export default async function sessionRoutes(app: FastifyInstance) {
  /** Record an app session for MAU / engagement metrics. Idempotent within the gap window. */
  app.post('/start', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    const cutoff = new Date(Date.now() - SESSION_GAP_MS);

    const recent = await prisma.event.findFirst({
      where: {
        userId,
        type: 'session_started',
        occurredAt: { gte: cutoff },
      },
      select: { id: true },
    });

    if (recent) return { recorded: false };

    await prisma.event.create({
      data: {
        userId,
        schoolId: request.user!.schoolId,
        type: 'session_started',
        payload: {},
      },
    });

    return { recorded: true };
  });
}
