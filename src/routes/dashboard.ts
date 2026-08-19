import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireDashboardAccess } from '../middleware/dashboard.js';
import { resolveDashboardScope } from '../middleware/scope.js';
import { getDashboardOverviewCached, getDashboardSchoolsCached } from '../dashboard/cachedOverview.js';
import { buildDashboardCsv, buildDashboardPdfHtml } from '../dashboard/export.js';
import { renderPdfFromHtml } from '../dashboard/puppeteer.js';
import { dashboardFiltersSchema } from '../dashboard/metrics.js';
import {
  computeEngagement,
  computeImprovement,
  computeLearning,
  computeReach,
} from '../dashboard/sections.js';

async function loadSchoolsForUser(user: {
  role: string;
  schoolId: string | null;
  partnerId: string | null;
}) {
  if (user.role === 'school_admin') {
    if (!user.schoolId) return { schools: [] };
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { id: true, name: true },
    });
    return { schools: school ? [school] : [] };
  }

  if (user.role === 'partner') {
    if (!user.partnerId) return { schools: [] };
    const schools = await prisma.school.findMany({
      where: { partnerId: user.partnerId, status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { schools };
  }

  const schools = await prisma.school.findMany({
    where: { status: 'active' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return { schools };
}

export default async function dashboardRoutes(app: FastifyInstance) {
  /** Schools list for dashboard filter (scoped by role). */
  app.get('/schools', { preHandler: requireDashboardAccess }, async (request) => {
    const user = request.user!;
    return getDashboardSchoolsCached(user, () => loadSchoolsForUser(user), request.log);
  });

  /**
   * Reach — downloads, registrations, schools, invite conversion, MAU.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/reach', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    return computeReach(scope, filters);
  });

  /**
   * Engagement — module starts/completions, completion rate, time, drop-off, popularity.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/engagement', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    return computeEngagement(scope, filters);
  });

  /**
   * Learning — pre/post scores, pass rate, most-missed questions, re-attempt rate.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/learning', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    return computeLearning(scope, filters);
  });

  /**
   * Hero KPI — program-wide improvement by knowledge area.
   * Aggregate only; never returns student-level rows.
   */
  app.get('/improvement', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    return computeImprovement(scope, filters);
  });

  /** All reporting sections in one response — same payloads as the four section endpoints. */
  app.get('/overview', { preHandler: requireDashboardAccess }, async (request) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    return getDashboardOverviewCached(request.user!, scope, filters, request.log);
  });

  /** CSV export — respects active filters and suppression rules. */
  app.get('/export/csv', { preHandler: requireDashboardAccess }, async (request, reply) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    const { improvement, reach, engagement, learning } = await getDashboardOverviewCached(
      request.user!,
      scope,
      filters,
      request.log
    );

    const csv = buildDashboardCsv({
      filters: {
        schoolId: filters.schoolId,
        from: filters.from?.toISOString().slice(0, 10),
        to: filters.to?.toISOString().slice(0, 10),
      },
      improvement,
      reach,
      engagement,
      learning,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="safe-start-dashboard-${stamp}.csv"`);
    return reply.send(csv);
  });

  /** Branded PDF export — hero KPI layout; respects filters and suppression. */
  app.get('/export/pdf', { preHandler: requireDashboardAccess }, async (request, reply) => {
    const filters = dashboardFiltersSchema.parse(request.query);
    const scope = await resolveDashboardScope(request, filters.schoolId);
    const { improvement, reach, engagement } = await getDashboardOverviewCached(
      request.user!,
      scope,
      filters,
      request.log
    );

    const html = buildDashboardPdfHtml({
      filters: {
        schoolId: filters.schoolId,
        from: filters.from?.toISOString().slice(0, 10),
        to: filters.to?.toISOString().slice(0, 10),
      },
      improvement,
      reach,
      engagement,
    });

    const pdf = await renderPdfFromHtml(html);

    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="safe-start-dashboard-${stamp}.pdf"`);
    return reply.send(pdf);
  });
}
