import { prisma } from '../db.js';
import { roundPct } from './metrics.js';

type AreaScores = Map<string, { correct: number; total: number }>;

export async function scoresByKnowledgeAreaForAttempts(attemptIds: string[]) {
  if (attemptIds.length === 0) return new Map<string, AreaScores>();

  const answers = await prisma.assessmentAnswer.findMany({
    where: { attemptId: { in: attemptIds } },
    select: { attemptId: true, knowledgeAreaId: true, isCorrect: true },
  });

  const byAttempt = new Map<string, AreaScores>();
  for (const a of answers) {
    let byArea = byAttempt.get(a.attemptId);
    if (!byArea) {
      byArea = new Map();
      byAttempt.set(a.attemptId, byArea);
    }
    const cur = byArea.get(a.knowledgeAreaId) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (a.isCorrect) cur.correct += 1;
    byArea.set(a.knowledgeAreaId, cur);
  }
  return byAttempt;
}

export function pctFromAreaScores(byArea: AreaScores, areaId: string) {
  const s = byArea.get(areaId);
  if (!s) return null;
  return roundPct(s.correct, s.total);
}

export async function latestCompletedAttemptsByUser(
  assessmentId: string,
  userIds: string[],
  completedAt?: { gte?: Date; lte?: Date }
) {
  if (userIds.length === 0) return new Map<string, { id: string }>();

  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      assessmentId,
      userId: { in: userIds },
      completedAt: { not: null, ...completedAt },
    },
    select: { id: true, userId: true, completedAt: true },
    orderBy: { completedAt: 'desc' },
  });

  const latest = new Map<string, { id: string }>();
  for (const a of attempts) {
    if (!latest.has(a.userId)) latest.set(a.userId, { id: a.id });
  }
  return latest;
}
