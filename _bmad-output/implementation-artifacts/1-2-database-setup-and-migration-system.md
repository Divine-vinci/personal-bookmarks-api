# Story 1.2: Database Setup and Migration System

Status: review

## Story

As a developer,
I want the SQLite database to initialize automatically with a migration system,
So that the database schema is created on first run and can evolve with future changes.

## Acceptance Criteria

1. **Given** the application starts for the first time **When** the database file does not exist in DATA_DIR **Then** a new SQLite database is created with WAL mode enabled (NFR12) **And** a `migrations` table is created to track applied migrations

2. **Given** SQL migration files exist in `src/db/migrations/` (numbered sequentially: `001-*.sql`, `002-*.sql`) **When** the application starts **Then** all unapplied migrations are executed in order **And** each successful migration is recorded in the `migrations` table

3. **Given** the initial migration `001-initial-schema.sql` runs **When** it completes **Then** the following tables exist: `bookmarks` (id, url, title, description, created_at, updated_at), `tags` (id, name), `bookmark_tags` (bookmark_id, tag_id), `settings` (key, value) **And** a unique index exists on `bookmarks.url` **And** a unique index exists on `tags.name`

4. **Given** a migration has already been applied **When** the application restarts **Then** the migration is not re-applied

5. **Given** all database operations **When** queries are executed **Then** parameterized queries are used (NFR9) — no string interpolation in SQL

## Tasks / Subtasks

