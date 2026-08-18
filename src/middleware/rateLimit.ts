import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { AppError } from './errors.js';

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

async function upstashIncr(key: string, windowMs: number): Promise<number> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const pipeline = [
    ['INCR', key],
    ['EXPIRE', key, windowSec, 'NX'],
  ];

  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pipeline),
  });

  if (!response.ok) {
    throw new AppError(503, 'Rate limit service unavailable', 'RATE_LIMIT_ERROR');
  }

  const body = (await response.json()) as { result?: unknown }[];
  const count = body[0]?.result;
  return typeof count === 'number' ? count : Number(count);
}

function memoryIncr(key: string, windowMs: number): number {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  current.count += 1;
  return current.count;
}

async function incrementCounter(key: string, windowMs: number): Promise<number> {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return upstashIncr(key, windowMs);
  }
  return memoryIncr(key, windowMs);
}

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

    const count = await incrementCounter(key, options.windowMs);
    if (count > options.limit) {
      throw new AppError(429, 'Too many requests — try again shortly', 'RATE_LIMITED');
    }
  };
}
