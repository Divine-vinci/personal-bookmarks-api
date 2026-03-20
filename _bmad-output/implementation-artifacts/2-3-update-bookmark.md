# Story 2.3: Update Bookmark

Status: ready-for-dev

## Story

As a developer,
I want to update all fields of an existing bookmark (full replace),
So that I can correct or modify saved bookmarks.

## Acceptance Criteria

1. **Given** a bookmark exists with a known ID **When** PUT `/api/bookmarks/:id` is called with a valid JSON body (url, title, description, tags) **Then** all bookmark fields are replaced with the new values (FR4) **And** the `updated_at` timestamp is set to the current time **And** the `created_at` timestamp is not modified **And** a 200 response is returned with the updated bookmark object

2. **Given** a bookmark is updated with new tags **When** the previous tags are `["rust", "async"]` and the new tags are `["rust", "tokio"]` **Then** the `async` tag association is removed, the `tokio` tag is created if needed, and the new associations are set (FR11)

3. **Given** a bookmark is updated with an empty tags array **When** the update is processed **Then** all tag associations are removed from the bookmark

4. **Given** a bookmark is updated with a URL that belongs to a different existing bookmark **When** the update is processed **Then** a 409 response with code `duplicate_url` is returned

5. **Given** a bookmark ID that does not exist **When** PUT `/api/bookmarks/:id` is called **Then** a 404 response with code `not_found` is returned

## Tasks / Subtasks

- [ ] Task 1: Add `updateBookmark` to bookmark repository (AC: #1, #2, #3, #4, #5)
  - [ ] Implement `updateBookmark(id: number, input: UpdateBookmarkInput): Bookmark` in `src/db/repositories/bookmark-repository.ts`
  - [ ] Check bookmark exists first — throw `notFound()` if not
  - [ ] UPDATE bookmarks SET url, title, description, updated_at WHERE id = ?
  - [ ] DELETE all existing bookmark_tags for this bookmark_id
  - [ ] Re-insert tags using same upsert pattern as `createBookmark`
  - [ ] Wrap in transaction (same pattern as `createBookmark`)
  - [ ] Catch UNIQUE constraint on url → throw `conflict()` (same as create)
  - [ ] Return updated bookmark via `getBookmarkById(id)`

- [ ] Task 2: Add PUT /:id route handler (AC: #1, #4, #5)
  - [ ] Add `PUT /:id` handler in `src/routes/bookmark-routes.ts`
  - [ ] Validate `:id` param with `zValidator('param', idParamSchema)`
  - [ ] Validate body with `zValidator('json', updateBookmarkSchema)`
  - [ ] Call `updateBookmark(id, input)`
  - [ ] Return 200 with updated bookmark object

- [ ] Task 3: Write tests (AC: #1-#5)
  - [ ] Add test cases to existing `test/routes/bookmark-routes.test.ts`
  - [ ] PUT /:id — 200 with fully updated bookmark object
  - [ ] PUT /:id — updated_at changes, created_at preserved
  - [ ] PUT /:id — tag reassignment (old removed, new added, shared kept)
  - [ ] PUT /:id — empty tags array removes all tag associations
  - [ ] PUT /:id — URL changed to unused URL succeeds
  - [ ] PUT /:id — URL changed to another bookmark's URL returns 409 `duplicate_url`
  - [ ] PUT /:id — same URL (unchanged) succeeds (no self-conflict)
  - [ ] PUT /:id — non-existent ID returns 404 `not_found`
  - [ ] PUT /:id — missing required fields returns 422 validation error
  - [ ] PUT /:id — invalid URL returns 400 `invalid_url`
  - [ ] PUT /:id — 401 without auth
  - [ ] All existing tests must still pass

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`updateBookmarkSchema` already exists** in `src/schemas/bookmark-schemas.ts`:
- Same fields as `createBookmarkSchema`: url (required, valid URL, max 2000), title (required, max 500), description (optional, max 2000, nullable), tags (optional array, auto-trimmed/lowercased)
- Exports `UpdateBookmarkInput` type

**`idParamSchema` already exists** in `src/schemas/common-schemas.ts` for parsing `:id` path params.

**`getBookmarkById(id)` already exists** in `src/db/repositories/bookmark-repository.ts` — returns `Bookmark` with tags array. Use it to return the updated bookmark after the UPDATE.

**Error helpers** in `src/middleware/error-middleware.ts`:
- `notFound(message)` — 404 with `not_found` code
- `conflict(message)` — 409 with `duplicate_url` code
- `validationErrorToException(zodError)` — converts Zod errors to 422

**Transaction pattern** from `createBookmark` — follow the same `db.transaction()` pattern for atomicity.

**Tag upsert pattern** from `createBookmark` — `INSERT OR IGNORE INTO tags (name) VALUES (?)`, then `SELECT id FROM tags WHERE name = ?`, then `INSERT INTO bookmark_tags`.

**`isDuplicateUrlError(err)`** utility in bookmark-repository.ts — detects `SQLITE_CONSTRAINT_UNIQUE` errors for URL duplication. Reuse this.

### Repository Implementation: `updateBookmark`

Add to `src/db/repositories/bookmark-repository.ts`. Follow the `createBookmark` transaction pattern:

```typescript
export function updateBookmark(id: number, input: UpdateBookmarkInput): Bookmark {
  const db = getDatabase();

  const updateTx = db.transaction(() => {
    // 1. Check bookmark exists
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(id);
    if (!existing) {
      throw notFound('Bookmark not found');
    }

    // 2. UPDATE bookmark fields — created_at is NOT updated
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE bookmarks SET url = ?, title = ?, description = ?, updated_at = ? WHERE id = ?`
    ).run(input.url, input.title, input.description ?? null, now, id);

    // 3. Replace tag associations: delete all existing, re-insert new
    db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?').run(id);

    // 4. Upsert tags (same pattern as createBookmark)
    const tags = Array.from(new Set(input.tags ?? []));
    for (const tagName of tags) {
      db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tagName);
      const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: number };
      db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)').run(id, tag.id);
    }
  });

  try {
    updateTx();
  } catch (err: unknown) {
    if (isDuplicateUrlError(err)) {
      throw conflict('A bookmark with this URL already exists');
    }
    throw err;
  }

  return getBookmarkById(id);
}
```

**CRITICAL: Self-URL conflict handling** — When a bookmark is updated with the same URL it already has, there's no UNIQUE violation because the UPDATE is on the same row. SQLite's UNIQUE constraint only fires if a *different* row has that URL. No special handling needed.

**CRITICAL: `created_at` must NOT change** — The UPDATE statement must not include `created_at` in the SET clause. Only `updated_at` is set to `new Date().toISOString()`.

**CRITICAL: Delete-then-reinsert for tags** — Simpler and correct for full-replace semantics. Don't try to diff old vs new tags. Delete all `bookmark_tags` rows for this bookmark, then insert fresh associations. Orphaned tags in the `tags` table are fine — cleanup is Epic 3 (FR14).

### Route Handler Pattern

Add to the existing `createBookmarkRoutes()` in `src/routes/bookmark-routes.ts`:

```typescript
import { idParamSchema } from '../schemas/common-schemas.js';
import { updateBookmarkSchema } from '../schemas/bookmark-schemas.js';
import { updateBookmark } from '../db/repositories/bookmark-repository.js';

