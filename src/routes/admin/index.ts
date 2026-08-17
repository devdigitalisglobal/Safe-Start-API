import type { FastifyInstance } from 'fastify';
import adminModuleRoutes from './modules.js';
import adminAssessmentRoutes from './assessments.js';
import adminSchoolRoutes from './schools.js';
import adminAuditRoutes from './audit.js';
import adminMediaRoutes from './media.js';
import adminPartnerRoutes from './partners.js';
import adminResourceRoutes from './resources.js';

export default async function adminRoutes(app: FastifyInstance) {
  await app.register(adminModuleRoutes, { prefix: '/modules' });
  await app.register(adminAssessmentRoutes, { prefix: '/assessments' });
  await app.register(adminSchoolRoutes, { prefix: '/schools' });
  await app.register(adminAuditRoutes, { prefix: '/audit' });
  await app.register(adminMediaRoutes, { prefix: '/media' });
  await app.register(adminPartnerRoutes, { prefix: '/partners' });
  await app.register(adminResourceRoutes, { prefix: '/resources' });
}
