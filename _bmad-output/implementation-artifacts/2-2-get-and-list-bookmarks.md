# Story 2.2: Get and List Bookmarks

Status: done

## Story

As a developer,
I want to retrieve a single bookmark by ID or a paginated list of all bookmarks with sorting,
So that I can access my saved links programmatically.

## Acceptance Criteria

1. **Given** a bookmark exists with a known ID **When** GET `/api/bookmarks/:id` is called with that ID **Then** a 200 response is returned with the complete bookmark object including tags array (FR2)

2. **Given** a bookmark ID that does not exist **When** GET `/api/bookmarks/:id` is called **Then** a 404 response with code `not_found` is returned

3. **Given** bookmarks exist in the database **When** GET `/api/bookmarks` is called with no query parameters **Then** a 200 response is returned with `{ "data": [...], "total": N }` format (FR3) **And** results are paginated with default limit of 20, offset 0 **And** results are sorted by `created_at` descending (newest first) by default

4. **Given** the `limit` query parameter is provided (e.g., `?limit=5`) **When** the request is processed **Then** at most 5 results are returned **And** `limit` values above 100 are capped at 100

5. **Given** the `offset` query parameter is provided (e.g., `?offset=20`) **When** the request is processed **Then** results skip the first 20 bookmarks

6. **Given** the `sort` query parameter is provided **When** `sort=title` is specified **Then** results are sorted alphabetically by title (ascending) **And** valid sort values are: `created_at`, `updated_at`, `title` (FR6)

7. **Given** an invalid sort parameter value **When** validation runs **Then** a 422 validation error is returned

## Tasks / Subtasks