// PUT /:id — update bookmark (full replace)
app.put(
  '/:id',
  zValidator('param', idParamSchema),
  zValidator('json', updateBookmarkSchema, (result, c) => {
    if (!result.success) {
      throw validationErrorToException(result.error);
    }
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const bookmark = updateBookmark(id, input);
    return c.json(bookmark);
  }
);
```

**Note:** 200 is Hono's default status for `c.json()`, no need to pass status code explicitly (unlike create which uses 201).

### Response Shape

Same as all other bookmark endpoints:
```json
{
  "id": 1,
  "url": "https://updated-example.com",
  "title": "Updated Title",
  "description": "Updated description",
  "tags": ["rust", "tokio"],
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-20T14:30:00.000Z"
}
```

### Test Pattern (Follow Existing)

Add to `test/routes/bookmark-routes.test.ts`. Use the established test pattern:

```typescript
describe('PUT /api/bookmarks/:id', () => {
  it('updates all fields and returns 200', async () => {
    // 1. Create a bookmark first via POST
    const createRes = await app.request('/api/bookmarks', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', title: 'Original', tags: ['old'] }),
    });
    const created = await createRes.json();

    // 2. Update it via PUT
    const updateRes = await app.request(`/api/bookmarks/${created.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://updated.com', title: 'Updated', tags: ['new'] }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.url).toBe('https://updated.com');
    expect(updated.title).toBe('Updated');
    expect(updated.tags).toEqual(['new']);
    expect(updated.created_at).toBe(created.created_at); // Unchanged
    expect(updated.updated_at).not.toBe(created.updated_at); // Changed
  });

  it('returns 404 for non-existent ID', async () => {
    const res = await app.request('/api/bookmarks/999', {
      method: 'PUT',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://x.com', title: 'X' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });
});
```

**Auth in tests**: Use the same `API_KEY` constant and `Bearer ${API_KEY}` header pattern from the existing POST tests in the same file.

**Timestamp test timing**: `created_at` and `updated_at` should differ after an update. Create a bookmark, then update it — `updated_at` will be a later ISO string while `created_at` stays the same. No need for `setTimeout` — the timestamps will naturally differ even within the same test if using `new Date().toISOString()` at each call.

### Previous Story Learnings (from 2-1 code review)

1. **Type casts**: Use proper types, not `as never` — the code review caught this in 2-1. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases. The code review added 3 missing tests to 2-1.
3. **Zod validator hook**: Use the same `(result, c) => { if (!result.success) throw validationErrorToException(result.error); }` pattern for consistent error formatting.

### Project Structure Notes

- **Modified**: `src/db/repositories/bookmark-repository.ts` — add `updateBookmark()` function
- **Modified**: `src/routes/bookmark-routes.ts` — add PUT /:id handler
- **Modified**: `test/routes/bookmark-routes.test.ts` — add new test cases to existing file
- No new files needed — all schemas, types, and helpers already exist
- **Do NOT create** new schema files — `updateBookmarkSchema` already exists in `bookmark-schemas.ts`

### References

- [Source: epics.md#Story 2.3] — acceptance criteria and FR mappings (FR4, FR11)
- [Source: architecture.md#API & Communication Patterns] — response format, error handling, REST patterns
- [Source: architecture.md#Data Architecture] — parameterized queries, transactions, tag handling
- [Source: architecture.md#Implementation Patterns] — naming conventions, anti-patterns
- [Source: architecture.md#Architectural Boundaries] — route → repository separation
- [Source: bookmark-schemas.ts] — updateBookmarkSchema, UpdateBookmarkInput already defined
- [Source: common-schemas.ts] — idParamSchema already defined
- [Source: bookmark-repository.ts] — createBookmark transaction pattern, isDuplicateUrlError, getBookmarkById
- [Source: story 2-1] — createBookmark pattern, tag upsert, duplicate URL handling, test patterns, code review learnings

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
