import { buildApp } from './app.js';
import { prisma } from './db.js';
import { env } from './env.js';

const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  if (env.NODE_ENV !== 'production') {
    app.log.info(`API listening on http://localhost:${env.PORT}`);
  }
} catch (err) {
  app.log.error(
    { err: err instanceof Error ? err.message : 'Unknown error' },
    'Failed to start server'
  );
  process.exit(1);
}
