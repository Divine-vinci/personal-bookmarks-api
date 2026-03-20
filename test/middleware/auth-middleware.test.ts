import { createHash } from 'node:crypto';

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '../../src/db/database.js';
import { createDatabaseManager, setDatabaseManager } from '../../src/db/database.js';
import { setApiKeyHash } from '../../src/db/repositories/settings-repository.js';
import { authMiddleware } from '../../src/middleware/auth-middleware.js';

const createStubLogger = () => ({
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

const createInMemoryManager = (): DatabaseManager => {
  const manager = createDatabaseManager({
    databaseFileName: ':memory:',
    migrationsDir: new URL('../../src/db/migrations', import.meta.url).pathname,
    logger: createStubLogger(),
  });

  manager.initialize();
  return manager;
};

const createTestApp = () => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.get('/api/protected', (c) => c.json({ ok: true }));
  app.get('/api/health', (c) => c.json({ ok: true }));
  return app;
};

describe('authMiddleware', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
  });

  afterEach(() => {
    manager.close();
    setDatabaseManager(null);
  });

  it('allows requests with a valid bearer token', async () => {
    const app = createTestApp();
    const apiKey = 'valid-api-key';
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    setApiKeyHash(apiKeyHash);

    const response = await app.request('/api/protected', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('rejects requests without an authorization header', async () => {
    const app = createTestApp();

    const response = await app.request('/api/protected');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key',
      },
    });
  });

  it('rejects requests with an invalid bearer token', async () => {
    const app = createTestApp();
    setApiKeyHash(createHash('sha256').update('valid-api-key').digest('hex'));

    const response = await app.request('/api/protected', {
      headers: {
        Authorization: 'Bearer wrong-api-key',
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key',
      },
    });
  });

  it('bypasses authentication for the health endpoint', async () => {
    const app = createTestApp();

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
