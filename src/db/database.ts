import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import type pino from 'pino';

import { config } from '../config.js';
import { logger } from '../middleware/logger-middleware.js';

const DEFAULT_DATABASE_FILE = 'bookmarks.db';
const DEFAULT_MIGRATIONS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'migrations');

type MigrationRecord = {
  name: string;
};

export type DatabaseManagerOptions = {
  dataDir?: string;
  migrationsDir?: string;
  logger?: Pick<pino.Logger, 'info' | 'debug' | 'warn' | 'error'>;
  databaseFileName?: string;
};

export type SqliteDatabase = Database.Database;

export type DatabaseManager = {
  db: SqliteDatabase;
  dbPath: string;
  initialize: () => SqliteDatabase;
  runMigrations: () => void;
  close: () => void;
};

const createMigrationsTable = (db: SqliteDatabase) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
};

export const createDatabaseManager = ({
  dataDir = config.dataDir,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  logger: appLogger = logger,
  databaseFileName = DEFAULT_DATABASE_FILE,
}: DatabaseManagerOptions = {}): DatabaseManager => {
  const dbPath = databaseFileName === ':memory:' ? ':memory:' : path.join(dataDir, databaseFileName);
  const db = new Database(dbPath);

  const runMigrations = () => {
    createMigrationsTable(db);

    const migrationFiles = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort()
      : [];

    const insertMigration = db.prepare(
      'INSERT INTO migrations (name, applied_at) VALUES (?, ?)',
    );
    const selectMigration = db.prepare(
      'SELECT name FROM migrations WHERE name = ?',
    );

    for (const file of migrationFiles) {
      const name = path.basename(file, '.sql');
      const existingMigration = selectMigration.get(name) as MigrationRecord | undefined;

      if (existingMigration) {
        appLogger.debug?.({ migration: name }, 'Skipping previously applied migration');
        continue;
      }

      const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const applyMigration = db.transaction(() => {
        db.exec(migrationSql);
        insertMigration.run(name, new Date().toISOString());
      });

      applyMigration();
      appLogger.info({ migration: name }, 'Migration applied');
    }
  };

  const initialize = () => {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations();

    return db;
  };

  return {
    db,
    dbPath,
    initialize,
    runMigrations,
    close: () => db.close(),
  };
};

let defaultManager: DatabaseManager | null = null;

export const setDatabaseManager = (manager: DatabaseManager | null): void => {
  defaultManager = manager;
};

const getDefaultManager = (): DatabaseManager => {
  if (!defaultManager) {
    defaultManager = createDatabaseManager();
  }
  return defaultManager;
};

export const initDatabase = (): SqliteDatabase => getDefaultManager().initialize();

export const getDatabase = (): SqliteDatabase => getDefaultManager().db;
