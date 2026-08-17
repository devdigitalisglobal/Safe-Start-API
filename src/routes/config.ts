import type { FastifyInstance } from 'fastify';
import { optionalAuth } from '../middleware/auth.js';
import { getBrandingForUser } from '../partners/resolve.js';

export default async function configRoutes(app: FastifyInstance) {
  /**
   * Partner branding for the learner app.
   * No auth → default partner. With auth → school-linked partner when set.
   */
  app.get('/branding', { preHandler: optionalAuth }, async (request) => {
    const branding = await getBrandingForUser(request.user?.id);

    return (
      branding ?? {
        partnerSlug: 'default',
        partnerName: null,
        logoUrl: null,
        logoAlt: null,
        updatedAt: new Date(0).toISOString(),
      }
    );
  });
}
