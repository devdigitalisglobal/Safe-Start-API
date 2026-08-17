import type { FastifyInstance } from 'fastify';
import partnerTokenRoutes from './token.js';
import partnerReportRoutes from './reports.js';

export default async function partnerRoutes(app: FastifyInstance) {
  await app.register(partnerTokenRoutes);
  await app.register(partnerReportRoutes);
}
