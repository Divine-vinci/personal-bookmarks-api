# Story 2.4: Delete Bookmark

Status: code-review-complete

## Story

As a developer,
I want to delete a bookmark by its ID,
So that I can remove links I no longer need.

## Acceptance Criteria

1. **Given** a bookmark exists with a known ID **When** DELETE `/api/bookmarks/:id` is called **Then** the bookmark is removed from the database (FR5) **And** all tag associations for that bookmark are removed from bookmark_tags **And** a 204 No Content response is returned

2. **Given** a bookmark ID that does not exist **When** DELETE `/api/bookmarks/:id` is called **Then** a 404 response with code `not_found` is returned

3. **Given** a bookmark is deleted and it was the only bookmark with a specific tag **When** the deletion is complete **Then** the orphaned tag remains in the tags table (cleanup is handled in Epic 3, FR14)

## Tasks / Subtasks

- [ ] Task 1: Add `deleteBookmark` to bookmark repository (AC: #1, #2, #3)
  - [ ] Implement `deleteBookmark(id: number): void` in `src/db/repositories/bookmark-repository.ts`
  - [ ] Check bookmark exists first — throw `notFound()` if not
  - [ ] DELETE FROM bookmark_tags WHERE bookmark_id = ?
  - [ ] DELETE FROM bookmarks WHERE id = ?
  - [ ] Wrap in transaction for atomicity
  - [ ] Do NOT clean up orphaned tags — that's Epic 3

- [ ] Task 2: Add DELETE /:id route handler (AC: #1, #2)
  - [ ] Add `DELETE /:id` handler in `src/routes/bookmark-routes.ts`
  - [ ] Validate `:id` param with `zValidator('param', idParamSchema)`
  - [ ] Call `deleteBookmark(id)`
  - [ ] Return 204 with no body

- [ ] Task 3: Write tests (AC: #1-#3)
  - [ ] Add test cases to existing `test/routes/bookmark-routes.test.ts`
  - [ ] DELETE /:id — 204 with no body for existing bookmark
  - [ ] DELETE /:id — bookmark no longer retrievable after deletion
  - [ ] DELETE /:id — tag associations removed (verify via direct DB query)
  - [ ] DELETE /:id — orphaned tags remain in tags table
  - [ ] DELETE /:id — non-existent ID returns 404 `not_found`
  - [ ] DELETE /:id — invalid ID format returns 422 validation error
  - [ ] DELETE /:id — 401 without auth
  - [ ] All existing tests must still pass

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`idParamSchema` already exists** in `src/schemas/common-schemas.ts` for parsing `:id` path params.

**`getBookmarkById(id)` already exists** in `src/db/repositories/bookmark-repository.ts` — use it to check existence before delete.

**Error helpers** in `src/middleware/error-middleware.ts`:
- `notFound(message)` — 404 with `not_found` code

**Transaction pattern** from `createBookmark` and `updateBookmark` — follow the same `db.transaction()` pattern for atomicity.

**Test helpers** in `test/routes/bookmark-routes.test.ts`:
- `authorizedJsonRequest(app, body)` — POST with auth
- `authorizedGetRequest(app, path)` — GET with auth
- You'll need a new helper or inline: authorized DELETE request with `Bearer ${API_KEY}` header

### Repository Implementation: `deleteBookmark`

Add to `src/db/repositories/bookmark-repository.ts`:

```typescript
export function deleteBookmark(id: number): void {
  const db = getDatabase();

  const deleteTx = db.transaction(() => {
    // 1. Check bookmark exists
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(id);
    if (!existing) {
      throw notFound('Bookmark not found');
    }

    // 2. Delete tag associations first (foreign key dependency)
    db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?').run(id);

    // 3. Delete the bookmark
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  });

  deleteTx();
}
```

**CRITICAL: Delete order matters** — Delete `bookmark_tags` rows BEFORE deleting the `bookmarks` row. Even though SQLite may not enforce FK constraints by default, follow correct relational order.

**CRITICAL: Do NOT delete orphaned tags** — The `tags` table entries should remain even if no bookmarks reference them. Orphaned tag cleanup is Epic 3 Story 3.3 (FR14). Do not add tag cleanup logic here.

**CRITICAL: No try/catch needed** — Unlike create/update, there are no UNIQUE constraint violations to catch. The transaction throws only if the bookmark doesn't exist (which we check explicitly).

### Route Handler Pattern

Add to the existing `createBookmarkRoutes()` in `src/routes/bookmark-routes.ts`:

```typescript
// DELETE /:id — delete bookmark
app.delete(
  '/:id',
  zValidator('param', idParamSchema),
  (c) => {
    const { id } = c.req.valid('param');
    deleteBookmark(id);
    return c.body(null, 204);
  }
);
```

**CRITICAL: Return 204 No Content** — Use `c.body(null, 204)` not `c.json()`. A 204 response MUST NOT include a body. Do NOT use `c.json({}, 204)` or `c.json(null, 204)`.

**Import required**: Add `deleteBookmark` to the import from `bookmark-repository.js`.

### Test Pattern (Follow Existing)

Add to `test/routes/bookmark-routes.test.ts`. Use the established test pattern:

```typescript
describe('DELETE /api/bookmarks/:id', () => {
  it('deletes bookmark and returns 204', async () => {
    // 1. Create a bookmark first via POST
    const createRes = await authorizedJsonRequest(app, {
      url: 'https://example.com',
      title: 'To Delete',
      tags: ['temp'],
    });
    const created = (await createRes.json()) as { id: number };

    // 2. Delete it
    const deleteRes = await app.request(`/api/bookmarks/${created.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(deleteRes.status).toBe(204);
    expect(await deleteRes.text()).toBe('');

    // 3. Verify it's gone
    const getRes = await authorizedGetRequest(app, `/api/bookmarks/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for non-existent ID', async () => {
    const res = await app.request('/api/bookmarks/999', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('returns 401 without auth', async () => {
    const res = await app.request('/api/bookmarks/1', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });
});
```

**Auth in tests**: Use `Bearer ${API_KEY}` header directly (no `authorizedJsonRequest` since DELETE has no body).

**Verify tag associations removed**: Query `bookmark_tags` table directly via `getDatabase().prepare('SELECT * FROM bookmark_tags WHERE bookmark_id = ?').all(id)` and assert empty result.

**Verify orphaned tags remain**: After deleting the only bookmark with a tag, query `tags` table directly to confirm the tag row still exists.

### Response Shape

204 No Content — empty body. No JSON response on success.

Error responses follow the standard format:
```json
{
  "error": {
    "code": "not_found",
    "message": "Bookmark not found"
  }
}
```

### Previous Story Learnings (from 2-1, 2-2, 2-3 code reviews)

1. **Type casts**: Use proper types, not `as never`. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases.
3. **Zod validator hook**: Use the same validation hook pattern for consistent error formatting (though DELETE has no body, the `idParamSchema` validation still applies).
4. **Response body verification**: For 204, verify the body is empty — `await deleteRes.text()` should be `''`.

### Project Structure Notes

- **Modified**: `src/db/repositories/bookmark-repository.ts` — add `deleteBookmark()` function
- **Modified**: `src/routes/bookmark-routes.ts` — add DELETE /:id handler, add `deleteBookmark` import
- **Modified**: `test/routes/bookmark-routes.test.ts` — add new test cases to existing file
- No new files needed — all schemas, types, and helpers already exist
- **Do NOT create** new schema files or utility files

### References

- [Source: epics.md#Story 2.4] — acceptance criteria and FR mappings (FR5)
- [Source: architecture.md#API & Communication Patterns] — response format, error handling, REST patterns
- [Source: architecture.md#Data Architecture] — parameterized queries, transactions
- [Source: architecture.md#Architectural Boundaries] — route → repository separation
- [Source: common-schemas.ts] — idParamSchema already defined
- [Source: bookmark-repository.ts] — getBookmarkById, createBookmark transaction pattern
- [Source: story 2-1, 2-2, 2-3] — established patterns, code review learnings

## Dev Agent Record

### Agent Model Used
claude-opus-4-6

### Debug Log References
None — no issues found during review.

### Completion Notes List
- Code review passed with no critical/high/medium issues
- All 110 tests pass (13 test files)
- Implementation matches all ACs and follows established patterns from Stories 2.1–2.3
- Transaction ordering correct (bookmark_tags deleted before bookmarks)
- Orphaned tags correctly preserved per Epic 3 boundary
- Test coverage: 204 success, post-delete 404, tag association removal, orphaned tag retention, 404 not_found, 422 validation, 401 auth

### File List
- `src/db/repositories/bookmark-repository.ts` — `deleteBookmark()` function (lines 176-194)
- `src/routes/bookmark-routes.ts` — DELETE /:id handler (lines 58-71)
- `test/routes/bookmark-routes.test.ts` — 5 delete test cases (lines 958-1032)
