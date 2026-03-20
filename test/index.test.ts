import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseManager } from '../src/db/database.js';
import { setDatabaseManager } from '../src/db/database.js';
import { getApiKeyHash } from '../src/db/repositories/settings-repository.js';
import { ensureApiKeyConfigured } from '../src/index.js';
import { logger } from '../src/middleware/logger-middleware.js';
import { createInMemoryManager } from './helpers.js';

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
      { event: 'api_key_generated' },
      expect.stringMatching(/^Generated initial API key: [a-f0-9]{64}$/),
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
