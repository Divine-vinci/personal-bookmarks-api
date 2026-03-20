# Story 3.1: Full-Text Search with FTS5

Status: ready-for-dev

## Story

As a developer,
I want to search my bookmarks using natural language queries across all text fields,
So that I can find saved links quickly without remembering exact titles or URLs.

## Acceptance Criteria

1. **Given** the FTS5 migration `002-fts5-setup.sql` is applied **When** it completes **Then** a `bookmarks_fts` virtual table exists (content-sync with bookmarks table) indexing title, url, description **And** SQLite triggers exist to keep bookmarks_fts in sync on INSERT, UPDATE, and DELETE of bookmarks

2. **Given** bookmarks exist in the database **When** GET `/api/bookmarks?q=tokio+cancel` is called **Then** full-text search is performed across title, url, description, and tags (FR7) **And** results are ranked by FTS5 `bm25()` relevance score (FR10) **And** results are returned in `{ "data": [...], "total": N }` format with pagination

3. **Given** a search query is provided **When** no bookmarks match the query **Then** a 200 response with `{ "data": [], "total": 0 }` is returned

4. **Given** a search query is combined with pagination parameters **When** GET `/api/bookmarks?q=rust&limit=5&offset=10` is called **Then** search results respect the pagination parameters

5. **Given** a new bookmark is created after FTS5 is set up **When** the bookmark is saved to the database **Then** the FTS5 index is automatically updated via the INSERT trigger

6. **Given** an existing bookmark is updated **When** the title or description changes **Then** the FTS5 index is automatically updated via the UPDATE trigger

## Tasks / Subtasks

