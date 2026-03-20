# Story 4.1: Import Netscape HTML Bookmarks

Status: ready-for-dev

## Story

As a developer,
I want to import my browser bookmarks from an HTML export file,
So that I can migrate my existing bookmarks into the API without manual entry.

## Acceptance Criteria

1. **Given** an authenticated request with a Netscape HTML bookmark file **When** POST `/api/import` is called with `multipart/form-data` containing the file (FR19) **Then** the file is parsed and bookmarks are extracted with URL, title, and folder hierarchy

2. **Given** the HTML file contains bookmark folders (e.g., `Programming > Rust`) **When** the import processes them **Then** folder hierarchy is mapped to tags (e.g., tags: `["programming", "rust"]`) (FR20)

3. **Given** an import file with 1,000 bookmarks **When** the import completes **Then** a response is returned with `{ "imported": N, "failed": M, "errors": [...] }` (FR21) **And** the import completes in under 30 seconds (NFR3)

4. **Given** some bookmarks in the file have invalid URLs or missing titles **When** the import processes them **Then** valid bookmarks are imported and invalid ones are reported in the errors array **And** existing bookmarks in the database are not affected by any import failures (NFR14 — atomic operation)

5. **Given** the import file contains bookmarks with URLs that already exist in the database **When** the import processes them **Then** duplicate URLs are skipped and reported in the failed count

6. **Given** the import endpoint **When** the request body size exceeds 10MB **Then** a 400 error is returned (import has a higher size limit than standard endpoints)

7. **Given** a Chrome, Firefox, or Safari HTML bookmark export **When** the file is imported **Then** bookmarks are extracted correctly from each browser's export format

## Tasks / Subtasks

- [ ] Task 1: Install `node-html-parser` dependency
  - [ ] Run `npm install node-html-parser`

