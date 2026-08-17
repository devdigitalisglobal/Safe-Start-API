import { createHash, randomBytes } from 'node:crypto';
import { env } from '../env.js';

export function hashPartnerSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function verifyPartnerSecret(secret: string, secretHash: string) {
  return hashPartnerSecret(secret) === secretHash;
}

export function generateClientId(partnerSlug: string) {
  const suffix = randomBytes(6).toString('hex');
  return `ss_${partnerSlug}_${suffix}`;
}

export function generateClientSecret() {
  return randomBytes(32).toString('base64url');
}

export function getPartnerSigningKey() {
  if (!env.PARTNER_API_SIGNING_KEY) {
    throw new Error('PARTNER_API_SIGNING_KEY is required — set it in .env (see .env.example)');
  }
  return new TextEncoder().encode(env.PARTNER_API_SIGNING_KEY);
}

export function parseScopes(scopes: string) {
  return scopes
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}
