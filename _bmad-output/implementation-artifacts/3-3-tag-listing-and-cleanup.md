# Story 3.3: Tag Listing and Cleanup

Status: ready-for-dev

## Story

As a developer,
I want to retrieve a list of all tags with bookmark counts and have orphaned tags cleaned up,
So that I can see my tag taxonomy and keep it organized.

## Acceptance Criteria

1. **Given** bookmarks exist with various tags **When** GET `/api/tags` is called **Then** a 200 response is returned with an array of tag objects: `[{ "name": "rust", "count": 5 }, ...]` (FR12) **And** the count reflects the actual number of bookmarks with that tag

2. **Given** no bookmarks have been created **When** GET `/api/tags` is called **Then** a 200 response with an empty array `[]` is returned

3. **Given** a tag exists that was previously assigned to bookmarks **When** all bookmarks with that tag are deleted or updated to remove the tag **Then** the tag is excluded from the GET `/api/tags` response (FR14) **And** the zero-count tag is either cleaned up from the database or filtered out from results

4. **Given** tags are returned **When** the response is generated **Then** tags are sorted alphabetically by name

## Tasks / Subtasks

- [ ] Task 1: Create `tag-repository.ts` with `listTags` function (AC: #1, #2, #3, #4)
  - [ ] Create `src/db/repositories/tag-repository.ts`
  - [ ] Implement `listTags()` that returns all tags with non-zero bookmark counts
  - [ ] Results sorted alphabetically by tag name
  - [ ] Returns `Tag[]` (from `src/types.ts` — already defined: `{ name: string; count: number }`)

- [ ] Task 2: Create `tag-routes.ts` with GET `/` handler (AC: #1, #2)
  - [ ] Create `src/routes/tag-routes.ts`
  - [ ] Implement GET `/` that calls `listTags()` and returns the array directly
  - [ ] Response is a plain array `[{ name, count }, ...]` (NOT wrapped in `{ data, total }` — tags are not paginated)

- [ ] Task 3: Register tag routes in `app.ts` (AC: #1)
  - [ ] Replace the empty `new Hono()` placeholder at `/api/tags` with `createTagRoutes()`
  - [ ] Import `createTagRoutes` from `./routes/tag-routes.js`

- [ ] Task 4: Add orphan tag cleanup to bookmark delete and update operations (AC: #3)
  - [ ] After deleting bookmark tag associations (in `deleteBookmark` and `updateBookmark`), clean up orphaned tags
  - [ ] An orphaned tag is one with zero entries in `bookmark_tags`
  - [ ] Use `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM bookmark_tags)` or a targeted approach

- [ ] Task 5: Write tests (AC: #1-#4)
  - [ ] GET `/api/tags` returns tags with correct bookmark counts
  - [ ] GET `/api/tags` returns empty array when no bookmarks exist
  - [ ] GET `/api/tags` excludes zero-count tags (after bookmark deletion)
  - [ ] GET `/api/tags` excludes zero-count tags (after bookmark update removes tag)
  - [ ] Tags are sorted alphabetically
  - [ ] GET `/api/tags` requires authentication (401 without API key)
  - [ ] Multiple bookmarks with same tag produce correct count
  - [ ] All existing tests must still pass

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`Tag` type already exists** in `src/types.ts` — `{ name: string; count: number }`. Use it directly.

**`app.ts` already has a placeholder** for tag routes: `app.route('/api/tags', new Hono())`. Replace the empty `new Hono()` with the actual `createTagRoutes()`.

**`getDatabase()` and `SqliteDatabase`** from `src/db/database.ts` — same DB access pattern as bookmark-repository.

**Error helpers** in `src/middleware/error-middleware.ts` — all existing helpers remain usable (though this story is unlikely to need them — tag listing has no error cases beyond auth).

**Test helpers** in `test/routes/bookmark-routes.test.ts`:
- `authorizedJsonRequest(app, body)` — POST with auth (for creating test bookmarks with tags)
- `authorizedGetRequest(app, path)` — GET with auth

**Test setup pattern** in `test/routes/bookmark-routes.test.ts`:
- `createInMemoryManager()`, `setDatabaseManager()`, `setApiKeyHash()` in `beforeEach`
- `manager.close()`, `setDatabaseManager(null)` in `afterEach`

### Task 1: Tag Repository Implementation

Create `src/db/repositories/tag-repository.ts`:

```typescript
import type { Tag } from '../../types.js';
import { getDatabase } from '../database.js';

export const listTags = (): Tag[] => {
  const db = getDatabase();

  const rows = db.prepare(
    `SELECT t.name, COUNT(bt.bookmark_id) AS count
     FROM tags t
     INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
     GROUP BY t.id, t.name
     HAVING COUNT(bt.bookmark_id) > 0
     ORDER BY t.name ASC`,
  ).all() as Array<{ name: string; count: number }>;

  return rows;
};
```

**Key design decisions:**

1. **INNER JOIN filters out orphaned tags automatically** — tags with zero bookmark associations won't appear in results because they have no matching rows in `bookmark_tags`. The `HAVING COUNT > 0` is technically redundant with `INNER JOIN` but makes the intent explicit.

2. **No pagination** — the PRD and epics define this as a simple array response, not `{ data, total }`. Tag lists are inherently small (hundreds at most).

3. **The query handles AC #3 implicitly** — whether orphaned tags are cleaned up from the DB or just filtered out, the `INNER JOIN` ensures they never appear in results.

### Task 2: Tag Routes Implementation

Create `src/routes/tag-routes.ts`:

```typescript
import { Hono } from 'hono';

import { listTags } from '../db/repositories/tag-repository.js';

export const createTagRoutes = () => {
  const app = new Hono();

  app.get('/', (c) => {
    const tags = listTags();
    return c.json(tags);
  });

  return app;
};
```

**Key design decisions:**

1. **No validation needed** — GET `/api/tags` takes no parameters.
2. **Direct array response** — return `[{ name, count }, ...]` not `{ data, total }`. This matches the epics spec: "an array of tag objects".
3. **Auth is handled by the global middleware** — no per-route auth needed.

### Task 3: Register Routes in `app.ts`

In `src/app.ts`, make two changes:

1. Add import:
```typescript
import { createTagRoutes } from './routes/tag-routes.js';
```

2. Replace the placeholder:
```typescript
// BEFORE:
app.route('/api/tags', new Hono());

// AFTER:
app.route('/api/tags', createTagRoutes());
```

### Task 4: Orphan Tag Cleanup

Two approaches — choose the simpler one:

**Option A (Recommended): Cleanup on delete/update in bookmark-repository.ts**

Add a private helper in `src/db/repositories/bookmark-repository.ts`:

```typescript
const cleanupOrphanedTags = (db: SqliteDatabase): void => {
  db.prepare(
    `DELETE FROM tags
     WHERE id NOT IN (SELECT DISTINCT tag_id FROM bookmark_tags)`,
  ).run();
};
```

Call this at the end of `deleteBookmarkTx` (after deleting tag associations) and at the end of `updateBookmarkTx` (after re-assigning tags):

```typescript
// In deleteBookmarkTx, after deleteTagAssociations.run(bookmarkId):
cleanupOrphanedTags(db);

// In updateBookmarkTx, after the tag re-assignment loop:
cleanupOrphanedTags(db);
```

**Why cleanup on write instead of filtering on read:**
- The `INNER JOIN` in `listTags` already filters orphaned tags from API responses (AC #3 is satisfied either way)
- But cleanup prevents orphaned tags from accumulating in the database over time
- It's cheap — runs inside the existing transaction, single query, indexed join

**Option B (Simpler alternative): No explicit cleanup**

Since `listTags` uses `INNER JOIN` which inherently excludes orphaned tags, you can skip the cleanup entirely. Orphaned tag rows would accumulate in the `tags` table but would never appear in API responses. This is acceptable per the AC: "cleaned up from the database **or** filtered out from results."

**Recommendation: Use Option A.** The cleanup is trivial to implement and keeps the database clean.

### Test File: `test/routes/tag-routes.test.ts`

Create a new test file for tag routes. Use the same setup pattern as `bookmark-routes.test.ts`:

```typescript
import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { DatabaseManager } from '../../src/db/database.js';
import { setDatabaseManager } from '../../src/db/database.js';
import { setApiKeyHash } from '../../src/db/repositories/settings-repository.js';
import { createInMemoryManager } from '../helpers.js';

const API_KEY = 'test-api-key';

const authorizedGetRequest = (app: ReturnType<typeof createApp>, path: string) => app.request(path, {
  method: 'GET',
  headers: {
    authorization: `Bearer ${API_KEY}`,
  },
});

const authorizedJsonRequest = (app: ReturnType<typeof createApp>, body: unknown) => app.request('/api/bookmarks', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${API_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

const authorizedPutRequest = (app: ReturnType<typeof createApp>, path: string, body: unknown) => app.request(path, {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${API_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

const authorizedDeleteRequest = (app: ReturnType<typeof createApp>, path: string) => app.request(path, {
  method: 'DELETE',
  headers: {
    authorization: `Bearer ${API_KEY}`,
  },
});

describe('tag routes', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
    setApiKeyHash(createHash('sha256').update(API_KEY).digest('hex'));
  });

  afterEach(() => {
    manager.close();
    setDatabaseManager(null);
  });

  it('returns empty array when no bookmarks exist', async () => {
    const app = createApp();
    const res = await authorizedGetRequest(app, '/api/tags');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns tags with correct bookmark counts', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://tokio.rs',
      title: 'Tokio Runtime',
      tags: ['rust', 'async'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://rust-lang.org',
      title: 'Rust Language',
      tags: ['rust'],
    });

    const res = await authorizedGetRequest(app, '/api/tags');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ name: string; count: number }>;
    expect(body).toEqual([
      { name: 'async', count: 1 },
      { name: 'rust', count: 2 },
    ]);
  });

  it('returns tags sorted alphabetically', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/z',
      title: 'Z Site',
      tags: ['zebra', 'alpha', 'middle'],
    });

    const res = await authorizedGetRequest(app, '/api/tags');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ name: string }>;
    const names = body.map((t) => t.name);
    expect(names).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('excludes zero-count tags after bookmark deletion', async () => {
    const app = createApp();

    // Create bookmark with unique tag
    const createRes = await authorizedJsonRequest(app, {
      url: 'https://example.com/only',
      title: 'Only Bookmark',
      tags: ['orphan-tag', 'shared-tag'],
    });
    const created = await createRes.json() as { id: number };

    // Create another bookmark sharing one tag
    await authorizedJsonRequest(app, {
      url: 'https://example.com/other',
      title: 'Other Bookmark',
      tags: ['shared-tag'],
    });

    // Delete the first bookmark — 'orphan-tag' should disappear
    await authorizedDeleteRequest(app, `/api/bookmarks/${created.id}`);

    const res = await authorizedGetRequest(app, '/api/tags');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ name: string; count: number }>;
    const names = body.map((t) => t.name);
    expect(names).not.toContain('orphan-tag');
    expect(body).toEqual([{ name: 'shared-tag', count: 1 }]);
  });

  it('excludes zero-count tags after bookmark update removes tag', async () => {
    const app = createApp();

    const createRes = await authorizedJsonRequest(app, {
      url: 'https://example.com/updatable',
      title: 'Updatable Bookmark',
      tags: ['will-remove', 'will-keep'],
    });
    const created = await createRes.json() as { id: number };

    // Update bookmark to remove 'will-remove' tag
    await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/updatable',
      title: 'Updatable Bookmark',
      tags: ['will-keep'],
    });

    const res = await authorizedGetRequest(app, '/api/tags');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ name: string; count: number }>;
    const names = body.map((t) => t.name);
    expect(names).not.toContain('will-remove');
    expect(body).toEqual([{ name: 'will-keep', count: 1 }]);
  });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await app.request('/api/tags');
    expect(res.status).toBe(401);
  });

  it('correctly counts when multiple bookmarks share the same tag', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/1',
      title: 'First',
      tags: ['common'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/2',
      title: 'Second',
      tags: ['common'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/3',
      title: 'Third',
      tags: ['common'],
    });

    const res = await authorizedGetRequest(app, '/api/tags');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ name: string; count: number }>;
    expect(body).toEqual([{ name: 'common', count: 3 }]);
  });
});
```

**Test helper pattern:** Duplicate the helper functions locally in the test file rather than importing from `bookmark-routes.test.ts` — this follows the existing pattern where each test file defines its own helpers.

### Previous Story Learnings (from Epic 2 & 3)

1. **Type casts**: Use proper types, not `as never`. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases.
3. **Keep existing tests passing**: Do NOT modify any existing test expectations.
4. **Response body verification**: Always verify both status code and response body structure.
5. **FTS5 MATCH can throw**: Wrap in try/catch. Not relevant here — tag listing is plain SQL.
6. **Transaction safety**: Orphan cleanup should happen inside the existing transaction in deleteBookmark/updateBookmark.

### Project Structure Notes

- **New file**: `src/db/repositories/tag-repository.ts` — tag listing with counts
- **New file**: `src/routes/tag-routes.ts` — GET `/api/tags` route
- **New file**: `test/routes/tag-routes.test.ts` — tag route tests
- **Modified**: `src/app.ts` — replace placeholder `new Hono()` with `createTagRoutes()`
- **Modified**: `src/db/repositories/bookmark-repository.ts` — add `cleanupOrphanedTags` helper, call from `deleteBookmarkTx` and `updateBookmarkTx`
- **NO new schemas** — tag listing has no query parameters or request body
- **NO new middleware** — auth is handled by global middleware

### References

- [Source: epics.md#Story 3.3] — acceptance criteria and FR mappings (FR12, FR14)
- [Source: architecture.md#Data Architecture] — normalized tag model with junction table
- [Source: architecture.md#Naming Patterns] — tables: `tags`, `bookmark_tags`; file: `tag-repository.ts`, `tag-routes.ts`
- [Source: architecture.md#Project Structure] — `src/db/repositories/tag-repository.ts`, `src/routes/tag-routes.ts`, `test/routes/tag-routes.test.ts`
- [Source: architecture.md#Requirements to Structure Mapping] — FR12, FR14 map to `tag-routes.ts` + `tag-repository.ts`
- [Source: types.ts] — existing `Tag` interface: `{ name: string; count: number }`
- [Source: app.ts] — existing placeholder: `app.route('/api/tags', new Hono())`
- [Source: bookmark-repository.ts] — existing `deleteBookmark` and `updateBookmark` to add cleanup to
- [Source: 3-2-tag-filtering.md] — sibling story in same epic

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
