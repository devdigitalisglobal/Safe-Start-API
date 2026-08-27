import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireAdminRead, requireAdminWrite } from '../../middleware/admin.js';
import { AppError } from '../../middleware/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import {
  MAX_MEDIA_BYTES,
  buildStorageKey,
  deleteMediaFile,
  getPublicUrl,
  isAllowedMediaMimeType,
  detectMediaMimeType,
  normalizeMediaMimeType,
  uploadMediaFile,
} from '../../storage.js';
import { writeAudit } from './writeAudit.js';

const idParams = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default async function adminMediaRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: MAX_MEDIA_BYTES, files: 1 },
  });

  /** List uploaded media assets — newest first. */
  app.get('/', { preHandler: requireAdminRead }, async (request) => {
    const { limit } = listQuerySchema.parse(request.query);

    const assets = await prisma.mediaAsset.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        fileName: true,
        publicUrl: true,
        altText: true,
        mimeType: true,
        byteSize: true,
        createdAt: true,
        uploadedBy: { select: { fullName: true } },
      },
    });

    return {
      assets: assets.map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        publicUrl: asset.publicUrl,
        altText: asset.altText,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        createdAt: asset.createdAt.toISOString(),
        uploadedBy: asset.uploadedBy.fullName,
      })),
    };
  });

  /** Upload an image with required alt text (WCAG). */
  app.post('/', {
    preHandler: [
      requireAdminWrite,
      rateLimit({ keyPrefix: 'media-upload', limit: 30, windowMs: 3_600_000, by: 'user' }),
    ],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const data = await request.file();

    if (!data) {
      throw new AppError(400, 'File is required', 'BAD_REQUEST');
    }

    const altField = data.fields.altText;
    let altText = '';
    if (altField && !Array.isArray(altField) && 'value' in altField) {
      altText = String(altField.value).trim();
    } else if (Array.isArray(altField) && altField[0] && 'value' in altField[0]) {
      altText = String(altField[0].value).trim();
    }

    if (altText.length < 1 || altText.length > 500) {
      throw new AppError(
        400,
        'Alt text is required (1–500 characters). Send altText before the file in multipart forms.',
        'BAD_REQUEST'
      );
    }

    const buffer = await data.toBuffer();
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new AppError(400, 'File must be 5 MB or smaller', 'BAD_REQUEST');
    }

    const sniffedMime = detectMediaMimeType(buffer);
    if (!sniffedMime || !isAllowedMediaMimeType(sniffedMime)) {
      throw new AppError(400, 'File content is not a supported image or PDF type', 'BAD_REQUEST');
    }

    const declaredMime = normalizeMediaMimeType(data.mimetype);
    if (declaredMime && declaredMime !== sniffedMime) {
      throw new AppError(400, 'Declared file type does not match file content', 'BAD_REQUEST');
    }

    const trustedMime = sniffedMime;

    const storageKey = buildStorageKey(data.filename);
    await uploadMediaFile(storageKey, buffer, trustedMime);

    const asset = await prisma.mediaAsset.create({
      data: {
        fileName: data.filename,
        storageKey,
        publicUrl: getPublicUrl(storageKey),
        altText,
        mimeType: trustedMime,
        byteSize: buffer.byteLength,
        uploadedById: userId,
      },
    });

    await writeAudit(userId, 'admin_media_uploaded', {
      mediaId: asset.id,
      fileName: asset.fileName,
    });

    return reply.status(201).send({
      id: asset.id,
      fileName: asset.fileName,
      publicUrl: asset.publicUrl,
      altText: asset.altText,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      createdAt: asset.createdAt.toISOString(),
    });
  });

  /** Delete a media asset from storage and the library. */
  app.delete('/:id', { preHandler: requireAdminWrite }, async (request) => {
    const { id } = idParams.parse(request.params);
    const userId = request.user!.id;

    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new AppError(404, 'Media asset not found', 'NOT_FOUND');

    await deleteMediaFile(asset.storageKey);
    await prisma.mediaAsset.delete({ where: { id } });

    await writeAudit(userId, 'admin_media_deleted', { mediaId: id, fileName: asset.fileName });

    return { deleted: true, id };
  });
}