- [x] Task 1: Add `listBookmarks` to bookmark repository (AC: #3, #4, #5, #6)
  - [x] Implement `listBookmarks(options: { limit, offset, sort })` in `src/db/repositories/bookmark-repository.ts`
  - [x] Query bookmarks with LIMIT/OFFSET, default sort `created_at DESC`
  - [x] Sort mapping: `created_at` → DESC, `updated_at` → DESC, `title` → ASC
  - [x] Return `{ data: Bookmark[], total: number }` using `PaginatedResponse<Bookmark>`
  - [x] Fetch tags for each bookmark in the result set (batch query or per-bookmark)
  - [x] Get total count with separate `SELECT COUNT(*) FROM bookmarks`

- [x] Task 2: Add GET /:id and GET / route handlers (AC: #1, #2, #3, #7)
  - [x] Add `GET /:id` handler in `src/routes/bookmark-routes.ts`
    - Validate `:id` param with `zValidator('param', idParamSchema)`
    - Call existing `getBookmarkById(id)` — already implemented
    - If null, throw `notFound('Bookmark not found')`
    - Return 200 with bookmark object
  - [x] Add `GET /` handler in `src/routes/bookmark-routes.ts`
    - Validate query params with `zValidator('query', paginationSchema)` — schema already exists in `common-schemas.ts`
    - Call `listBookmarks(options)`
    - Return 200 with `{ data, total }`

- [x] Task 3: Write tests (AC: #1-#7)
  - [x] Create test cases in `test/routes/bookmark-routes.test.ts` (add to existing file)
  - [x] GET /:id — 200 with complete bookmark object including tags
  - [x] GET /:id — 404 for non-existent ID
  - [x] GET /:id — 400/422 for non-numeric ID
  - [x] GET / — 200 with `{ data, total }` format
  - [x] GET / — default pagination (limit 20, offset 0)
  - [x] GET / — custom limit (e.g., `?limit=5`)
  - [x] GET / — limit capped at 100
  - [x] GET / — offset skips records
  - [x] GET / — default sort is `created_at` descending (newest first)
  - [x] GET / — sort by `title` (ascending alphabetical)
  - [x] GET / — sort by `updated_at` (descending)
  - [x] GET / — invalid sort value returns 422
  - [x] GET / — empty database returns `{ data: [], total: 0 }`
  - [x] GET / — bookmarks include tags arrays
  - [x] Both endpoints require authentication (401 without key)
  - [x] All existing tests (77) must still pass

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`getBookmarkById(id)` already exists** in `src/db/repositories/bookmark-repository.ts`. It returns a `Bookmark` with tags array or `null` if not found. Use it directly for GET /:id — no new repository code needed for single-bookmark retrieval.

**`paginationSchema` already exists** in `src/schemas/common-schemas.ts`:
- `limit`: coerced number, 1-100, default 20
- `offset`: coerced number, min 0, default 0
- `sort`: optional enum `['created_at', 'updated_at', 'title']`
- Exports `PaginationInput` type

**`idParamSchema` already exists** in `src/schemas/common-schemas.ts` for parsing `:id` path params.

**Error helpers** in `src/middleware/error-middleware.ts`:
- `notFound(message)` → throws 404 with `not_found` code
- `validationErrorToException(zodError)` → handles Zod validation errors

**Types** in `src/types.ts`:
- `Bookmark` interface: `{ id, url, title, description, tags, created_at, updated_at }`
- `PaginatedResponse<T>`: `{ data: T[], total: number }`

### Repository Implementation: `listBookmarks`

Add to `src/db/repositories/bookmark-repository.ts`. Follow the existing `getBookmarkById` pattern:

```typescript
export function listBookmarks(options: {
  limit: number;
  offset: number;
  sort?: string;
}): PaginatedResponse<Bookmark> {
  const db = getDatabase();

  // Sort mapping — created_at and updated_at sort newest first, title sorts A-Z
  const sortColumn = options.sort || 'created_at';
  const sortDirection = sortColumn === 'title' ? 'ASC' : 'DESC';

  // IMPORTANT: sort column is from a validated enum, safe to interpolate
  // (parameterized queries can't bind column names)
  const rows = db.prepare(
    `SELECT id, url, title, description, created_at, updated_at
     FROM bookmarks
     ORDER BY ${sortColumn} ${sortDirection}
     LIMIT ? OFFSET ?`
  ).all(options.limit, options.offset) as BookmarkRow[];

  const total = (db.prepare('SELECT COUNT(*) as count FROM bookmarks').get() as { count: number }).count;

  // Fetch tags for each bookmark
  const bookmarks = rows.map(row => mapBookmarkRow(row, db));

  return { data: bookmarks, total };
}
```

**CRITICAL: Sort column interpolation is safe** because the value comes from Zod enum validation (`['created_at', 'updated_at', 'title']`). SQLite prepared statements cannot parameterize column names or ORDER BY direction. This is the standard pattern — validate the enum, then interpolate.

**Tag fetching for list results**: Use the existing `mapBookmarkRow` helper or the same tag query pattern used in `getBookmarkById`. For each bookmark row, query its tags from the junction table. This is acceptable for the default page size of 20 — individual queries are sub-ms on SQLite.

Alternatively, for efficiency, batch-fetch all tags for the result set:
```sql
SELECT bt.bookmark_id, t.name
FROM bookmark_tags bt
JOIN tags t ON t.id = bt.tag_id
WHERE bt.bookmark_id IN (?, ?, ...)
ORDER BY t.name;
```
Then group by bookmark_id in application code. Either approach is fine for 10K bookmarks (NFR1).

### Route Handler Pattern

Add to the existing `createBookmarkRoutes()` in `src/routes/bookmark-routes.ts`:

```typescript
import { idParamSchema, paginationSchema } from '../schemas/common-schemas.js';
import { notFound } from '../middleware/error-middleware.js';
import { getBookmarkById, listBookmarks } from '../db/repositories/bookmark-repository.js';

// GET /:id — single bookmark
app.get(
  '/:id',
  zValidator('param', idParamSchema),
  (c) => {
    const { id } = c.req.valid('param');
    const bookmark = getBookmarkById(id);
    if (!bookmark) {
      throw notFound('Bookmark not found');
    }
    return c.json(bookmark);
  }
);

// GET / — list bookmarks with pagination
app.get(
  '/',
  zValidator('query', paginationSchema, (result, c) => {
    if (!result.success) {
      throw validationErrorToException(result.error);
    }
  }),
  (c) => {
    const options = c.req.valid('query');
    const result = listBookmarks(options);
    return c.json(result);
  }
);
```

**Route order matters in Hono**: Define `GET /` before `GET /:id` OR ensure the route matching works correctly. Hono's router should handle this — `/:id` only matches when a segment is present. But verify in tests.

### Response Shapes

**Single bookmark (GET /:id):**
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

**List response (GET /):**
```json
{
  "data": [
    { "id": 1, "url": "...", "title": "...", "description": null, "tags": [], "created_at": "...", "updated_at": "..." }
  ],
  "total": 42
}
```

### Test Pattern (Follow Existing)

Tests go in the **existing** `test/routes/bookmark-routes.test.ts` file. Follow the established pattern:

```typescript
// Auth setup — already in beforeEach:
// manager = createInMemoryManager(); setDatabaseManager(manager);
// setApiKeyHash(createHash('sha256').update(API_KEY).digest('hex'));

// Helper for creating test bookmarks — insert directly via db.prepare() or POST
function createTestBookmark(url: string, title: string, tags: string[] = []) {
  // Use app.request to POST /api/bookmarks with auth header
  // OR insert directly via db.prepare for faster setup
}

describe('GET /api/bookmarks/:id', () => {
  it('returns 200 with complete bookmark object', async () => {
    // Create a bookmark first, then GET it by ID
  });

  it('returns 404 for non-existent ID', async () => {
    const res = await app.request('/api/bookmarks/999', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });
});

describe('GET /api/bookmarks', () => {
  it('returns paginated list with { data, total } format', async () => {
    // Create multiple bookmarks, then GET /api/bookmarks
  });
});
```

**Auth in tests**: The existing test file uses a constant `API_KEY` and sets the hash in `beforeEach` via `setApiKeyHash()`. Add `Authorization: Bearer ${API_KEY}` header to all requests. Check `test/routes/bookmark-routes.test.ts` for the exact pattern.

### Project Structure Notes

- **Modified**: `src/db/repositories/bookmark-repository.ts` — add `listBookmarks()` function
- **Modified**: `src/routes/bookmark-routes.ts` — add GET / and GET /:id handlers
- **Modified**: `test/routes/bookmark-routes.test.ts` — add new test cases to existing file
- No new files needed — all schemas, types, and helpers already exist
- **Do NOT create** new schema files — `paginationSchema` and `idParamSchema` are already in `common-schemas.ts`

### References

- [Source: epics.md#Story 2.2] — acceptance criteria and FR mappings (FR2, FR3, FR6)
- [Source: architecture.md#API & Communication Patterns] — pagination pattern (offset-based, limit/offset, default 20, max 100)
- [Source: architecture.md#Data Architecture] — parameterized queries, synchronous API
- [Source: architecture.md#Implementation Patterns] — naming conventions, anti-patterns
- [Source: architecture.md#Project Structure] — file locations, route → repository boundary
- [Source: common-schemas.ts] — paginationSchema, idParamSchema already defined
- [Source: bookmark-repository.ts] — getBookmarkById already implemented, mapBookmarkRow helper available
- [Source: story 2-1] — POST bookmark handler pattern, test setup pattern, auth in tests

## Dev Agent Record

### Agent Model Used

GPT-5.4

### Debug Log References

- `npm run build && npm test`

### Completion Notes List

- Added `listBookmarks` pagination + sort + total-count repository flow with tag hydration.
- Added authenticated `GET /api/bookmarks` and `GET /api/bookmarks/:id` handlers using existing schemas.
- Updated `paginationSchema` to cap `limit` at 100 per AC #4 while preserving invalid-sort validation.
- Added 14 route/schema tests for list/get flows; full suite green at 91/91.

### File List

- `src/db/repositories/bookmark-repository.ts` — added `listBookmarks()` for paginated bookmark retrieval with batch tag loading.
- `src/routes/bookmark-routes.ts` — added authenticated `GET /` and `GET /:id` handlers.
- `src/schemas/common-schemas.ts` — capped `limit` to 100 via schema transform.
- `test/routes/bookmark-routes.test.ts` — added GET route coverage for AC #1-#7, boundary validation tests.
- `test/schemas/common-schemas.test.ts` — updated limit-cap schema coverage.

## Senior Developer Review (AI)

**Reviewer:** User on 2026-03-20
**Outcome:** Approved with fixes applied

### Issues Found & Fixed
- **H1 (Fixed):** N+1 tag query in `listBookmarks` replaced with batch `IN()` query — reduced from N+1 to 3 queries per request.
- **H2 (Fixed):** SQL string interpolation replaced with `SORT_CLAUSES` whitelist map — eliminates architecture anti-pattern violation.
- **M1 (Fixed):** Slow limit-cap test (105 sequential POST requests) replaced with direct DB inserts.
- **M2 (Fixed):** Added boundary validation tests for `limit=0` and `offset=-1`.
- **M3 (Resolved):** Prepared statement recreation eliminated by H1 batch fix.
- **L1 (Deferred):** Missing Content-Type assertions in GET tests.
- **L2 (Deferred):** Redundant `as ZodError` casts in bookmark-routes.ts.

### Test Results
93/93 tests passing (91 previous + 2 new boundary tests).

## Change Log

- 2026-03-20 — Implemented Story 2.2 GET/list bookmark retrieval, pagination capping, and regression coverage; story moved to review.
- 2026-03-20 — Code review: Fixed N+1 query, SQL interpolation anti-pattern, slow test, added boundary tests; story moved to done.
