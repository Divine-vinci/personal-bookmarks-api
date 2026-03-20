# Story 2.1: Create Bookmark

Status: ready-for-dev

## Story

As a developer,
I want to create a bookmark via the API with URL, title, description, and tags,
So that I can programmatically save and organize links.

## Acceptance Criteria

1. **Given** an authenticated request with a valid JSON body containing url (required), title (required), description (optional), tags (optional array) **When** POST `/api/bookmarks` is called **Then** a new bookmark is created with auto-generated id, created_at, and updated_at timestamps **And** a 201 response is returned with the complete bookmark object including all fields (FR1)

2. **Given** a bookmark is created with tags (e.g., `["rust", "async"]`) **When** the tags do not already exist in the tags table **Then** the tags are automatically created (FR13) **And** entries are added to the bookmark_tags junction table (FR11)

3. **Given** a bookmark is created with tags **When** some tags already exist from previous bookmarks **Then** existing tags are reused (not duplicated) and new tags are created as needed

4. **Given** a bookmark is created with an empty tags array or no tags field **When** the response is returned **Then** the tags field is an empty array `[]` (not null, not omitted)

5. **Given** tags are provided with mixed case or whitespace (e.g., `[" Rust ", "ASYNC"]`) **When** the bookmark is created **Then** tags are stored as lowercase-trimmed values (`["rust", "async"]`)

6. **Given** a bookmark is created with a URL that already exists in the database **When** the request is processed **Then** a 409 response with code `duplicate_url` is returned (FR31)

7. **Given** a request body with missing required fields (no url or no title) **When** validation runs **Then** a 422 response with specific per-field errors is returned (FR30)

## Tasks / Subtasks

