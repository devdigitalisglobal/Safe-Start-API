import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './env.js';
import { prisma } from './db.js';
import { registerErrorHandler } from './middleware/errors.js';
import { rateLimit } from './middleware/rateLimit.js';
import healthRoutes from './routes/health.js';
import userRoutes from './routes/users.js';
import moduleRoutes from './routes/modules.js';
import assessmentRoutes from './routes/assessments.js';
import progressRoutes from './routes/progress.js';
import attemptRoutes from './routes/attempts.js';
import sessionRoutes from './routes/sessions.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin/index.js';
import resourceRoutes from './routes/resources.js';
import configRoutes from './routes/config.js';
import partnerRoutes from './routes/partner/index.js';

const isProduction = env.NODE_ENV === 'production';

const app = Fastify({
  logger: {
    level: isProduction ? 'warn' : 'info',
    transport: isProduction
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
    redact: {
      paths: [
        'req.headers.authorization',
        'headers.authorization',
        'body.password',
        'body.client_secret',
        'body.memberRef',
      ],
      censor: '[REDACTED]',
    },
  },
  trustProxy: isProduction,
});

await app.register(helmet, {
  contentSecurityPolicy: isProduction
    ? {
        directives: {
          defaultSrc: ["'none'"],
        },
      }
    : false,
  hsts: isProduction
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false,
});

await app.register(cors, {
  origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
});

app.addHook('onRequest', rateLimit({ keyPrefix: 'global', limit: 120, windowMs: 60_000 }));

registerErrorHandler(app);

await app.register(healthRoutes);
await app.register(userRoutes, { prefix: '/users' });
await app.register(moduleRoutes, { prefix: '/modules' });
await app.register(assessmentRoutes, { prefix: '/assessments' });
await app.register(progressRoutes, { prefix: '/progress' });
await app.register(attemptRoutes, { prefix: '/attempts' });
await app.register(sessionRoutes, { prefix: '/sessions' });
await app.register(dashboardRoutes, { prefix: '/dashboard' });
await app.register(adminRoutes, { prefix: '/admin' });
await app.register(resourceRoutes, { prefix: '/resources' });
await app.register(configRoutes, { prefix: '/config' });
await app.register(partnerRoutes, { prefix: '/partner/v1' });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  if (!isProduction) {
    app.log.info(`API listening on http://localhost:${env.PORT}`);
  }
} catch (err) {
  app.log.error(
    { err: err instanceof Error ? err.message : 'Unknown error' },
    'Failed to start server'
  );
  process.exit(1);
}
