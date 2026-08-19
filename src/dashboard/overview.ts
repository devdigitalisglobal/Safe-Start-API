import type { DashboardScope } from '../middleware/scope.js';
import type { DashboardFilters } from './metrics.js';
import { loadSharedDashboardContext } from './context.js';
import { computeEngagement, computeImprovement, computeLearning, computeReach } from './sections.js';

export async function computeDashboardOverview(scope: DashboardScope, filters: DashboardFilters) {
  const shared = await loadSharedDashboardContext(scope);
  const [improvement, reach, engagement, learning] = await Promise.all([
    computeImprovement(scope, filters, shared),
    computeReach(scope, filters),
    computeEngagement(scope, filters, shared),
    computeLearning(scope, filters, shared),
  ]);
  return { improvement, reach, engagement, learning };
}