- [ ] Task 1: Create FTS5 migration `002-fts5-setup.sql` (AC: #1, #5, #6)
  - [ ] Create `src/db/migrations/002-fts5-setup.sql`
  - [ ] Create `bookmarks_fts` virtual table as content-sync FTS5 table indexing `title`, `url`, `description`
  - [ ] Create INSERT trigger `bookmarks_ai` to sync new bookmarks to FTS index
  - [ ] Create DELETE trigger `bookmarks_ad` to remove deleted bookmarks from FTS index
  - [ ] Create UPDATE trigger `bookmarks_au` to update FTS index when bookmarks change
  - [ ] Populate FTS table with existing bookmarks data (backfill)

- [ ] Task 2: Add `q` query parameter to pagination schema (AC: #2, #4)
  - [ ] Add optional `q` field to `paginationSchema` in `src/schemas/common-schemas.ts`
  - [ ] `q` should be a trimmed string, optional, min length 1 when provided

- [ ] Task 3: Add search logic to `listBookmarks` in bookmark repository (AC: #2, #3, #4)
  - [ ] Modify `listBookmarks` options type to accept optional `q` parameter
  - [ ] When `q` is provided, query `bookmarks_fts` using FTS5 MATCH and join with `bookmarks` table
  - [ ] Include tag-based search: also match bookmarks whose tags contain the search term
  - [ ] Rank results by `bm25()` relevance when searching (override sort parameter)
  - [ ] When `q` is NOT provided, keep existing behavior unchanged
  - [ ] Ensure pagination (limit/offset) works with search results
  - [ ] Return correct `total` count for search results

- [ ] Task 4: Wire `q` parameter through route handler (AC: #2)
  - [ ] Update `GET /` handler in `src/routes/bookmark-routes.ts` to pass `q` to `listBookmarks`

- [ ] Task 5: Write tests (AC: #1-#6)
  - [ ] FTS5 search returns matching bookmarks by title
  - [ ] FTS5 search returns matching bookmarks by URL
  - [ ] FTS5 search returns matching bookmarks by description
  - [ ] FTS5 search returns matching bookmarks by tag name
  - [ ] FTS5 search returns results ranked by relevance
  - [ ] FTS5 search with no matches returns `{ data: [], total: 0 }`
  - [ ] FTS5 search respects pagination parameters (limit, offset)
  - [ ] FTS5 search with empty query returns all bookmarks (same as no q param)
  - [ ] Newly created bookmarks are searchable (trigger test)
  - [ ] Updated bookmarks reflect changes in search (trigger test)
  - [ ] Deleted bookmarks are removed from search results (trigger test)
  - [ ] Search combined with sort — relevance ranking overrides sort when q is present
  - [ ] All existing tests must still pass

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`paginationSchema` already exists** in `src/schemas/common-schemas.ts` — extend it by adding the `q` field, do NOT create a new schema.

**`listBookmarks(options)` already exists** in `src/db/repositories/bookmark-repository.ts` — extend it to handle `q`, do NOT create a new function.

**`GET /` route handler already exists** in `src/routes/bookmark-routes.ts` — it already passes `options` from `paginationSchema` to `listBookmarks`. Adding `q` to the schema and options type flows through automatically.

**Error helpers** in `src/middleware/error-middleware.ts` — all existing helpers remain usable.

**Test helpers** in `test/routes/bookmark-routes.test.ts`:
- `authorizedJsonRequest(app, body)` — POST with auth (for creating test bookmarks)
- `authorizedGetRequest(app, path)` — GET with auth (for search queries)
- `createInMemoryManager()` — in-memory DB with migrations applied

### FTS5 Migration: `002-fts5-setup.sql`

Create `src/db/migrations/002-fts5-setup.sql` with this exact content:

```sql
-- FTS5 virtual table: content-sync with bookmarks table
-- Indexes title, url, description for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
  title,
  url,
  description,
  content='bookmarks',
  content_rowid='id'
);

-- Trigger: sync INSERT into FTS index
CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, title, url, description)
  VALUES (new.id, new.title, new.url, new.description);
END;

-- Trigger: sync DELETE from FTS index
CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, url, description)
  VALUES ('delete', old.id, old.title, old.url, old.description);
END;

-- Trigger: sync UPDATE to FTS index (delete old, insert new)
CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, url, description)
  VALUES ('delete', old.id, old.title, old.url, old.description);
  INSERT INTO bookmarks_fts(rowid, title, url, description)
  VALUES (new.id, new.title, new.url, new.description);
END;

-- Backfill existing bookmarks into FTS index
INSERT INTO bookmarks_fts(rowid, title, url, description)
SELECT id, title, url, description FROM bookmarks;
```

**CRITICAL FTS5 content-sync pattern:** The DELETE operation uses the special `bookmarks_fts` command column syntax where the first value is the literal string `'delete'`. This is FTS5's content-sync protocol — it tells FTS5 to remove the old row values. Do NOT use `DELETE FROM bookmarks_fts WHERE rowid = old.id` as this does not work with content-sync tables.

**CRITICAL: Tags are NOT in the FTS5 table.** FTS5 indexes `title`, `url`, `description` from the bookmarks table. Tags live in a separate table (`tags` + `bookmark_tags` junction). Tag search must be handled at the query level by joining through `bookmark_tags` and `tags` tables. See the repository implementation below.

### Schema Update: Add `q` to `paginationSchema`

In `src/schemas/common-schemas.ts`, add one field:

```typescript
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').default(20).transform((value) => Math.min(value, 100)),
  offset: z.coerce.number().int().min(0, 'Offset must be at least 0').default(0),
  sort: z.enum(['created_at', 'updated_at', 'title']).optional(),
  q: z.string().trim().min(1).optional(),
});
```

This is the only change to this file. The `PaginationInput` type is already derived from the schema via `z.infer`, so it automatically includes `q`.

### Repository Implementation: Search in `listBookmarks`

Modify `listBookmarks` in `src/db/repositories/bookmark-repository.ts`. The `options` type gains an optional `q: string` field (automatically from the updated `PaginationInput` type).

**Search strategy when `q` is provided:**

1. Query `bookmarks_fts` with FTS5 MATCH to find bookmarks matching by title/url/description
2. ALSO find bookmarks whose tags match the search term (via `tags.name LIKE ?`)
3. UNION the two result sets (deduplicate by bookmark ID)
4. Rank by `bm25()` for FTS matches (tag-only matches get a neutral relevance score)
5. Apply pagination (LIMIT/OFFSET) to the combined results
6. Count total matching results for the `total` field

**Implementation approach:**

```typescript
export const listBookmarks = (options: {
  limit: number;
  offset: number;
  sort?: 'created_at' | 'updated_at' | 'title' | undefined;
  q?: string | undefined;
}): PaginatedResponse<Bookmark> => {
  const db = getDatabase();

  if (options.q) {
    return searchBookmarks(db, options.q, options.limit, options.offset);
  }

  // ... existing non-search code stays unchanged ...
};
```

Create a private `searchBookmarks` function in the same file:

```typescript
const searchBookmarks = (
  db: SqliteDatabase,
  query: string,
  limit: number,
  offset: number,
): PaginatedResponse<Bookmark> => {
  // FTS5 search terms — append * for prefix matching
  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(' ');

  // Find bookmark IDs matching via FTS5 (title, url, description)
  // OR matching via tag name
  // Use UNION to combine, ranked by bm25() for FTS matches
  const searchSql = `
    SELECT b.id, b.url, b.title, b.description, b.created_at, b.updated_at,
           bm25(bookmarks_fts) as rank
    FROM bookmarks_fts
    JOIN bookmarks b ON b.id = bookmarks_fts.rowid
    WHERE bookmarks_fts MATCH ?
    UNION
    SELECT b.id, b.url, b.title, b.description, b.created_at, b.updated_at,
           0 as rank
    FROM bookmarks b
    JOIN bookmark_tags bt ON bt.bookmark_id = b.id
    JOIN tags t ON t.id = bt.tag_id
    WHERE t.name LIKE ?
    AND b.id NOT IN (
      SELECT bookmarks_fts.rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?
    )
    ORDER BY rank ASC
    LIMIT ? OFFSET ?
  `;

  const tagPattern = `%${query.toLowerCase()}%`;

  let rows: Array<BookmarkRow & { rank: number }>;
  try {
    rows = db.prepare(searchSql).all(ftsQuery, tagPattern, ftsQuery, limit, offset) as Array<BookmarkRow & { rank: number }>;
  } catch {
    // If FTS5 MATCH syntax fails (e.g., special chars), return empty results
    return { data: [], total: 0 };
  }

  // Count total matches
  const countSql = `
    SELECT COUNT(*) as count FROM (
      SELECT bookmarks_fts.rowid as id FROM bookmarks_fts WHERE bookmarks_fts MATCH ?
      UNION
      SELECT bt.bookmark_id as id
      FROM bookmark_tags bt
      JOIN tags t ON t.id = bt.tag_id
      WHERE t.name LIKE ?
    )
  `;

  let total: number;
  try {
    total = (db.prepare(countSql).get(ftsQuery, tagPattern) as { count: number }).count;
  } catch {
    total = 0;
  }

  if (rows.length === 0) {
    return { data: [], total };
  }

  // Fetch tags for matched bookmarks (same pattern as existing listBookmarks)
  const placeholders = rows.map(() => '?').join(', ');
  const bookmarkIds = rows.map((row) => row.id);
  const tagRows = db.prepare(
    `SELECT bt.bookmark_id, t.name
     FROM tags t
     INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
     WHERE bt.bookmark_id IN (${placeholders})
     ORDER BY t.name ASC`,
  ).all(...bookmarkIds) as Array<{ bookmark_id: number; name: string }>;

  const tagsByBookmarkId = new Map<number, string[]>();
  for (const tag of tagRows) {
    const tags = tagsByBookmarkId.get(tag.bookmark_id);
    if (tags) {
      tags.push(tag.name);
    } else {
      tagsByBookmarkId.set(tag.bookmark_id, [tag.name]);
    }
  }

  const bookmarks = rows.map((row) => mapBookmarkRow(
    row,
    tagsByBookmarkId.get(row.id) ?? [],
  ));

  return { data: bookmarks, total };
};
```

**CRITICAL: Import `SqliteDatabase` type.** You'll need to import the `SqliteDatabase` type from `../database.js` at the top of the file:
```typescript
import type { SqliteDatabase } from '../database.js';
```

**CRITICAL: `bm25()` returns negative values.** Lower (more negative) = more relevant. Sort `ASC` to get best matches first. Tag-only matches use `0` as rank so they appear after FTS matches.

**CRITICAL: FTS5 MATCH can throw on invalid query syntax.** Wrap in try/catch and return empty results on failure. Do NOT let FTS5 parse errors bubble up as 500 errors.

**CRITICAL: The `searchBookmarks` function is NOT exported.** It's a private helper called only by `listBookmarks`.

**CRITICAL: When `q` is provided, ignore the `sort` parameter.** Search results are always ranked by relevance. This is the correct behavior per FR10.

### Route Handler: No Changes Needed (Almost)

The existing `GET /` route handler in `src/routes/bookmark-routes.ts` already passes the validated query to `listBookmarks`:

```typescript
(c) => {
  const options = c.req.valid('query');
  const result = listBookmarks(options);
  return c.json(result);
},
```

Since `paginationSchema` now includes `q`, and `listBookmarks` now accepts `q`, this flows through automatically. **No changes needed to the route handler.**

However, you MAY need to update the `options` type annotation if TypeScript complains. The `PaginationInput` type from common-schemas already includes `q` via `z.infer`, so the type should propagate correctly.

### Test Pattern (Follow Existing)

Add new `describe` blocks to `test/routes/bookmark-routes.test.ts`. Use the established test pattern:

```typescript
describe('GET /api/bookmarks search (q parameter)', () => {
  it('searches bookmarks by title', async () => {
    const app = createApp();

    // Create test data
    await authorizedJsonRequest(app, {
      url: 'https://tokio.rs/tutorial',
      title: 'Tokio Task Cancellation Guide',
      description: 'How to handle cancellation in async Rust',
      tags: ['rust', 'async'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/unrelated',
      title: 'Cooking Recipes',
      description: 'Best pasta recipes',
      tags: ['cooking'],
    });

    const res = await authorizedGetRequest(app, '/api/bookmarks?q=tokio');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0].title).toBe('Tokio Task Cancellation Guide');
  });
});
```

**Test helper reuse:** Use `authorizedJsonRequest` to create bookmarks, `authorizedGetRequest` to search. No new helpers needed.

**Test isolation:** Each test gets a fresh in-memory database via `beforeEach`/`afterEach` — FTS5 migration is applied automatically since `createInMemoryManager()` runs all migrations.

### Previous Story Learnings (from Epic 2 code reviews)

1. **Type casts**: Use proper types, not `as never`. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases.
3. **Zod validator hook**: Use the same validation hook pattern for consistent error formatting.
4. **Keep existing tests passing**: Do NOT modify any existing test expectations.
5. **Response body verification**: Always verify both status code and response body structure.

### Project Structure Notes

- **New file**: `src/db/migrations/002-fts5-setup.sql` — FTS5 virtual table and triggers
- **Modified**: `src/schemas/common-schemas.ts` — add `q` field to `paginationSchema`
- **Modified**: `src/db/repositories/bookmark-repository.ts` — add search logic to `listBookmarks`, add private `searchBookmarks` helper
- **Modified**: `test/routes/bookmark-routes.test.ts` — add search test cases
- **NO new route files** — search goes through existing `GET /api/bookmarks` endpoint
- **NO new schema files** — `q` is added to existing `paginationSchema`
- **NO changes to `src/routes/bookmark-routes.ts`** — the route handler already passes all query options through

### References

- [Source: epics.md#Story 3.1] — acceptance criteria and FR mappings (FR7, FR10)
- [Source: architecture.md#Data Architecture] — FTS5 content-sync virtual table with triggers, `bm25()` ranking
- [Source: architecture.md#Naming Patterns] — FTS table named `bookmarks_fts`, triggers named `bookmarks_ai/ad/au`
- [Source: architecture.md#API & Communication Patterns] — response format `{ data: [...], total: N }`, pagination params
- [Source: architecture.md#Requirements to Structure Mapping] — FR7-10 maps to `bookmark-repository.ts` FTS5 queries and `002-fts5-setup.sql`
- [Source: prd-personal-bookmarks-api.md#Endpoint Specification] — `q` query parameter for full-text search
- [Source: common-schemas.ts] — existing `paginationSchema` to extend
- [Source: bookmark-repository.ts] — existing `listBookmarks` to extend
- [Source: bookmark-routes.ts] — existing GET handler that auto-passes query options
- [Source: stories 2-1 through 2-4] — established patterns, code review learnings

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
