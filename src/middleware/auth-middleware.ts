import { createHash, timingSafeEqual } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

import { getApiKeyHash } from '../db/repositories/settings-repository.js';
import type { ApiError } from '../types.js';
import { logger } from './logger-middleware.js';

const UNAUTHORIZED_RESPONSE: ApiError = {
  error: {
    code: 'unauthorized',
    message: 'Invalid or missing API key',
  },
};

const logUnauthorized = (path: string) => {
  logger.warn({ event: 'auth_failed', path }, 'API key authentication failed');
};

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    if (c.req.path === '/api/health') {
      await next();
      return;
    }

    const authHeader = c.req.header('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      logUnauthorized(c.req.path);
      return c.json(UNAUTHORIZED_RESPONSE, 401);
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const storedHash = getApiKeyHash();

    if (!token || !storedHash) {
      logUnauthorized(c.req.path);
      return c.json(UNAUTHORIZED_RESPONSE, 401);
    }

    const incomingHash = createHash('sha256').update(token).digest();
    const storedHashBuffer = Buffer.from(storedHash, 'hex');

    if (
      storedHashBuffer.length !== incomingHash.length
      || !timingSafeEqual(incomingHash, storedHashBuffer)
    ) {
      logUnauthorized(c.req.path);
      return c.json(UNAUTHORIZED_RESPONSE, 401);
    }

    await next();
  };
};
