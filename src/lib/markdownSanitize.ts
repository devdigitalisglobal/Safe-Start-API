/**
 * Strip raw HTML and dangerous URL schemes from CMS markdown before storage.
 * Content is markdown-only — HTML pasted from Word etc. is removed.
 */
const HTML_TAG = /<[^>]*>/g;
const DANGEROUS_PROTOCOL = /(?:javascript|vbscript|data):/gi;

export function sanitizeMarkdown(value: string): string {
  return value
    .replace(HTML_TAG, '')
    .replace(DANGEROUS_PROTOCOL, '')
    .replace(/\0/g, '')
    .trim();
}

export function sanitizeMarkdownNullable(
  value: string | null | undefined
): string | null | undefined {
  if (value == null) return value;
  const cleaned = sanitizeMarkdown(value);
  return cleaned.length > 0 ? cleaned : null;
}

/** Zod transform helper for optional nullable markdown fields. */
export function sanitizeMarkdownField(value: string): string {
  return sanitizeMarkdown(value);
}

export function sanitizeMarkdownOptionalField(
  value: string | null | undefined
): string | null | undefined {
  return sanitizeMarkdownNullable(value);
}
