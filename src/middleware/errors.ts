import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { env } from '../env.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function sanitizeZodIssues(issues: ZodError['issues']) {
  return issues.map(({ path, message, code }) => ({ path, message, code }));
}

function clientErrorPayload(
  request: FastifyRequest,
  error: string,
  code?: string,
  details?: unknown
) {
  return {
    error,
    code,
    requestId: request.id,
    ...(details !== undefined ? { details } : {}),
  };
}

function hasClientStatusCode(
  error: unknown
): error is { statusCode: number; message?: string; code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number' &&
    (error as { statusCode: number }).statusCode >= 400 &&
    (error as { statusCode: number }).statusCode < 500
  );
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(clientErrorPayload(request, error.message, error.code));
    }

    if (error instanceof ZodError) {
      return reply.status(400).send(
        clientErrorPayload(request, 'Validation failed', 'VALIDATION_FAILED', sanitizeZodIssues(error.issues))
      );
    }

    if (hasClientStatusCode(error)) {
      const message =
        env.NODE_ENV === 'production'
          ? 'Bad request'
          : error.message || 'Bad request';
      return reply
        .status(error.statusCode)
        .send(clientErrorPayload(request, message, error.code));
    }

    request.log.error(
      {
        err: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        reqId: request.id,
      },
      'Unhandled request error'
    );
    return reply
      .status(500)
      .send(clientErrorPayload(request, 'Internal server error', 'INTERNAL_ERROR'));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(clientErrorPayload(request, 'Not found', 'NOT_FOUND'));
  });
}
