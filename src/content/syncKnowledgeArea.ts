import { prisma } from '../db.js';

type ModuleRef = {
  id: string;
  slug: string;
  title: string;
  orderIndex: number;
};

/** Keep KnowledgeArea rows aligned with published modules for the improvement table. */
export async function ensureKnowledgeAreaForModule(module: ModuleRef) {
  const linkedQuestion = await prisma.question.findFirst({
    where: { moduleId: module.id },
    select: { knowledgeAreaId: true },
  });

  if (linkedQuestion) {
    await prisma.knowledgeArea.update({
      where: { id: linkedQuestion.knowledgeAreaId },
      data: { name: module.title, orderIndex: module.orderIndex },
    });
    return;
  }

  await prisma.knowledgeArea.upsert({
    where: { key: module.slug },
    create: {
      key: module.slug,
      name: module.title,
      orderIndex: module.orderIndex,
    },
    update: {
      name: module.title,
      orderIndex: module.orderIndex,
    },
  });
}

/** Backfill knowledge areas for CMS modules that pre-date auto-sync. */
export async function syncPublishedModuleKnowledgeAreas() {
  const modules = await prisma.module.findMany({
    where: { status: 'published' },
    select: { id: true, slug: true, title: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' },
  });

  for (const module of modules) {
    await ensureKnowledgeAreaForModule(module);
  }
}
