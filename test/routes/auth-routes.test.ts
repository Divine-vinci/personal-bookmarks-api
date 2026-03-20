import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createConfig } from '../../src/config.js';
import type { DatabaseManager } from '../../src/db/database.js';
import { createDatabaseManager, setDatabaseManager } from '../../src/db/database.js';
import { getApiKeyHash, setApiKeyHash } from '../../src/db/repositories/settings-repository.js';

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

describe('auth routes', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
  });

  afterEach(() => {
    manager.close();
    setDatabaseManager(null);
  });

  it('regenerates the API key and invalidates the previous key', async () => {
    const app = createApp(createConfig({ CORS_ORIGINS: '' } as NodeJS.ProcessEnv));
    const originalApiKey = 'original-api-key';
    const originalHash = createHash('sha256').update(originalApiKey).digest('hex');

    setApiKeyHash(originalHash);

    const response = await app.request('/api/auth/regenerate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${originalApiKey}`,
      },
    });

    expect(response.status).toBe(200);

    const body = await response.json() as { api_key: string };

    expect(body.api_key).toMatch(/^[a-f0-9]{64}$/);
    expect(body.api_key).not.toBe(originalApiKey);
    expect(getApiKeyHash()).toBe(createHash('sha256').update(body.api_key).digest('hex'));

    const oldKeyResponse = await app.request('/api/auth/regenerate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${originalApiKey}`,
      },
    });

    expect(oldKeyResponse.status).toBe(401);

    const newKeyResponse = await app.request('/api/auth/regenerate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${body.api_key}`,
      },
    });

    expect(newKeyResponse.status).toBe(200);
  });
});
