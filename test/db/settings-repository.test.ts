import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '../../src/db/database.js';
import { setDatabaseManager } from '../../src/db/database.js';
import { getApiKeyHash, setApiKeyHash } from '../../src/db/repositories/settings-repository.js';
import { createInMemoryManager } from '../helpers.js';

describe('settings repository', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
  });

  afterEach(() => {
    manager.close();
    setDatabaseManager(null);
  });

  it('returns null when the API key hash is not set', () => {
    expect(getApiKeyHash()).toBeNull();
  });

  it('stores and retrieves the API key hash', () => {
    setApiKeyHash('hash-one');

    expect(getApiKeyHash()).toBe('hash-one');
  });

  it('upserts the API key hash when replacing an existing value', () => {
    setApiKeyHash('hash-one');
    setApiKeyHash('hash-two');

    expect(getApiKeyHash()).toBe('hash-two');
  });
});
