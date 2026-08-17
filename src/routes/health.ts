import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { verifyToken, requireAuth } from '../middleware/auth.js';
import { env } from '../env.js';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  app.get('/health/db', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (env.NODE_ENV === 'production') {
        return { status: 'ok', database: 'connected' };
      }

      const modules = await prisma.module.count();
      const questions = await prisma.question.count();
      return { status: 'ok', database: 'connected', modules, questions };
    } catch (err) {
      const hint =
        err instanceof Error ? err.message.replace(/password[^\s]*/gi, '[redacted]') : 'unknown';
      request.log.error({ err }, 'Database health check failed');
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        hint: hint.slice(0, 200),
        requestId: request.id,
      });
    }
  });

  /** Dev-only — returns auth claims; disabled in production. */
  if (env.NODE_ENV !== 'production') {
    app.get('/health/token', { preHandler: verifyToken }, async (request) => ({
      status: 'ok',
      authId: request.authId,
      email: request.authEmail,
    }));

    app.get('/health/auth', { preHandler: requireAuth }, async (request) => ({
      status: 'ok',
      user: request.user,
    }));
  }
}