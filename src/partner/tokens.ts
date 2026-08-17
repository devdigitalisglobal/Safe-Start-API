import { SignJWT, jwtVerify } from 'jose';
import { getPartnerSigningKey } from './credentials.js';

const TOKEN_TTL_SECONDS = 3600;
const ISSUER = 'safe-start-partner-api';

export type PartnerTokenClaims = {
  partnerId: string;
  credentialId: string;
  scopes: string[];
};

declare module 'fastify' {
  interface FastifyRequest {
    partnerApi?: PartnerTokenClaims;
  }
}

export async function issuePartnerAccessToken(claims: PartnerTokenClaims) {
  return new SignJWT({
    partnerId: claims.partnerId,
    credentialId: claims.credentialId,
    scopes: claims.scopes,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(claims.credentialId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getPartnerSigningKey());
}

export async function verifyPartnerAccessToken(token: string): Promise<PartnerTokenClaims> {
  const { payload } = await jwtVerify(token, getPartnerSigningKey(), {
    issuer: ISSUER,
  });

  const partnerId = payload.partnerId;
  const credentialId = payload.credentialId;
  const scopes = payload.scopes;

  if (typeof partnerId !== 'string' || typeof credentialId !== 'string' || !Array.isArray(scopes)) {
    throw new Error('Invalid partner token payload');
  }

  return {
    partnerId,
    credentialId,
    scopes: scopes.filter((scope): scope is string => typeof scope === 'string'),
  };
}

export const PARTNER_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
