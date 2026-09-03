import { z } from 'zod';

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

export type AuState = (typeof AU_STATES)[number];

/**
 * Education type and licence status (client revision, Sep 2026).
 * Keys are stable — only the display labels may change.
 */
export const EDUCATION_TYPE_VALUES = ['high_school', 'tertiary'] as const;
export type EducationType = (typeof EDUCATION_TYPE_VALUES)[number];

export const EDUCATION_TYPE_LABELS: Record<EducationType, string> = {
  high_school: 'High school',
  tertiary: 'Tertiary',
};

/** Ordered along the NSW licensing pathway. */
export const LICENCE_STATUS_VALUES = [
  'unlicensed',
  'learner',
  'provisional_p1',
  'provisional_p2',
  'full',
] as const;
export type LicenceStatus = (typeof LICENCE_STATUS_VALUES)[number];

export const LICENCE_STATUS_LABELS: Record<LicenceStatus, string> = {
  unlicensed: 'Not yet licensed',
  learner: 'L plate (Learner)',
  provisional_p1: 'P plate – P1 (red)',
  provisional_p2: 'P plate – P2 (green)',
  full: 'Full (unrestricted) licence',
};

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
  // P1: optional so the current app build keeps working. Flipped to required in P6
  // once the updated app is released (see SIGNUP-PROFILE-FIELDS-PLAN.md).
  educationType: z.enum(EDUCATION_TYPE_VALUES).optional(),
  licenceStatus: z.enum(LICENCE_STATUS_VALUES).optional(),
};

export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