- [ ] Task 1: Create bookmark repository (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Create `src/db/repositories/bookmark-repository.ts`
  - [ ] Implement `createBookmark(input)` — INSERT into bookmarks, handle tags, return full bookmark with tags array
  - [ ] Implement `getBookmarkById(id)` — SELECT with LEFT JOIN for tags (needed for returning created bookmark)
  - [ ] Handle tag upsert: INSERT OR IGNORE into tags, then INSERT into bookmark_tags
  - [ ] Catch UNIQUE constraint violation on `bookmarks.url` → throw `conflict()` error
  - [ ] Wrap bookmark + tag inserts in a transaction for atomicity
- [ ] Task 2: Create bookmark route handler (AC: #1, #7)
  - [ ] Create `src/routes/bookmark-routes.ts` with `createBookmarkRoutes()` factory
  - [ ] POST `/` handler: validate with `zValidator('json', createBookmarkSchema)`, call repository, return 201
  - [ ] Wire custom validation hook for `invalid_url` error distinction (same pattern as Story 1.5)
- [ ] Task 3: Wire route in app.ts (AC: #1)
  - [ ] Verify `createBookmarkRoutes()` is mounted at `/api/bookmarks` in `src/app.ts`
- [ ] Task 4: Write tests (AC: #1-#7)
  - [ ] Create `test/routes/bookmark-routes.test.ts`
  - [ ] Test: valid bookmark creation → 201 with complete object
  - [ ] Test: bookmark with tags → tags created and associated
  - [ ] Test: bookmark with existing tags → reused, not duplicated
  - [ ] Test: empty tags array → returns `[]`
  - [ ] Test: no tags field → returns `[]`
  - [ ] Test: mixed case/whitespace tags → stored lowercase-trimmed
  - [ ] Test: duplicate URL → 409 `duplicate_url`
  - [ ] Test: missing url → 422 validation error
  - [ ] Test: missing title → 422 validation error
  - [ ] Test: invalid URL format → 400 `invalid_url`
  - [ ] Test: description is optional (null/omitted both work)
  - [ ] Test: response includes id, url, title, description, tags, created_at, updated_at
  - [ ] All 63 existing tests must still pass

## Dev Notes

### Bookmark Response Shape (MUST follow exactly)

Response body for a single bookmark (201 on create, 200 on get/update):
```json
{
  "id": 1,
  "url": "https://example.com",
  "title": "Example",
  "description": null,
  "tags": ["rust", "async"],
  "created_at": "2026-03-20T12:00:00.000Z",
  "updated_at": "2026-03-20T12:00:00.000Z"
}
```

Key rules:
- `description`: include as `null` if not set (never omit the field)
- `tags`: always an array, even if empty — `[]`
- `created_at`/`updated_at`: ISO 8601 strings
- `id`: integer (SQLite auto-increment)
- Field names: `snake_case` (matches DB columns)

### Repository Implementation Pattern

Follow the existing pattern from `src/db/repositories/settings-repository.ts`:
- Export standalone functions (not a class)
- Use `getDatabase()` from `src/db/database.ts` to get the db instance
- Use prepared statements: `db.prepare(sql).run(params)` / `.get(params)` / `.all(params)`
- **All queries MUST use parameterized queries** — never string interpolation in SQL

### Tag Upsert Strategy

Use SQLite's `INSERT OR IGNORE` for idempotent tag creation:
```sql
INSERT OR IGNORE INTO tags (name) VALUES (?);
```
Then query the tag ID:
```sql
SELECT id FROM tags WHERE name = ?;
```
Then insert junction rows:
```sql
INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?);
```

Wrap the entire create operation (bookmark INSERT + tag upserts + junction INSERTs) in a **transaction** using better-sqlite3's `db.transaction()`:
```typescript
const createBookmarkTx = db.transaction((input) => {
  // 1. INSERT bookmark
  // 2. For each tag: INSERT OR IGNORE into tags, get tag id
  // 3. INSERT into bookmark_tags
  // 4. Return bookmark with tags
});
```

### Handling Duplicate URLs

The `bookmarks` table has a UNIQUE index on `url`. When a duplicate is inserted, better-sqlite3 throws a `SqliteError` with `code: 'SQLITE_CONSTRAINT_UNIQUE'`. Catch this and throw `conflict()` from `src/middleware/error-middleware.ts`:

```typescript
import { conflict } from '../middleware/error-middleware.js';

try {
  // INSERT bookmark
} catch (err: unknown) {
  if (err instanceof SqliteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw conflict('A bookmark with this URL already exists');
  }
  throw err;
}
```

Note: `SqliteError` is importable from `better-sqlite3`. Check the actual error property — it may be `err.code` containing `'SQLITE_CONSTRAINT_UNIQUE'` or check `err.message` for "UNIQUE constraint failed: bookmarks.url".

### Route Handler Pattern

Follow existing route patterns (`health-routes.ts`, `auth-routes.ts`):

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createBookmarkSchema } from '../schemas/bookmark-schemas.js';
import { validationErrorToException } from '../middleware/error-middleware.js';

export function createBookmarkRoutes(): Hono {
  const app = new Hono();

  app.post(
    '/',
    zValidator('json', createBookmarkSchema, (result, c) => {
      if (!result.success) {
        throw validationErrorToException(result.error);
      }
    }),
    async (c) => {
      const input = c.req.valid('json');
      const bookmark = createBookmark(input);
      return c.json(bookmark, 201);
    }
  );

  return app;
}
```

### Zod Schema — Already Exists

`createBookmarkSchema` is already defined in `src/schemas/bookmark-schemas.ts` from Story 1.5:
- `url`: required, valid URL, max 2000 chars
- `title`: required, max 500 chars
- `description`: optional, max 2000 chars
- `tags`: optional array of strings (auto-trimmed and lowercased)

**Do NOT recreate these schemas.** Use them as-is.

### App Wiring — May Already Exist

Check `src/app.ts` — bookmark routes may already be mounted (the explore found empty bookmarks route). If `createBookmarkRoutes()` is already imported and mounted at `/api/bookmarks`, just update the route factory. If not, add:
```typescript
import { createBookmarkRoutes } from './routes/bookmark-routes.js';
app.route('/api/bookmarks', createBookmarkRoutes());
```

### Timestamp Handling

SQLite stores timestamps as text. Use ISO 8601 format:
```typescript
const now = new Date().toISOString();
// INSERT INTO bookmarks (url, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
```

### Querying Bookmark with Tags

After creating a bookmark, query it back with tags for the response:
```sql
SELECT b.id, b.url, b.title, b.description, b.created_at, b.updated_at
FROM bookmarks b
WHERE b.id = ?;
```
Then separately:
```sql
SELECT t.name FROM tags t
JOIN bookmark_tags bt ON bt.tag_id = t.id
WHERE bt.bookmark_id = ?
ORDER BY t.name;
```
Combine into the `Bookmark` type from `src/types.ts`.

Alternatively, use a single query with `GROUP_CONCAT`:
```sql
SELECT b.*, GROUP_CONCAT(t.name) as tag_names
FROM bookmarks b
LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
LEFT JOIN tags t ON t.id = bt.tag_id
WHERE b.id = ?
GROUP BY b.id;
```
Then split `tag_names` on comma (handle null for no tags → empty array).

### Test Pattern

Follow existing test patterns from `test/middleware/error-middleware.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInMemoryManager, createStubLogger } from '../helpers.js';
import { setDatabaseManager } from '../../src/db/database.js';
import app from '../../src/app.js';

describe('POST /api/bookmarks', () => {
  let manager: ReturnType<typeof createInMemoryManager>;

  beforeEach(async () => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
    await manager.initialize();
  });

  afterEach(() => {
    manager.close();
    setDatabaseManager(null as any);
  });

  it('creates a bookmark and returns 201', async () => {
    const res = await app.request('/api/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <valid-key>',
      },
      body: JSON.stringify({ url: 'https://example.com', title: 'Example' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.tags).toEqual([]);
  });
});
```

**Auth in tests:** The auth middleware requires a valid API key. Use the test helper setup — after `manager.initialize()`, an API key is auto-generated. You need to either:
1. Read the generated key hash from the settings table and use a known key, OR
2. Set a known API key hash in the test setup, OR
3. Check how existing auth tests handle this (see `test/routes/auth-routes.test.ts`)

### Project Structure Notes

- New file: `src/db/repositories/bookmark-repository.ts` — follows existing repository pattern
- New file: `src/routes/bookmark-routes.ts` — follows existing route factory pattern (may need to replace empty stub)
- New file: `test/routes/bookmark-routes.test.ts` — follows existing test patterns
- Modified: `src/app.ts` — wire bookmark routes (may already be wired)
- Existing schemas in `src/schemas/bookmark-schemas.ts` — reuse, do not recreate
- Existing types in `src/types.ts` — `Bookmark`, `PaginatedResponse` already defined

### References

- [Source: epics.md#Story 2.1] — acceptance criteria and FR mappings
- [Source: architecture.md#Data Architecture] — better-sqlite3 synchronous API, parameterized queries
- [Source: architecture.md#API & Communication Patterns] — response format, error handling
- [Source: architecture.md#Implementation Patterns] — naming conventions, anti-patterns
- [Source: architecture.md#Project Structure] — file locations, boundary rules
- [Source: architecture.md#Architectural Boundaries] — route → repository separation
- [Source: story 1-5] — error helpers, Zod schemas, validation hook pattern, test patterns
- [Source: 001-initial-schema.sql] — bookmarks, tags, bookmark_tags table schema

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
