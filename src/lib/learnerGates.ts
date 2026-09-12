import { prisma } from '../db.js';
import { AppError } from '../middleware/errors.js';

/** Modules and lesson content stay locked until the Starting Grid baseline is complete. */
export async function assertStartingGridComplete(userId: string) {
  const startingGrid = await prisma.assessment.findFirst({
    where: { type: 'starting_grid' },
    select: { id: true },
  });
  if (!startingGrid) return;

  const completed = await prisma.assessmentAttempt.findFirst({
    where: {
      userId,
      assessmentId: startingGrid.id,
      completedAt: { not: null },
    },
    select: { id: true },
  });

  if (!completed) {
    throw new AppError(403, 'Complete the Starting Grid first', 'GRID_REQUIRED');
  }
}
