import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env } from './env.js';

export const CMS_MEDIA_BUCKET = 'cms-media';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let bucketReady = false;

export async function ensureMediaBucket() {
  if (bucketReady) return;

  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw listError;

  const exists = buckets.some((bucket) => bucket.name === CMS_MEDIA_BUCKET);
  if (!exists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(CMS_MEDIA_BUCKET, {
      public: true,
      fileSizeLimit: MAX_MEDIA_BYTES,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    });
    if (createError) throw createError;
  }

  bucketReady = true;
}

const MIME_ALIASES: Record<string, string> = {
  'image/x-png': 'image/png',
  'image/pjpeg': 'image/jpeg',
};

export function normalizeMediaMimeType(mimeType: string | undefined | null): string | null {
  const trimmed = mimeType?.trim().toLowerCase() ?? '';
  if (!trimmed) return null;
  if (MIME_ALIASES[trimmed]) return MIME_ALIASES[trimmed];
  return ALLOWED_MIME_TYPES.has(trimmed) ? trimmed : null;
}

export function isAllowedMediaMimeType(mimeType: string) {
  return normalizeMediaMimeType(mimeType) !== null;
}

/** Sniff image type from magic bytes — do not trust client Content-Type alone. */
export function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Sniff supported media type from magic bytes. */
export function detectMediaMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return detectImageMimeType(buffer);
}

export function buildStorageKey(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
  return `${randomUUID()}-${safeName || 'upload'}`;
}

export function getPublicUrl(storageKey: string) {
  const { data } = supabaseAdmin.storage.from(CMS_MEDIA_BUCKET).getPublicUrl(storageKey);
  return data.publicUrl;
}

export async function uploadMediaFile(storageKey: string, buffer: Buffer, mimeType: string) {
  await ensureMediaBucket();

  const { error } = await supabaseAdmin.storage
    .from(CMS_MEDIA_BUCKET)
    .upload(storageKey, buffer, { contentType: mimeType, upsert: false });

  if (error) throw error;
}

export async function deleteMediaFile(storageKey: string) {
  await ensureMediaBucket();

  const { error } = await supabaseAdmin.storage.from(CMS_MEDIA_BUCKET).remove([storageKey]);
  if (error) throw error;
}