- [ ] Task 2: Add `ImportResult` type to `src/types.ts` (AC: #3)
  - [ ] Add `ImportResult` interface: `{ imported: number; failed: number; errors: string[] }`

- [ ] Task 3: Create `src/services/import-service.ts` — HTML parser + import logic (AC: #1, #2, #4, #5, #7)
  - [ ] Implement `parseNetscapeHtml(html: string)` to extract bookmarks with folder-to-tag mapping
  - [ ] Implement `importBookmarks(parsed: ParsedBookmark[])` to bulk-insert with duplicate/validation handling
  - [ ] Handle Chrome, Firefox, Safari export formats

- [ ] Task 4: Create `src/routes/import-routes.ts` — POST `/` handler (AC: #1, #3, #6)
  - [ ] Accept `multipart/form-data` with file field
  - [ ] Apply 10MB body limit (overrides the global 1MB limit)
  - [ ] Return `{ imported, failed, errors }` response

- [ ] Task 5: Register import routes in `app.ts` (AC: #1)
  - [ ] Import `createImportRoutes` and mount at `/api/import`

- [ ] Task 6: Write tests (AC: #1-#7)
  - [ ] Parse Chrome bookmark HTML with nested folders
  - [ ] Parse Firefox bookmark HTML
  - [ ] Parse Safari bookmark HTML
  - [ ] Folder hierarchy maps to tags correctly
  - [ ] Invalid URLs reported in errors, valid ones imported
  - [ ] Missing titles use URL as fallback
  - [ ] Duplicate URLs skipped and counted in failed
  - [ ] Empty file returns `{ imported: 0, failed: 0, errors: [] }`
  - [ ] File exceeding 10MB rejected
  - [ ] Auth required (401 without API key)
  - [ ] Atomic: existing bookmarks not affected on partial failure

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`ImportResult` type** — does NOT exist yet. Must be added to `src/types.ts`.

**`Bookmark`, `Tag`, `PaginatedResponse`** in `src/types.ts` — existing types. Reuse `Bookmark` for type context.

**`getDatabase()` and `SqliteDatabase`** from `src/db/database.ts` — same DB access pattern as bookmark-repository.

**`createBookmark` in `bookmark-repository.ts`** — DO NOT reuse directly for bulk import. It calls `getBookmarkById` after every insert (extra query per bookmark). Instead, write a bulk import transaction in the import service that uses the same SQL patterns (INSERT OR IGNORE for tags, parameterized queries) but skips per-row re-fetch.

**Error helpers** in `src/middleware/error-middleware.ts` — `invalidRequest()` for bad file/missing file.

**`app.ts` route registration** — follow the pattern: `app.route('/api/import', createImportRoutes())`.

**`bodyLimit` middleware** — the global 1MB limit is applied at the app level (`app.use('*', bodyLimit(...))`). The import route needs a route-level 10MB override.

**Test helpers pattern** — each test file defines its own helper functions (not imported from other test files). Follow the pattern in `test/routes/bookmark-routes.test.ts`.

### Task 1: Install HTML Parser

Use `node-html-parser` — it's lightweight (~50KB), fast, has zero dependencies, and handles the Netscape bookmark format well. No need for heavier options like cheerio or htmlparser2.

```bash
npm install node-html-parser
```

No `@types` package needed — `node-html-parser` ships its own TypeScript types.

### Task 2: Add ImportResult Type

Add to `src/types.ts`:

```typescript
export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}
```

### Task 3: Import Service Implementation

Create `src/services/import-service.ts`:

**Netscape Bookmark Format Overview:**

All major browsers (Chrome, Firefox, Safari) export bookmarks in the Netscape Bookmark File Format. The structure is:

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Folder Name</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1234567890">Title</A>
    </DL><p>
</DL><p>
```

Key parsing rules:
- `<DT><A HREF="...">` elements are bookmarks
- `<DT><H3>` elements are folders — the text content is the folder name
- Nested `<DL>` elements represent folder hierarchy
- Folder hierarchy becomes tags: `Bookmarks Bar > Programming > Rust` → `["programming", "rust"]`
- Top-level browser-specific folders (Bookmarks Bar, Bookmarks Menu, Other Bookmarks, Favourites, etc.) should be **skipped** — they are browser chrome, not user-created folders
- Tags should be lowercased and trimmed (same normalization as `createBookmark`)

**Browser-specific quirks:**
- **Chrome**: Uses `<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>` for the bookmarks bar
- **Firefox**: Uses `<DT><H3>Bookmarks Menu</H3>` and `<DT><H3>Other Bookmarks</H3>` as top-level folders
- **Safari**: Uses `<DT><H3>Favourites</H3>` and `<DT><H3>Reading List</H3>` as top-level folders
- All three use the same `<A HREF="...">Title</A>` format for bookmark entries

**Implementation approach:**

```typescript
import { parse as parseHtml } from 'node-html-parser';

import type { ImportResult } from '../types.js';
import { getDatabase, type SqliteDatabase } from '../db/database.js';

interface ParsedBookmark {
  url: string;
  title: string;
  tags: string[];
}

// Top-level browser folders to skip (not user-created)
const BROWSER_ROOT_FOLDERS = new Set([
  'bookmarks bar',
  'bookmarks menu',
  'other bookmarks',
  'favourites',
  'favorites',
  'reading list',
  'mobile bookmarks',
  'bookmarks toolbar',
  'toolbar',
]);

const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const parseNetscapeHtml = (html: string): ParsedBookmark[] => {
  const root = parseHtml(html);
  const bookmarks: ParsedBookmark[] = [];

  const walk = (node: ReturnType<typeof parseHtml>, folderStack: string[]) => {
    for (const child of node.childNodes) {
      // Type guard for element nodes
      if (!('tagName' in child)) continue;
      const el = child as ReturnType<typeof parseHtml>;

      if (el.tagName === 'DT') {
        // Check for folder (<H3>) or bookmark (<A>)
        const h3 = el.querySelector('H3');
        const a = el.querySelector('A');

        if (h3) {
          const folderName = h3.textContent.trim().toLowerCase();
          const isRootBrowserFolder = folderStack.length === 0 && BROWSER_ROOT_FOLDERS.has(folderName);
          const newStack = isRootBrowserFolder ? [] : [...folderStack, folderName];

          // Process the nested <DL> inside this <DT>
          const dl = el.querySelector('DL');
          if (dl) {
            walk(dl, newStack);
          }
        } else if (a) {
          const url = a.getAttribute('HREF') ?? '';
          const title = a.textContent.trim() || url;

          bookmarks.push({
            url,
            title: title.slice(0, 500),  // Match max title length
            tags: [...folderStack],
          });
        }
      } else if (el.tagName === 'DL') {
        walk(el, folderStack);
      }
    }
  };

  // Start from the root, looking for the top-level <DL>
  const topDl = root.querySelector('DL');
  if (topDl) {
    walk(topDl, []);
  }

  return bookmarks;
};

export const importBookmarks = (parsed: ParsedBookmark[]): ImportResult => {
  const db = getDatabase();
  const errors: string[] = [];
  let imported = 0;
  let failed = 0;

  // Validate all bookmarks first, separate valid from invalid
  const validBookmarks: ParsedBookmark[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const bookmark = parsed[i];

    if (!bookmark.url || !isValidUrl(bookmark.url)) {
      failed++;
      errors.push(`Entry ${i + 1}: invalid URL "${bookmark.url || '(empty)'}"`);
      continue;
    }

    if (bookmark.url.length > 2000) {
      failed++;
      errors.push(`Entry ${i + 1}: URL exceeds 2000 characters`);
      continue;
    }

    validBookmarks.push(bookmark);
  }

  // Bulk insert in a single transaction (NFR14 — atomic)
  const insertBookmark = db.prepare(
    `INSERT INTO bookmarks (url, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const selectTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insertBookmarkTag = db.prepare(
    'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)',
  );
  const checkDuplicate = db.prepare('SELECT id FROM bookmarks WHERE url = ?');

  const importTx = db.transaction((bookmarks: ParsedBookmark[]) => {
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];

      // Check for duplicate URL
      const existing = checkDuplicate.get(bookmark.url) as { id: number } | undefined;
      if (existing) {
        failed++;
        errors.push(`Entry: duplicate URL "${bookmark.url}"`);
        continue;
      }

      const now = new Date().toISOString();
      const result = insertBookmark.run(
        bookmark.url,
        bookmark.title,
        null,    // description — HTML bookmarks don't have descriptions
        now,
        now,
      );
      const bookmarkId = Number(result.lastInsertRowid);

      // Insert tags (normalized — already lowercased from parser)
      const uniqueTags = Array.from(new Set(bookmark.tags));
      for (const tagName of uniqueTags) {
        insertTag.run(tagName);
        const tagRow = selectTag.get(tagName) as { id: number } | undefined;
        if (tagRow) {
          insertBookmarkTag.run(bookmarkId, tagRow.id);
        }
      }

      imported++;
    }
  });

  importTx(validBookmarks);

  return { imported, failed, errors };
};
```

**Key design decisions:**

1. **Atomic transaction**: All valid bookmarks are inserted in a single transaction. If anything goes wrong with the database, the entire batch rolls back (NFR14). Validation errors (invalid URLs) are collected before the transaction so they don't trigger a rollback.

2. **Duplicate handling inside transaction**: We check for existing URLs inside the transaction rather than before it — this is important because the import file itself could contain duplicate URLs.

3. **Folder-to-tag mapping**: Folder names are lowercased during parsing (same normalization as `createBookmark`). Browser root folders (Bookmarks Bar, etc.) are skipped since they're browser UI, not user-created categories.

4. **Title fallback**: If a bookmark `<A>` has empty text content, the URL is used as the title.

5. **No per-bookmark re-fetch**: Unlike `createBookmark`, the import doesn't call `getBookmarkById` after each insert. This is a bulk operation — we return the count, not the bookmark objects.

6. **Parser choice**: `node-html-parser` is fast, lightweight, and handles the loose HTML in bookmark exports well. It doesn't need a full DOM — just element traversal and attribute access.

### Task 4: Import Routes Implementation

Create `src/routes/import-routes.ts`:

```typescript
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { invalidRequest } from '../middleware/error-middleware.js';
import { importBookmarks, parseNetscapeHtml } from '../services/import-service.js';

export const createImportRoutes = () => {
  const app = new Hono();

  // Override global 1MB limit with 10MB for import
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));

  app.post('/', async (c) => {
    const contentType = c.req.header('content-type') ?? '';

    if (!contentType.includes('multipart/form-data')) {
      throw invalidRequest('Content-Type must be multipart/form-data');
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      throw invalidRequest('Missing required file field "file"');
    }

    const html = await file.text();

    if (!html.trim()) {
      return c.json({ imported: 0, failed: 0, errors: [] }, 200);
    }

    const parsed = parseNetscapeHtml(html);

    if (parsed.length === 0) {
      return c.json({ imported: 0, failed: 0, errors: [] }, 200);
    }

    const result = importBookmarks(parsed);
    return c.json(result, 200);
  });

  return app;
};
```

**Key design decisions:**

1. **Route-level body limit override**: The `bodyLimit` middleware on the import route overrides the global 1MB limit. Hono applies middleware in order — route-level middleware runs after the global middleware but the route-level `bodyLimit` effectively replaces the limit for this route.

2. **Content-Type check**: Explicitly check for `multipart/form-data`. If someone sends JSON, return a clear error.

3. **File field name**: Expect the file in a field called `file`. This is the most common convention.

4. **Empty file handling**: Return a success response with zero counts — not an error.

### Task 5: Register Routes in `app.ts`

In `src/app.ts`, make two changes:

1. Add import:
```typescript
import { createImportRoutes } from './routes/import-routes.js';
```

2. Add route (after bookmarks and tags):
```typescript
app.route('/api/import', createImportRoutes());
```

**Important note on body limit interaction**: The global `bodyLimit` middleware (`app.use('*', bodyLimit(...))`) runs on ALL routes including `/api/import`. The import route adds its own `bodyLimit` at the route level. This works because the import route's `bodyLimit` middleware will process the request BEFORE the route handler. However, the global middleware runs first. To handle this correctly, the import routes should be mounted BEFORE the global body limit middleware, OR the route-level middleware should be enough since Hono's `bodyLimit` checks the request body size at the point it's consumed.

**Actually — revised approach**: Since Hono's `bodyLimit` middleware checks the body on consumption (not eagerly), the route-level override should work. But to be safe, test this. If the global 1MB limit blocks multipart uploads, consider restructuring so the import route is mounted before the global body limit.

### Task 6: Test File

Create `test/routes/import-routes.test.ts` and `test/services/import-service.test.ts`.

**Test fixtures — sample HTML files:**

```typescript
// Chrome bookmark export
const CHROME_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3>Programming</H3>
        <DL><p>
            <DT><H3>Rust</H3>
            <DL><p>
                <DT><A HREF="https://rust-lang.org" ADD_DATE="1234567890">Rust Language</A>
                <DT><A HREF="https://tokio.rs" ADD_DATE="1234567891">Tokio Runtime</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1234567892">Example Site</A>
    </DL><p>
    <DT><H3>Other Bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1234567893">Hacker News</A>
    </DL><p>
</DL><p>`;

// Firefox bookmark export
const FIREFOX_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><H3>Bookmarks Menu</H3>
    <DL><p>
        <DT><H3>Web Dev</H3>
        <DL><p>
            <DT><A HREF="https://developer.mozilla.org" ADD_DATE="1234567890">MDN Web Docs</A>
        </DL><p>
    </DL><p>
    <DT><H3>Bookmarks Toolbar</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1234567891">GitHub</A>
    </DL><p>
</DL><p>`;
```

**Unit tests for `parseNetscapeHtml` (in `test/services/import-service.test.ts`):**
- Parses Chrome HTML → correct bookmarks with tags `["programming", "rust"]`
- Parses Firefox HTML → correct bookmarks, browser root folders skipped
- Skips browser root folders (Bookmarks bar, Other Bookmarks, etc.)
- Empty/blank titles fall back to URL
- Deeply nested folders produce correct tag chains
- Empty HTML returns empty array
- HTML with no bookmarks (only folders) returns empty array

**Integration tests for POST `/api/import` (in `test/routes/import-routes.test.ts`):**
- Successful import returns `{ imported: N, failed: 0, errors: [] }`
- Duplicate URLs skipped, reported in failed count
- Invalid URLs reported in errors array
- Empty file returns `{ imported: 0, failed: 0, errors: [] }`
- Folder hierarchy mapped to tags on imported bookmarks (verify via GET `/api/bookmarks`)
- Auth required (401 without API key)
- Missing file field returns 400
- Non-multipart Content-Type returns 400
- All existing tests must still pass

**Test helper for multipart requests:**

```typescript
const createImportRequest = (app: ReturnType<typeof createApp>, htmlContent: string) => {
  const formData = new FormData();
  const file = new File([htmlContent], 'bookmarks.html', { type: 'text/html' });
  formData.append('file', file);

  return app.request('/api/import', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
    },
    body: formData,
  });
};
```

**Note:** Do NOT set `Content-Type: multipart/form-data` manually when using `FormData` — the browser/runtime sets it automatically with the correct boundary.

### Previous Story Learnings (from Epics 1-3)

1. **Type casts**: Use proper types, not `as never`. Use `as ZodError` or proper typing.
2. **Test completeness**: Include tests for auth (401), exact response shape, and edge cases.
3. **Keep existing tests passing**: Do NOT modify any existing test expectations.
4. **Response body verification**: Always verify both status code and response body structure.
5. **FTS5 triggers**: Bookmarks inserted during import will automatically sync to the FTS5 index via the existing INSERT triggers in `002-fts5-setup.sql`. No extra FTS handling needed.
6. **Transaction safety**: The entire import must be wrapped in a single `db.transaction()`. Validation errors (invalid URLs) should be filtered BEFORE the transaction — they go into the errors array but don't cause a rollback.
7. **Body limit interaction**: Test that the 10MB import limit works alongside the global 1MB limit. If the global limit blocks multipart uploads, the import route may need to be mounted before the global `bodyLimit` middleware.
8. **Tag normalization**: Tags from folder names must follow the same normalization as `createBookmark` — lowercase and trimmed. This is done in the parser.
9. **`INSERT OR IGNORE` for tags**: Reuse the same pattern as bookmark-repository — insert tag, ignore if exists, then select its ID.

### Project Structure Notes

- **New dependency**: `node-html-parser` — lightweight HTML parser
- **New file**: `src/services/import-service.ts` — HTML parsing + bulk import logic
- **New file**: `src/routes/import-routes.ts` — POST `/api/import` route
- **New file**: `test/routes/import-routes.test.ts` — import endpoint tests
- **New file**: `test/services/import-service.test.ts` — parser unit tests
- **Modified**: `src/types.ts` — add `ImportResult` interface
- **Modified**: `src/app.ts` — register import routes
- **NO new schemas** — import doesn't use Zod validation (multipart file, not JSON body)
- **NO new middleware** — auth is handled by global middleware; body limit is route-level

### References

- [Source: epics.md#Story 4.1] — acceptance criteria and FR mappings (FR19, FR20, FR21)
- [Source: architecture.md#Data Architecture] — normalized tag model, transaction patterns
- [Source: architecture.md#Project Structure] — `src/services/import-service.ts`, `src/routes/import-routes.ts`
- [Source: architecture.md#Requirements to Structure Mapping] — FR19-21 map to `import-routes.ts` + `import-service.ts`
- [Source: architecture.md#Gap Analysis] — HTML parser library not specified, to be chosen at implementation
- [Source: types.ts] — existing `Bookmark`, `Tag` interfaces
- [Source: bookmark-repository.ts] — existing tag insert pattern (INSERT OR IGNORE + SELECT)
- [Source: app.ts] — route registration pattern, global body limit
- [Source: bookmark-schemas.ts] — URL max 2000 chars, title max 500 chars

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