- [x] Task 1: Create `src/db/database.ts` — SQLite connection manager (AC: #1, #4)
  - [x] Initialize better-sqlite3 connection with database file at `{DATA_DIR}/bookmarks.db`
  - [x] Enable WAL mode via `PRAGMA journal_mode=WAL`
  - [x] Enable foreign keys via `PRAGMA foreign_keys=ON`
  - [x] Create `migrations` table if not exists: `id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL`
  - [x] Implement `runMigrations()` — reads `src/db/migrations/*.sql` files, applies unapplied ones in order, records each in migrations table
  - [x] Export singleton database instance and initialization function
- [x] Task 2: Create `src/db/migrations/001-initial-schema.sql` (AC: #3)
  - [x] `bookmarks` table: id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  - [x] `tags` table: id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL
  - [x] `bookmark_tags` junction table: bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (bookmark_id, tag_id)
  - [x] `settings` table: key TEXT PRIMARY KEY, value TEXT NOT NULL
  - [x] CREATE UNIQUE INDEX idx_bookmarks_url ON bookmarks(url)
  - [x] CREATE UNIQUE INDEX idx_tags_name ON tags(name)
  - [x] CREATE INDEX idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id)
  - [x] CREATE INDEX idx_bookmark_tags_tag_id ON bookmark_tags(tag_id)
- [x] Task 3: Integrate database initialization into app startup (AC: #1, #2)
  - [x] Call database init + migration runner during app startup in `src/index.ts`
  - [x] Ensure DATA_DIR directory is created if it doesn't exist (use `fs.mkdirSync` with `recursive: true`)
  - [x] Log migration activity via Pino logger (not console.log)
- [x] Task 4: Write tests for database layer (AC: #1-5)
  - [x] Test: database file is created on first init
  - [x] Test: WAL mode is enabled
  - [x] Test: foreign keys are enabled
  - [x] Test: migrations table is created
  - [x] Test: 001 migration creates all expected tables with correct columns
  - [x] Test: unique indexes exist on bookmarks.url and tags.name
  - [x] Test: running migrations twice does not re-apply
  - [x] Test: migrations are applied in order
  - [x] Use in-memory SQLite (`:memory:`) or temp files for test isolation

## Dev Notes

### Critical: Fix Story 1.1 Type Discrepancies

The existing `src/types.ts` has issues that conflict with the architecture spec. You MUST update types to match:

**Current (WRONG):**
```typescript
// Bookmark.id is string — architecture says integer (auto-increment)
export interface Bookmark {
  id: string;  // WRONG — must be number
  // ...
  tags: Tag[];  // Tags should be string[] in API responses
  createdAt: string;  // WRONG — API uses snake_case: created_at
  updatedAt: string;  // WRONG — API uses snake_case: updated_at
}

// PaginatedResponse uses items/page/pageSize — architecture says data/total
export interface PaginatedResponse<T> {
  items: T[];    // WRONG — must be data
  page: number;  // WRONG — not in spec
  pageSize: number;  // WRONG — not in spec
  total: number;
}
```

**Correct (update to):**
```typescript
export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Tag {
  name: string;
  count: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}
```

### Architecture Compliance

- **Database library:** better-sqlite3 v12.8.0 (already installed) — synchronous API, NOT async
- **Database file:** `{DATA_DIR}/bookmarks.db` — DATA_DIR from `src/config.ts` (default: `./data`)
- **WAL mode:** MUST enable via `PRAGMA journal_mode=WAL` for crash consistency (NFR12)
- **Foreign keys:** MUST enable via `PRAGMA foreign_keys=ON` — SQLite disables them by default
- **Parameterized queries ONLY** — never string interpolation in SQL (NFR9)
- **Logging:** Use Pino logger from `src/middleware/logger-middleware.ts` — NEVER `console.log`

### Database Connection Pattern

```typescript
// src/db/database.ts
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../middleware/logger-middleware.js';

// better-sqlite3 is SYNCHRONOUS — no async/await needed for queries
const db = new Database(path.join(config.dataDir, 'bookmarks.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

### Migration File Pattern

Migration files are plain SQL in `src/db/migrations/`, named `001-initial-schema.sql`, `002-fts5-setup.sql`, etc. The migration runner:

1. Reads all `.sql` files from the migrations directory
2. Sorts by filename (lexicographic — `001` before `002`)
3. Checks which have already been applied (query `migrations` table)
4. Executes unapplied ones inside a transaction
5. Records each applied migration with timestamp

```typescript
// Migration runner pseudocode
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  const name = path.basename(file, '.sql');
  const existing = db.prepare('SELECT id FROM migrations WHERE name = ?').get(name);
  if (!existing) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
    logger.info({ migration: name }, 'Migration applied');
  }
}
```

### Schema Design Details

**bookmarks table:**
- `id` — INTEGER PRIMARY KEY AUTOINCREMENT (auto-increment, not UUID)
- `url` — TEXT NOT NULL (unique index — duplicate URLs rejected with 409)
- `title` — TEXT NOT NULL
- `description` — TEXT (nullable — not TEXT DEFAULT '')
- `created_at` — TEXT NOT NULL DEFAULT (datetime('now')) — ISO 8601 format
- `updated_at` — TEXT NOT NULL DEFAULT (datetime('now')) — updated by application code on PUT

**tags table:**
- `id` — INTEGER PRIMARY KEY AUTOINCREMENT
- `name` — TEXT NOT NULL (unique index — tags are lowercase-trimmed)

**bookmark_tags junction table:**
- `bookmark_id` — INTEGER NOT NULL, REFERENCES bookmarks(id) ON DELETE CASCADE
- `tag_id` — INTEGER NOT NULL, REFERENCES tags(id) ON DELETE CASCADE
- PRIMARY KEY (bookmark_id, tag_id) — composite primary key

**settings table:**
- `key` — TEXT PRIMARY KEY (no auto-increment — key is the identifier)
- `value` — TEXT NOT NULL
- Used for API key hash storage (Story 1.3)

**migrations table (created by database.ts, not by migration SQL):**
- `id` — INTEGER PRIMARY KEY AUTOINCREMENT
- `name` — TEXT NOT NULL UNIQUE
- `applied_at` — TEXT NOT NULL

### File Location Rules

| File | Location | Purpose |
|---|---|---|
| `database.ts` | `src/db/database.ts` | SQLite connection, WAL mode, migration runner |
| `001-initial-schema.sql` | `src/db/migrations/001-initial-schema.sql` | Initial table creation |
| Database tests | `test/db/database.test.ts` | Migration runner and schema tests |

### Testing Requirements

- Use in-memory SQLite (`:memory:`) or temp directories for test isolation — NEVER touch the real data directory
- Test that `better-sqlite3` creates the database file when it doesn't exist
- Test WAL mode: `db.pragma('journal_mode')` should return `[{ journal_mode: 'wal' }]`
- Test foreign keys: `db.pragma('foreign_keys')` should return `[{ foreign_keys: 1 }]`
- Test all tables exist after migration: query `sqlite_master` for table names
- Test unique indexes: attempt duplicate insert on bookmarks.url and tags.name — should throw
- Test migration idempotency: run migrations twice, verify tables exist and no error
- Use Vitest — framework is already configured from Story 1.1

### Integration with Existing Code

- `src/config.ts` already exports `config.dataDir` (default: `./data`) — use this for database path
- `src/middleware/logger-middleware.ts` exports `logger` — use for migration logging
- `src/app.ts` uses `createApp()` factory — database init should happen in `src/index.ts` before server start, NOT inside createApp (keep app.ts pure for testing)
- `src/types.ts` — update types as noted above to match architecture spec

### What This Story Does NOT Include

- FTS5 virtual table setup (Story 3.1 — migration `002-fts5-setup.sql`)
- Repository classes for CRUD operations (Stories 1.3, 2.1+)
- API key generation and storage (Story 1.3)
- Any route handlers or middleware changes

### References

- [Source: architecture.md#Data Architecture] — database library, FTS5 strategy, schema migrations, data modeling
- [Source: architecture.md#Implementation Patterns] — naming conventions (snake_case tables/columns), parameterized queries
- [Source: architecture.md#Project Structure & Boundaries] — file locations for db layer
- [Source: epics.md#Story 1.2] — acceptance criteria, user story
- [Source: architecture.md#Authentication & Security] — settings table for API key hash (Story 1.3 dependency)
- [Source: story 1-1] — existing project structure, config module, logger, types to fix

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- `npm test` — red: missing `src/db/database.ts`
- `npm test` — green: 17/17 tests passing
- `npm run build` — passing

### Completion Notes List

- Implemented `src/db/database.ts` with better-sqlite3 singleton init, WAL mode, foreign keys, migrations table bootstrap, ordered migration execution, and parameterized migration-record queries. (AC: 1, 2, 4, 5)
- Added `src/db/migrations/001-initial-schema.sql` with `bookmarks`, `tags`, `bookmark_tags`, and `settings` tables plus required unique/supporting indexes. (AC: 3)
- Integrated DB init into `src/index.ts` with `fs.mkdirSync(..., { recursive: true })` before server boot and migration logging via Pino. (AC: 1, 2)
- Corrected `src/types.ts` to architecture-spec shapes required by Story 1.2 dev notes.
- Added `test/db/database.test.ts` covering DB creation, WAL, foreign keys, migrations table bootstrap, schema shape, unique indexes, idempotent reruns, and lexicographic migration ordering. (AC: 1-5)
- Definition of Done: PASS — build passes; tests pass; file list updated; story status set to `review`.

### File List

- src/db/database.ts
- src/db/migrations/001-initial-schema.sql
- src/index.ts
- src/types.ts
- test/db/database.test.ts

### Change Log

- 2026-03-20 — Implemented SQLite bootstrap + migration system, wired startup initialization, fixed shared API types, and added database-layer regression tests.
