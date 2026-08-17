import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options: {
  keyPrefix: string;
  limit: number;
  windowMs: number;
  /** Prefer authenticated user id when available (use after requireAuth). */
  by?: 'ip' | 'user';
}) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const subject =
      options.by === 'user'
        ? request.user?.id ?? request.authId ?? request.ip ?? 'unknown'
        : request.ip ?? 'unknown';
    const key = `${options.keyPrefix}:${subject}`;
    const now = Date.now();

    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return;
    }

    current.count += 1;
    if (current.count > options.limit) {
      throw new AppError(429, 'Too many requests — try again shortly', 'RATE_LIMITED');
    }
  };
}
