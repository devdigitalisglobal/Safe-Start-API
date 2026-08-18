import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { AppError } from '../middleware/errors.js';
import { supabaseAdmin } from '../storage.js';

export const RECOVERY_CODE_COUNT = 10;

function recoveryPepper() {
  return env.MFA_RECOVERY_PEPPER ?? env.SUPABASE_SERVICE_KEY.slice(0, 32);
}

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function hashRecoveryCode(code: string) {
  return createHmac('sha256', recoveryPepper()).update(normalizeRecoveryCode(code)).digest('hex');
}

function generatePlainRecoveryCode() {
  const raw = randomBytes(5).toString('hex').toUpperCase().slice(0, 10);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
}

type SupabaseFactor = {
  id: string;
  status?: string;
  factor_type?: string;
  factorType?: string;
};

export async function listUserMfaFactors(userId: string): Promise<SupabaseFactor[]> {
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) {
    throw new AppError(502, 'Could not load MFA factors', 'MFA_LOOKUP_FAILED');
  }
  return (data?.factors as SupabaseFactor[] | undefined) ?? [];
}

export async function isMfaEnrolled(userId: string) {
  const factors = await listUserMfaFactors(userId);
  return factors.some((factor) => {
    const type = factor.factor_type ?? factor.factorType;
    return factor.status === 'verified' && type === 'totp';
  });
}

export async function deleteAllMfaFactors(userId: string) {
  const factors = await listUserMfaFactors(userId);
  for (const factor of factors) {
    const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (error) {
      throw new AppError(502, 'Could not reset MFA factors', 'MFA_RESET_FAILED');
    }
  }
  return factors.length;
}

export async function countUnusedRecoveryCodes(userId: string) {
  return prisma.mfaRecoveryCode.count({
    where: { userId, usedAt: null },
  });
}

export async function invalidateRecoveryCodes(userId: string) {
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
}

export async function generateRecoveryCodes(userId: string) {
  const plaintextCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generatePlainRecoveryCode());

  await prisma.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({
      data: plaintextCodes.map((code) => ({
        id: randomUUID(),
        userId,
        codeHash: hashRecoveryCode(code),
      })),
    });
  });

  return plaintextCodes;
}

export async function redeemRecoveryCode(userId: string, code: string) {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length < 8) {
    throw new AppError(400, 'Invalid recovery code', 'BAD_RECOVERY_CODE');
  }

  const hash = hashRecoveryCode(code);
  const row = await prisma.mfaRecoveryCode.findFirst({
    where: { userId, codeHash: hash, usedAt: null },
  });

  if (!row) {
    throw new AppError(400, 'Recovery code is invalid or already used', 'BAD_RECOVERY_CODE');
  }

  await prisma.mfaRecoveryCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  const removedFactors = await deleteAllMfaFactors(userId);

  return { removedFactors };
}

export async function resetUserMfa(userId: string) {
  await invalidateRecoveryCodes(userId);
  const removedFactors = await deleteAllMfaFactors(userId);
  return { removedFactors };
}

export async function getMfaStatus(userId: string) {
  const [mfaEnrolled, unusedRecoveryCodes] = await Promise.all([
    isMfaEnrolled(userId),
    countUnusedRecoveryCodes(userId),
  ]);

  return { mfaEnrolled, unusedRecoveryCodes };
}
