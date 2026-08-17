import { z } from 'zod';

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

export type AuState = (typeof AU_STATES)[number];

/** Normalise to local 04xxxxxxxx format for storage. */
export function normalizeAuMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('614') && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  if (digits.startsWith('04') && digits.length === 10) {
    return digits;
  }
  throw new Error('Enter a valid Australian mobile number');
}

export const signupProfileFields = {
  firstName: z.string().trim().min(1, 'Enter your first name').max(50),
  lastName: z.string().trim().min(1, 'Enter your last name').max(50),
  mobile: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .transform((value, ctx) => {
      try {
        return normalizeAuMobile(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid Australian mobile number' });
        return z.NEVER;
      }
    }),
  suburb: z.string().trim().min(2, 'Enter your suburb').max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value): value is AuState => AU_STATES.includes(value as AuState), {
      message: 'Enter a valid Australian state or territory',
    }),
};

export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
