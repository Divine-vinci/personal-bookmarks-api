import type { DatabaseManager } from '../src/db/database.js';
import { createDatabaseManager } from '../src/db/database.js';

export const createStubLogger = () => ({
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

export const createInMemoryManager = (): DatabaseManager => {
  const manager = createDatabaseManager({
    databaseFileName: ':memory:',
    migrationsDir: new URL('../src/db/migrations', import.meta.url).pathname,
    logger: createStubLogger(),
  });

  manager.initialize();
  return manager;
};
