import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  conflict,
  errorHandler,
  invalidRequest,
  invalidUrl,
  notFound,
  notFoundHandler,
  validationErrorToException,
} from '../../src/middleware/error-middleware.js';

const { loggerError } = vi.hoisted(() => ({
  loggerError: vi.fn(),
}));

vi.mock('../../src/middleware/logger-middleware.js', () => ({
  logger: {
    info: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
    error: loggerError,
  },
}));

const createTestApp = () => {
  const app = new Hono();

  app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.post('/json', async (c) => {
    const body = await c.req.json();
    return c.json(body);
  });

  app.post(
    '/validate',
    zValidator(
      'json',
      z.object({
        url: z.string().url('Invalid url: must be a valid URL'),
        title: z.string().min(1, 'Title is required'),
      }),
      (result) => {
        if (!result.success) {
          throw validationErrorToException(result.error);
        }
      },
    ),
    (c) => c.json(c.req.valid('json')),
  );

  app.get('/http', () => {
    throw new HTTPException(418, {
      res: new Response(JSON.stringify({
        error: {
          code: 'teapot',
          message: 'Short and stout',
        },
      }), {
        status: 418,
        headers: { 'content-type': 'application/json' },
      }),
    });
  });

  app.get('/resource', () => {
    throw notFound('Bookmark not found');
  });

  app.get('/invalid-url', () => {
    throw invalidUrl();
  });

  app.get('/conflict', () => {
    throw conflict('URL already exists');
  });

  app.get('/bad-request', () => {
    throw invalidRequest('Missing required field');
  });

  app.get('/boom', () => {
    throw new Error('kaboom stack details');
  });

  return app;
};

describe('error middleware', () => {
  it('returns invalid_request for malformed JSON', async () => {
    const app = createTestApp();

    const response = await app.request('/json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"url":',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'Invalid JSON body',
      },
    });
  });

  it('returns invalid_request when body exceeds 1MB', async () => {
    const app = createTestApp();
    const payload = 'x'.repeat(1024 * 1024 + 1);

    const response = await app.request('/json', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'content-length': String(payload.length),
      },
      body: payload,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'Request body exceeds 1MB limit',
      },
    });
  });

  it('returns not_found for unknown routes', async () => {
    const app = createTestApp();

    const response = await app.request('/missing-route');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Route not found',
      },
    });
  });

  it('returns the original structured HTTPException response', async () => {
    const app = createTestApp();

    const response = await app.request('/http');

    expect(response.status).toBe(418);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'teapot',
        message: 'Short and stout',
      },
    });
  });

  it('returns validation_error with field details for Zod errors', async () => {
    const app = createTestApp();

    const response = await app.request('/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'validation_error',
        message: 'Validation failed',
        details: [
          {
            field: 'url',
            message: 'Invalid input: expected string, received undefined',
          },
          {
            field: 'title',
            message: 'Title is required',
          },
        ],
      },
    });
  });

  it('returns invalid_url for invalid url validation failures', async () => {
    const app = createTestApp();

    const response = await app.request('/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url', title: 'Example' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_url',
        message: 'Invalid url: must be a valid URL',
      },
    });
  });

  it('returns internal_error without leaking stack details and logs the error', async () => {
    loggerError.mockClear();
    const app = createTestApp();

    const response = await app.request('/boom');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(body)).not.toContain('kaboom');
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('returns duplicate_url for conflict errors', async () => {
    const app = createTestApp();

    const response = await app.request('/conflict');

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'duplicate_url',
        message: 'URL already exists',
      },
    });
  });

  it('returns invalid_request for bad request errors', async () => {
    const app = createTestApp();

    const response = await app.request('/bad-request');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'Missing required field',
      },
    });
  });

  it('always returns the standard error envelope', async () => {
    const app = createTestApp();

    const response = await app.request('/resource');
    const body = await response.json();

    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    });
  });
});
