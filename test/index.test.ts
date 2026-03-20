import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseManager } from '../src/db/database.js';
import { createDatabaseManager, setDatabaseManager } from '../src/db/database.js';
import { getApiKeyHash } from '../src/db/repositories/settings-repository.js';
import { ensureApiKeyConfigured } from '../src/index.js';
import { logger } from '../src/middleware/logger-middleware.js';

const createStubLogger = () => ({
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

const createInMemoryManager = (): DatabaseManager => {
  const manager = createDatabaseManager({
    databaseFileName: ':memory:',
    migrationsDir: new URL('../src/db/migrations', import.meta.url).pathname,
    logger: createStubLogger(),
  });

  manager.initialize();
  return manager;
};

describe('ensureApiKeyConfigured', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    manager.close();
    setDatabaseManager(null);
  });

  it('generates and stores a hashed API key when none exists', () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    ensureApiKeyConfigured();

    const storedHash = getApiKeyHash();

    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'api_key_generated',
        apiKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      'Generated initial API key',
    );
  });

  it('does not replace an existing API key hash', () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    ensureApiKeyConfigured();
    const originalHash = getApiKeyHash();

    ensureApiKeyConfigured();

    expect(getApiKeyHash()).toBe(originalHash);
    expect(infoSpy).toHaveBeenLastCalledWith(
      { event: 'api_key_already_configured' },
      'API key already configured',
    );
  });
});
