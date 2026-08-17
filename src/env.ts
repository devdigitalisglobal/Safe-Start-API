import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_KEY: z.string().min(20),
    SUPABASE_ANON_KEY: z.string().min(20).optional(),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGINS: z.string().default('*'),
    PARTNER_API_SIGNING_KEY: z.string().min(32).optional(),
  })
  .refine(
    (data) => !(data.NODE_ENV === 'production' && data.CORS_ORIGINS === '*'),
    {
      message: 'CORS_ORIGINS must not be "*" in production — set explicit allowed origins',
      path: ['CORS_ORIGINS'],
    }
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || Boolean(data.PARTNER_API_SIGNING_KEY),
    {
      message: 'PARTNER_API_SIGNING_KEY is required in production',
      path: ['PARTNER_API_SIGNING_KEY'],
    }
  )
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      data.DATABASE_URL.includes('supabase.com') ||
      /sslmode=(require|verify-full)/.test(data.DATABASE_URL),
    {
      message:
        'DATABASE_URL must use TLS in production (Supabase pooler or append ?sslmode=require)',
      path: ['DATABASE_URL'],
    }
  );

function formatEnvErrors(error: z.ZodError): string {
  const formatted = error.format();
  const messages: string[] = [];

  for (const [field, detail] of Object.entries(formatted)) {
    if (field === '_errors') continue;
    const fieldErrors = (detail as { _errors?: string[] })._errors;
    if (fieldErrors?.length) {
      messages.push(`${field}: ${fieldErrors.join(', ')}`);
    }
  }

  return messages.length > 0
    ? messages.join('; ')
    : 'Invalid environment configuration — check Vercel env vars';
}

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = formatEnvErrors(parsed.error);
  console.error('Invalid environment configuration:', detail);
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  throw new Error(detail);
}

export const env = parsed.data;