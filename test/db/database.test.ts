import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseManager } from '../../src/db/database.js';
import { createStubLogger } from '../helpers.js';

const tempPaths = new Set<string>();

const createTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-api-db-'));
  tempPaths.add(dir);
  return dir;
};

afterEach(() => {
  for (const target of tempPaths) {
    fs.rmSync(target, { recursive: true, force: true });
  }

  tempPaths.clear();
});

describe('createDatabaseManager', () => {
  it('creates the database file and migrations table on first init', () => {
    const dataDir = createTempDir();
    const dbPath = path.join(dataDir, 'bookmarks.db');
    const manager = createDatabaseManager({
      dataDir,
      migrationsDir: path.resolve('src/db/migrations'),
      logger: createStubLogger(),
    });

    manager.initialize();

    expect(fs.existsSync(dbPath)).toBe(true);

    const migrationsTable = manager.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get('migrations');

    expect(migrationsTable).toEqual({ name: 'migrations' });

    manager.close();
  });

  it('enables WAL mode and foreign keys', () => {
    const dataDir = createTempDir();
    const manager = createDatabaseManager({
      dataDir,
      migrationsDir: path.resolve('src/db/migrations'),
      logger: createStubLogger(),
    });

    manager.initialize();

    expect(manager.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(manager.db.pragma('foreign_keys', { simple: true })).toBe(1);

    manager.close();
  });

  it('applies the initial schema migration with expected tables and columns', () => {
    const dataDir = createTempDir();
    const manager = createDatabaseManager({
      dataDir,
      migrationsDir: path.resolve('src/db/migrations'),
      logger: createStubLogger(),
    });

    manager.initialize();

    const tableNames = manager.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as Array<{ name: string }>;

    expect(tableNames.map(({ name }) => name)).toEqual([
      'bookmark_tags',
      'bookmarks',
      'bookmarks_fts',
      'bookmarks_fts_config',
      'bookmarks_fts_data',
      'bookmarks_fts_docsize',
      'bookmarks_fts_idx',
      'migrations',
      'settings',
      'tags',
    ]);

    const bookmarkColumns = manager.db.prepare("PRAGMA table_info('bookmarks')").all();
    const tagColumns = manager.db.prepare("PRAGMA table_info('tags')").all();
    const bookmarkTagColumns = manager.db.prepare("PRAGMA table_info('bookmark_tags')").all();
    const settingsColumns = manager.db.prepare("PRAGMA table_info('settings')").all();

    expect(bookmarkColumns.map((column: { name: string }) => column.name)).toEqual([
      'id',
      'url',
      'title',
      'description',
      'created_at',
      'updated_at',
    ]);
    expect(tagColumns.map((column: { name: string }) => column.name)).toEqual(['id', 'name']);
    expect(bookmarkTagColumns.map((column: { name: string }) => column.name)).toEqual([
      'bookmark_id',
      'tag_id',
    ]);
    expect(settingsColumns.map((column: { name: string }) => column.name)).toEqual(['key', 'value']);

    manager.close();
  });

  it('uses the default migrations directory when one is not provided', () => {
    const dataDir = createTempDir();
    const manager = createDatabaseManager({
      dataDir,
      logger: createStubLogger(),
    });

    manager.initialize();

    const settingsTable = manager.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get('settings');

    expect(settingsTable).toEqual({ name: 'settings' });

    manager.close();
  });

  it('enforces unique indexes on bookmarks.url and tags.name', () => {
    const dataDir = createTempDir();
    const manager = createDatabaseManager({
      dataDir,
      migrationsDir: path.resolve('src/db/migrations'),
      logger: createStubLogger(),
    });

    manager.initialize();

    manager.db.prepare(
      'INSERT INTO bookmarks (url, title, description) VALUES (?, ?, ?)',
    ).run('https://example.com', 'Example', null);

    expect(() => manager.db.prepare(
      'INSERT INTO bookmarks (url, title, description) VALUES (?, ?, ?)',
    ).run('https://example.com', 'Duplicate', null)).toThrow(/UNIQUE/);

    manager.db.prepare('INSERT INTO tags (name) VALUES (?)').run('typescript');

    expect(() => manager.db.prepare('INSERT INTO tags (name) VALUES (?)').run('typescript')).toThrow(/UNIQUE/);

    manager.close();
  });

  it('does not re-apply migrations when initialize is called twice', () => {
    const dataDir = createTempDir();
    const manager = createDatabaseManager({
      dataDir,
      migrationsDir: path.resolve('src/db/migrations'),
      logger: createStubLogger(),
    });

    manager.initialize();
    manager.initialize();

    const appliedMigrations = manager.db.prepare(
      'SELECT name FROM migrations ORDER BY id',
    ).all() as Array<{ name: string }>;

    expect(appliedMigrations).toEqual([
      { name: '001-initial-schema' },
      { name: '002-fts5-setup' },
    ]);

    manager.close();
  });

  it('applies migrations in filename order', () => {
    const dataDir = createTempDir();
    const migrationsDir = createTempDir();

    fs.writeFileSync(
      path.join(migrationsDir, '001-create-alpha.sql'),
      'CREATE TABLE alpha (id INTEGER PRIMARY KEY AUTOINCREMENT);',
      'utf8',
    );
    fs.writeFileSync(
      path.join(migrationsDir, '002-create-beta.sql'),
      'CREATE TABLE beta (id INTEGER PRIMARY KEY AUTOINCREMENT);',
      'utf8',
    );

    const manager = createDatabaseManager({
      dataDir,
      migrationsDir,
      logger: createStubLogger(),
    });

    manager.initialize();

    const appliedMigrations = manager.db.prepare(
      'SELECT name FROM migrations ORDER BY id',
    ).all() as Array<{ name: string }>;

    expect(appliedMigrations).toEqual([
      { name: '001-create-alpha' },
      { name: '002-create-beta' },
    ]);

    manager.close();
  });
});
