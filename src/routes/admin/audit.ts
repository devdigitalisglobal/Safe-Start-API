import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { buildAuditCsv } from '../../admin/auditExport.js';
import { requireAdminWrite } from '../../middleware/admin.js';

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z
    .string()
    .regex(/^admin_[a-z0-9_]+$/)
    .optional(),
});

function buildWhere(filters: z.infer<typeof auditQuerySchema>) {
  return {
    type: filters.type ?? { startsWith: 'admin_' },
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

async function fetchAuditEvents(filters: z.infer<typeof auditQuerySchema>) {
  const events = await prisma.event.findMany({
    where: buildWhere(filters),
    orderBy: { occurredAt: 'desc' },
    take: filters.limit,
    select: {
      id: true,
      type: true,
      payload: true,
      occurredAt: true,
      user: { select: { email: true, fullName: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    payload: e.payload,
    occurredAt: e.occurredAt.toISOString(),
    actor: e.user ? { email: e.user.email, fullName: e.user.fullName } : null,
  }));
}

export default async function adminAuditRoutes(app: FastifyInstance) {
  /** CSV export — staff only; supports date and action filters. */
  app.get('/export/csv', { preHandler: requireAdminWrite }, async (request, reply) => {
    const filters = auditQuerySchema.parse(request.query);
    const events = await fetchAuditEvents({ ...filters, limit: 1000 });
    const csv = buildAuditCsv(events);

    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="safe-start-audit-${stamp}.csv"`);
    return reply.send(csv);
  });

  /** Recent admin audit events — staff only; no student PII in payload. */
  app.get('/', { preHandler: requireAdminWrite }, async (request) => {
    const filters = auditQuerySchema.parse(request.query);
    const events = await fetchAuditEvents(filters);
    return { events };
  });
}
