/**
 * Generates production-only secrets for Vercel env vars.
 * Run locally — never commit output. Paste values into Vercel → API → Production.
 *
 *   npm run ops:generate-secrets
 */
import { randomBytes } from 'node:crypto';

const pepper = randomBytes(32).toString('base64');
const signingKey = randomBytes(32).toString('base64');

console.log('');
console.log('Safe Start API — production secrets (copy each value once, then discard this output)');
console.log('Vercel → Safe-Start-API → Settings → Environment Variables → Production');
console.log('');
console.log('MFA_RECOVERY_PEPPER=' + pepper);
console.log('PARTNER_API_SIGNING_KEY=' + signingKey);
console.log('');
console.log('Also confirm these are set (API returns 500 until all pass env validation):');
console.log('  NODE_ENV=production');
console.log('  CORS_ORIGINS=https://safe-start-dashboard.vercel.app  (comma-list, not *)');
console.log('  DIRECT_URL=<Supabase session pooler URL>');
console.log('');
console.log('After saving → Redeploy → curl.exe https://safe-start-api-o1n3-eight.vercel.app/health');
console.log('');
