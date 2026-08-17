import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../db.js';

export async function writeAudit(
  userId: string,
  type: string,
  payload: Prisma.InputJsonValue
) {
  await prisma.event.create({
    data: { userId, type, payload },
  });
}
