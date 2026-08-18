import { AppError } from '../middleware/errors.js';

function decodeBase64Url(segment: string) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function getBearerToken(authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice(7);
}

export function getTokenAal(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(decodeBase64Url(payload)) as { aal?: string };
    return claims.aal ?? null;
  } catch {
    return null;
  }
}

export function requireTokenAal2(authorization: string | undefined) {
  const token = getBearerToken(authorization);
  if (!token || getTokenAal(token) !== 'aal2') {
    throw new AppError(403, 'Complete MFA verification first', 'MFA_REQUIRED');
  }
}
