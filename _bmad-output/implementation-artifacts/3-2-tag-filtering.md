# Story 3.2: Tag Filtering

Status: done

## Story

As a developer,
I want to filter bookmarks by one or more tags,
So that I can browse my bookmarks by topic or category.

## Acceptance Criteria

1. **Given** bookmarks exist with various tags **When** GET `/api/bookmarks?tags=rust` is called **Then** only bookmarks tagged with `rust` are returned (FR8)

2. **Given** multiple tags are specified **When** GET `/api/bookmarks?tags=rust,async` is called **Then** only bookmarks that have BOTH `rust` AND `async` tags are returned (AND semantics) (FR8)

3. **Given** tag filtering is combined with full-text search **When** GET `/api/bookmarks?q=performance&tags=rust` is called **Then** only bookmarks matching the search query AND having the `rust` tag are returned (FR9)

4. **Given** tag filtering is combined with pagination and sorting **When** GET `/api/bookmarks?tags=rust&limit=10&offset=0&sort=title` is called **Then** results are filtered, sorted, and paginated correctly

5. **Given** a tag name that does not exist **When** GET `/api/bookmarks?tags=nonexistent` is called **Then** a 200 response with `{ "data": [], "total": 0 }` is returned

## Tasks / Subtasks

- [x] Task 1: Add `tags` query parameter to pagination schema (AC: #1, #2, #4)
  - [x]Add optional `tags` field to `paginationSchema` in `src/schemas/common-schemas.ts`
  - [x]`tags` should be a comma-separated string that is parsed into an array of lowercase-trimmed tag names
  - [x]Empty string or missing param results in no tag filtering

- [x] Task 2: Add tag filtering logic to `listBookmarks` in bookmark repository (AC: #1, #2, #4, #5)
  - [x]Modify `listBookmarks` options type to accept optional `tags` parameter
  - [x]When `tags` is provided (non-empty array), filter bookmarks using AND semantics via `bookmark_tags`/`tags` junction join
  - [x]AND semantics: a bookmark must have ALL specified tags (use HAVING COUNT = tag count pattern)
  - [x]Ensure pagination (limit/offset) and sorting work with filtered results
  - [x]Return correct `total` count for filtered results
  - [x]When `tags` is NOT provided, keep existing behavior unchanged

- [x] Task 3: Add combined search + tag filtering to `searchBookmarks` (AC: #3)
  - [x]When both `q` and `tags` are provided, apply FTS5 search AND tag filtering together
  - [x]Results must match the search query AND have all specified tags
  - [x]Relevance ranking from FTS5 is preserved when combining with tag filter

- [x] Task 4: Wire `tags` parameter through route handler (AC: #1)
  - [x]Verify the existing `GET /` handler in `src/routes/bookmark-routes.ts` passes `tags` to `listBookmarks` (should flow through automatically via `paginationSchema`)

- [x] Task 5: Write tests (AC: #1-#5)
  - [x]Filter bookmarks by a single tag returns only matching bookmarks
  - [x]Filter bookmarks by multiple tags uses AND semantics (only bookmarks with ALL tags)
  - [x]Filter with a non-existent tag returns `{ data: [], total: 0 }`
  - [x]Tag filtering respects pagination parameters (limit, offset)
  - [x]Tag filtering respects sort parameter
  - [x]Tag filtering combined with full-text search (`q` + `tags`)
  - [x]Tag filtering with empty tags param returns all bookmarks (no filter)
  - [x]Tag names are case-insensitive (tags are stored lowercase)
  - [x]All existing tests must still pass

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`paginationSchema` already exists** in `src/schemas/common-schemas.ts` — extend it by adding the `tags` field. After Story 3.1, this schema already has `q`. Add `tags` alongside it.

**`listBookmarks(options)` already exists** in `src/db/repositories/bookmark-repository.ts` — extend it to handle `tags`. After Story 3.1, this function already handles `q` for FTS5 search. Add tag filtering to both the non-search path and the search path.

**`GET /` route handler already exists** in `src/routes/bookmark-routes.ts` — it already passes the validated query to `listBookmarks`. Adding `tags` to the schema flows through automatically.

**Error helpers** in `src/middleware/error-middleware.ts` — all existing helpers remain usable.

**Test helpers** in `test/routes/bookmark-routes.test.ts`:
- `authorizedJsonRequest(app, body)` — POST with auth (for creating test bookmarks)
- `authorizedGetRequest(app, path)` — GET with auth (for filtered queries)
- `createInMemoryManager()` — in-memory DB with migrations applied

### Dependency on Story 3.1

This story depends on Story 3.1 (FTS5 search) being implemented first. Specifically:
- The `paginationSchema` will already have a `q` field after Story 3.1
- The `listBookmarks` function will already have search logic after Story 3.1
- AC #3 (combined search + tag filtering) requires the FTS5 search from Story 3.1 to be in place

**If Story 3.1 is not yet merged:** Implement tag filtering for the non-search path only, and leave AC #3 as a TODO. However, the schema and options type should still include `tags` so it's ready.

### Schema Update: Add `tags` to `paginationSchema`

In `src/schemas/common-schemas.ts`, add a `tags` field after the existing fields:

```typescript
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').default(20).transform((value) => Math.min(value, 100)),
  offset: z.coerce.number().int().min(0, 'Offset must be at least 0').default(0),
  sort: z.enum(['created_at', 'updated_at', 'title']).optional(),
  q: z.string().trim().min(1).optional(),
  tags: z.string().optional().transform((value) => {
    if (!value) return undefined;
    const parsed = value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
  }),
});
```

**CRITICAL: The `tags` query parameter is a comma-separated string** (e.g., `?tags=rust,async`). It must be parsed into an array of lowercase-trimmed strings. The transform handles this:
1. Undefined/empty → `undefined` (no filter)
2. `"rust,async"` → `["rust", "async"]`
3. `"rust, Async ,,"` → `["rust", "async"]` (trimmed, lowercased, empty entries removed)

After this change, `PaginationInput` (via `z.infer`) will have `tags?: string[] | undefined`.

### Repository Implementation: Tag Filtering in `listBookmarks`

Modify `listBookmarks` in `src/db/repositories/bookmark-repository.ts`. The `options` type gains `tags?: string[]` (from the updated `PaginationInput` type).

**Tag filtering strategy (non-search path, when `q` is NOT provided):**

Use a subquery with AND semantics. A bookmark matches if it has ALL of the specified tags. This is achieved with HAVING COUNT = number of tags:

```typescript
if (options.tags && options.tags.length > 0) {
  return filterByTags(db, options);
}
```

Create a private `filterByTags` function:

```typescript
const filterByTags = (
  db: ReturnType<typeof getDatabase>,
  options: {
    tags: string[];
    limit: number;
    offset: number;
    sort?: 'created_at' | 'updated_at' | 'title' | undefined;
  },
): PaginatedResponse<Bookmark> => {
  const tagCount = options.tags.length;
  const tagPlaceholders = options.tags.map(() => '?').join(', ');
  const orderBy = SORT_CLAUSES[options.sort ?? 'created_at'];

  // Find bookmark IDs that have ALL specified tags (AND semantics)
  const filterSql = `
    SELECT b.id, b.url, b.title, b.description, b.created_at, b.updated_at
    FROM bookmarks b
    INNER JOIN bookmark_tags bt ON bt.bookmark_id = b.id
    INNER JOIN tags t ON t.id = bt.tag_id
    WHERE t.name IN (${tagPlaceholders})
    GROUP BY b.id
    HAVING COUNT(DISTINCT t.name) = ?
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(filterSql).all(
    ...options.tags, tagCount, options.limit, options.offset,
  ) as BookmarkRow[];

  // Count total matching bookmarks
  const countSql = `
    SELECT COUNT(*) as count FROM (
      SELECT bt.bookmark_id
      FROM bookmark_tags bt
      INNER JOIN tags t ON t.id = bt.tag_id
      WHERE t.name IN (${tagPlaceholders})
      GROUP BY bt.bookmark_id
      HAVING COUNT(DISTINCT t.name) = ?
    )
  `;

  const total = (db.prepare(countSql).get(...options.tags, tagCount) as { count: number }).count;

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

**CRITICAL: AND semantics** — The `HAVING COUNT(DISTINCT t.name) = ?` clause ensures only bookmarks with ALL specified tags are returned, not bookmarks with ANY of them.

**CRITICAL: The `filterByTags` function is NOT exported.** It's a private helper called only by `listBookmarks`.

### Repository Implementation: Combined Search + Tag Filtering

Modify the `searchBookmarks` function (added by Story 3.1) to accept and apply tag filtering when both `q` and `tags` are provided.

The approach: after the FTS5/tag-name search finds matching bookmark IDs, add an additional filter requiring all specified tags. This is done by adding a WHERE clause to the search SQL that restricts results to bookmarks having all specified filter tags.

```typescript
// Inside searchBookmarks, when options.tags is provided:
// Add to the search SQL an additional condition:
//   AND b.id IN (
//     SELECT bt.bookmark_id
//     FROM bookmark_tags bt
//     INNER JOIN tags t ON t.id = bt.tag_id
//     WHERE t.name IN (?, ?, ...)
//     GROUP BY bt.bookmark_id
//     HAVING COUNT(DISTINCT t.name) = ?
//   )
```

The combined query pattern:
1. FTS5 MATCH finds content-matching bookmarks
2. Tag name LIKE finds tag-matching bookmarks
3. UNION combines them
4. An outer filter restricts to only those bookmarks that also have all specified filter tags
5. Rank and paginate

**Implementation approach for `searchBookmarks`:**

Update `searchBookmarks` signature to accept optional `tags`:

```typescript
const searchBookmarks = (
  db: ReturnType<typeof getDatabase>,
  query: string,
  limit: number,
  offset: number,
  tags?: string[],
): PaginatedResponse<Bookmark> => {
```

When `tags` is provided and non-empty, wrap the UNION query in a CTE and add the tag filter:

```typescript
  const hasTagFilter = tags && tags.length > 0;
  const tagCount = hasTagFilter ? tags.length : 0;
  const tagFilterPlaceholders = hasTagFilter ? tags.map(() => '?').join(', ') : '';

  const tagFilterClause = hasTagFilter
    ? `AND id IN (
        SELECT bt.bookmark_id
        FROM bookmark_tags bt
        INNER JOIN tags t ON t.id = bt.tag_id
        WHERE t.name IN (${tagFilterPlaceholders})
        GROUP BY bt.bookmark_id
        HAVING COUNT(DISTINCT t.name) = ?
      )`
    : '';

  const searchSql = `
    WITH search_results AS (
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
    )
    SELECT * FROM search_results
    WHERE 1=1 ${tagFilterClause}
    ORDER BY rank ASC
    LIMIT ? OFFSET ?
  `;

  // Build params array
  const params: Array<string | number> = [ftsQuery, tagPattern, ftsQuery];
  if (hasTagFilter) {
    params.push(...tags, tagCount);
  }
  params.push(limit, offset);
```

Similarly update the count query to include the tag filter.

**CRITICAL: Parameter ordering matters.** The params array must match the placeholder order in the SQL exactly. Double-check that FTS params come first, then tag filter params, then pagination params.

### Updated `listBookmarks` Flow

After both Story 3.1 and 3.2, `listBookmarks` should have this decision flow:

```typescript
export const listBookmarks = (options: {
  limit: number;
  offset: number;
  sort?: 'created_at' | 'updated_at' | 'title' | undefined;
  q?: string | undefined;
  tags?: string[] | undefined;
}): PaginatedResponse<Bookmark> => {
  const db = getDatabase();

  // Search path (FTS5) — may also include tag filtering
  if (options.q) {
    return searchBookmarks(db, options.q, options.limit, options.offset, options.tags);
  }

  // Tag filtering path (no search)
  if (options.tags && options.tags.length > 0) {
    return filterByTags(db, options as { tags: string[]; limit: number; offset: number; sort?: string });
  }

  // Default: list all with pagination and sorting (existing code)
  // ... existing code unchanged ...
};
```

### Route Handler: No Changes Needed

The existing `GET /` route handler already passes validated query to `listBookmarks`. Since `paginationSchema` now includes `tags`, and `listBookmarks` now accepts `tags`, this flows through automatically. **No changes to `src/routes/bookmark-routes.ts`.**

### Test Pattern (Follow Existing)

Add new `describe` blocks to `test/routes/bookmark-routes.test.ts`:

```typescript
describe('GET /api/bookmarks tag filtering (tags parameter)', () => {
  it('filters bookmarks by a single tag', async () => {
    const app = createApp();

    // Create bookmarks with different tags
    await authorizedJsonRequest(app, {
      url: 'https://tokio.rs',
      title: 'Tokio Runtime',
      description: 'Async runtime for Rust',
      tags: ['rust', 'async'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/cooking',
      title: 'Cooking Blog',
      description: 'Recipes',
      tags: ['cooking'],
    });

    const res = await authorizedGetRequest(app, '/api/bookmarks?tags=rust');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0].title).toBe('Tokio Runtime');
  });

  it('filters by multiple tags using AND semantics', async () => {
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

    // Both have 'rust', but only one has both 'rust' AND 'async'
    const res = await authorizedGetRequest(app, '/api/bookmarks?tags=rust,async');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0].title).toBe('Tokio Runtime');
  });

  it('returns empty results for non-existent tag', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com',
      title: 'Example',
      tags: ['web'],
    });

    const res = await authorizedGetRequest(app, '/api/bookmarks?tags=nonexistent');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body.total).toBe(0);
    expect(body.data).toEqual([]);
  });
});
```

**Test helper reuse:** Use `authorizedJsonRequest` to create bookmarks, `authorizedGetRequest` to query. No new helpers needed.

**Test isolation:** Each test gets a fresh in-memory database via `beforeEach`/`afterEach`.

### Previous Story Learnings (from Epic 2 & Story 3.1)

1. **Type casts**: Use proper types, not `as never`. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases.
3. **Zod validator hook**: Use the same validation hook pattern for consistent error formatting.
4. **Keep existing tests passing**: Do NOT modify any existing test expectations.
5. **Response body verification**: Always verify both status code and response body structure.
6. **FTS5 MATCH can throw**: Wrap in try/catch. Tag filtering SQL is standard and won't throw, but combined queries inherit the FTS5 try/catch.

### Project Structure Notes

- **Modified**: `src/schemas/common-schemas.ts` — add `tags` field to `paginationSchema`
- **Modified**: `src/db/repositories/bookmark-repository.ts` — add `filterByTags` helper, update `listBookmarks` to handle `tags`, update `searchBookmarks` to accept `tags` for combined filtering
- **Modified**: `test/routes/bookmark-routes.test.ts` — add tag filtering test cases
- **NO new files** — tag filtering goes through existing `GET /api/bookmarks` endpoint
- **NO new route files** — uses existing bookmark routes
- **NO changes to `src/routes/bookmark-routes.ts`** — the route handler already passes all query options through

### References

- [Source: epics.md#Story 3.2] — acceptance criteria and FR mappings (FR8, FR9)
- [Source: architecture.md#Data Architecture] — normalized tag model with junction table, AND semantics
- [Source: architecture.md#Naming Patterns] — tables: `bookmarks`, `tags`, `bookmark_tags`
- [Source: architecture.md#API & Communication Patterns] — response format `{ data: [...], total: N }`, pagination params
- [Source: architecture.md#Requirements to Structure Mapping] — FR8-9 maps to `bookmark-repository.ts`
- [Source: 3-1-full-text-search-with-fts5.md] — FTS5 search implementation that this story builds on
- [Source: common-schemas.ts] — existing `paginationSchema` to extend
- [Source: bookmark-repository.ts] — existing `listBookmarks` to extend
- [Source: bookmark-routes.ts] — existing GET handler that auto-passes query options

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
