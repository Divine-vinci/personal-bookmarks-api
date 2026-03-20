# Story 4.2: Export Bookmarks as JSON

Status: ready-for-dev

## Story

As a developer,
I want to export all my bookmarks as a JSON file,
So that I can back up my data or migrate to another system.

## Acceptance Criteria

1. **Given** bookmarks exist in the database **When** GET `/api/export` is called with a valid API key **Then** a 200 response is returned with `Content-Type: application/json` **And** the body contains an array of all bookmarks with all fields: id, url, title, description, tags, created_at, updated_at (FR22, FR23)

2. **Given** 10,000 bookmarks exist in the database **When** the export is requested **Then** the response completes in under 10 seconds (NFR4)

3. **Given** no bookmarks exist in the database **When** GET `/api/export` is called **Then** a 200 response with an empty array `[]` is returned

4. **Given** bookmarks with tags exist **When** the export is generated **Then** each bookmark includes its full tags array (not tag IDs)

## Tasks / Subtasks

- [ ] Task 1: Create `src/services/export-service.ts` — export logic (AC: #1, #2, #4)
  - [ ] Implement `exportAllBookmarks()` that returns all bookmarks with tags as `Bookmark[]`

- [ ] Task 2: Create `src/routes/export-routes.ts` — GET `/` handler (AC: #1, #3)
  - [ ] Return JSON array of all bookmarks
  - [ ] Set `Content-Type: application/json`

- [ ] Task 3: Register export routes in `app.ts` (AC: #1)
  - [ ] Import `createExportRoutes` and mount at `/api/export`

- [ ] Task 4: Write tests (AC: #1-#4)
  - [ ] Empty database returns `[]`
  - [ ] Export includes all bookmark fields (id, url, title, description, tags, created_at, updated_at)
  - [ ] Tags are resolved to name arrays, not IDs
  - [ ] Bookmarks without tags have `tags: []`
  - [ ] Multiple bookmarks with mixed tags exported correctly
  - [ ] Auth required (401 without API key)

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`Bookmark` type** in `src/types.ts` — already has all export fields: `id, url, title, description, tags, created_at, updated_at`. The export response body is simply `Bookmark[]`.

**`getDatabase()` and `SqliteDatabase`** from `src/db/database.ts` — same DB access pattern as all other repositories.

**`getBookmarksWithTags` helper** in `src/db/repositories/bookmark-repository.ts` (line 88) — this private helper takes `BookmarkRow[]` and returns `Bookmark[]` with resolved tags. However, it's NOT exported. The export service needs similar logic. Two options:
1. Export the helper from `bookmark-repository.ts` and reuse it in the export service.
2. Write a dedicated query in the export service.

**Recommended: Option 2** — write a single efficient query in the export service. The export has no pagination/sorting/filtering and should fetch everything in one shot. Using the repository's `listBookmarks` would require passing `limit: Infinity` which is hacky. A dedicated query is cleaner and lets you optimize for bulk export (e.g., a single JOIN query instead of N+1).

**Error helpers** in `src/middleware/error-middleware.ts` — not needed for export (no validation, no error cases beyond auth which is handled by global middleware).

**`app.ts` route registration** — follow the pattern: `app.route('/api/export', createExportRoutes())`.

**Test helpers pattern** — each test file defines its own helper functions. Follow the pattern in `test/routes/bookmark-routes.test.ts`: `createInMemoryManager`, `setDatabaseManager`, `setApiKeyHash` in `beforeEach`.

### Task 1: Export Service Implementation

Create `src/services/export-service.ts`:

```typescript
import type { Bookmark } from '../types.js';
import { getDatabase } from '../db/database.js';

type BookmarkRow = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export const exportAllBookmarks = (): Bookmark[] => {
  const db = getDatabase();

  // Fetch all bookmarks
  const rows = db.prepare(
    `SELECT id, url, title, description, created_at, updated_at
     FROM bookmarks
     ORDER BY created_at ASC`,
  ).all() as BookmarkRow[];

  if (rows.length === 0) {
    return [];
  }

  // Fetch all tag associations in one query
  const tagRows = db.prepare(
    `SELECT bt.bookmark_id, t.name
     FROM bookmark_tags bt
     INNER JOIN tags t ON t.id = bt.tag_id
     ORDER BY t.name ASC`,
  ).all() as Array<{ bookmark_id: number; name: string }>;

  // Build tag lookup map
  const tagsByBookmarkId = new Map<number, string[]>();
  for (const tag of tagRows) {
    const tags = tagsByBookmarkId.get(tag.bookmark_id);
    if (tags) {
      tags.push(tag.name);
    } else {
      tagsByBookmarkId.set(tag.bookmark_id, [tag.name]);
    }
  }

  // Map rows to Bookmark objects with resolved tags
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    tags: tagsByBookmarkId.get(row.id) ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};
```

**Key design decisions:**

1. **Two queries, not one**: Fetching bookmarks and tags separately (then joining in JS) is more efficient than a LEFT JOIN that would duplicate bookmark rows for each tag. For 10,000 bookmarks this avoids memory bloat from row duplication.

2. **No pagination**: Export returns ALL bookmarks. No limit/offset needed.

3. **Sort order**: `created_at ASC` for chronological export (oldest first). This is a data dump — the consumer can re-sort.

4. **Tags as name arrays**: Tags are resolved to `string[]` via the join on `bookmark_tags` + `tags`, not returned as IDs.

5. **Synchronous better-sqlite3**: All queries are synchronous, so the export function is a simple synchronous return — no async needed.

### Task 2: Export Routes Implementation

Create `src/routes/export-routes.ts`:

```typescript
import { Hono } from 'hono';

import { exportAllBookmarks } from '../services/export-service.js';

export const createExportRoutes = () => {
  const app = new Hono();

  app.get('/', (c) => {
    const bookmarks = exportAllBookmarks();
    return c.json(bookmarks, 200);
  });

  return app;
};
```

**Key design decisions:**

1. **Simple route**: No validation needed — no request body, no query params. Auth is handled by global middleware.

2. **Response format**: Returns a plain JSON array `[{...}, {...}]`, NOT the paginated envelope `{ data: [], total: N }`. The export is a complete dump, not a paginated list. This matches the acceptance criteria: "the body contains an array of all bookmarks."

3. **Content-Type**: Hono's `c.json()` automatically sets `Content-Type: application/json`.

### Task 3: Register Routes in `app.ts`

In `src/app.ts`, make two changes:

1. Add import:
```typescript
import { createExportRoutes } from './routes/export-routes.js';
```

2. Add route (after tags):
```typescript
app.route('/api/export', createExportRoutes());
```

### Task 4: Test File

Create `test/routes/export-routes.test.ts`.

**Test helpers:**

```typescript
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { DatabaseManager } from '../../src/db/database.js';
import { setDatabaseManager } from '../../src/db/database.js';
import { setApiKeyHash } from '../../src/db/repositories/settings-repository.js';
import { createInMemoryManager } from '../helpers.js';

const API_KEY = 'test-api-key';

const authorizedGetRequest = (app: ReturnType<typeof createApp>, path: string) =>
  app.request(path, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${API_KEY}`,
    },
  });

const createBookmarkViaApi = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request('/api/bookmarks', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
```

**Test cases:**

- Empty database → `200` with `[]`
- Create 2 bookmarks (one with tags, one without), export → array of 2 bookmarks with correct fields
- Each exported bookmark has: `id`, `url`, `title`, `description`, `tags` (as `string[]`), `created_at`, `updated_at`
- Bookmark without tags → `tags: []`
- Bookmark with tags → `tags: ["tag1", "tag2"]` (names, not IDs)
- No auth → `401`
- Response `Content-Type` includes `application/json`

### Previous Story Learnings (from Epics 1-4.1)

1. **Type casts**: Use proper types, not `as never`. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases.
3. **Keep existing tests passing**: Do NOT modify any existing test expectations.
4. **Response body verification**: Always verify both status code and response body structure.
5. **No response envelope for export**: Export returns a plain array `[]`, NOT `{ data: [], total: N }`. The paginated envelope is only for list endpoints.

### Project Structure Notes

- **New file**: `src/services/export-service.ts` — export logic (single function)
- **New file**: `src/routes/export-routes.ts` — GET `/api/export` route
- **New file**: `test/routes/export-routes.test.ts` — export endpoint tests
- **Modified**: `src/app.ts` — register export routes
- **NO new types** — uses existing `Bookmark` from `src/types.ts`
- **NO new schemas** — no request body to validate
- **NO new middleware** — auth is handled by global middleware

### References

- [Source: epics.md#Story 4.2] — acceptance criteria and FR mappings (FR22, FR23)
- [Source: architecture.md#Data Architecture] — normalized tag model
- [Source: architecture.md#Project Structure] — `src/services/export-service.ts`, `src/routes/export-routes.ts`
- [Source: architecture.md#Requirements to Structure Mapping] — FR22-23 map to `export-routes.ts` + `export-service.ts`
- [Source: architecture.md#API Patterns] — response format (plain array for export, not paginated envelope)
- [Source: types.ts] — existing `Bookmark` interface with all required fields
- [Source: bookmark-repository.ts] — tag resolution pattern (getTagsByBookmarkId)
- [Source: app.ts] — route registration pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
