import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '../../src/db/database.js';
import { getDatabase, setDatabaseManager } from '../../src/db/database.js';
import { importBookmarks, parseNetscapeHtml } from '../../src/services/import-service.js';
import { createInMemoryManager } from '../helpers.js';

const chromeHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p>
    <DT><H3>Programming</H3>
    <DL><p>
      <DT><H3>Rust</H3>
      <DL><p>
        <DT><A HREF="https://www.rust-lang.org">Rust Lang</A>
      </DL><p>
    </DL><p>
    <DT><A HREF="https://example.com/no-folder">Outside Folder</A>
  </DL><p>
</DL><p>`;

const firefoxHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Bookmarks Menu</H3>
  <DL><p>
    <DT><H3>Research</H3>
    <DL><p>
      <DT><A HREF="https://developer.mozilla.org">MDN</A>
    </DL><p>
  </DL><p>
</DL><p>`;

const safariHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Favourites</H3>
  <DL><p>
    <DT><H3>Reading</H3>
    <DL><p>
      <DT><A HREF="https://webkit.org">WebKit</A>
    </DL><p>
  </DL><p>
</DL><p>`;

describe('import service', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = createInMemoryManager();
    setDatabaseManager(manager);
  });

  afterEach(() => {
    manager.close();
    setDatabaseManager(null);
  });

  it('parses Chrome bookmark exports and skips browser root folders', () => {
    expect(parseNetscapeHtml(chromeHtml)).toEqual([
      {
        url: 'https://www.rust-lang.org',
        title: 'Rust Lang',
        tags: ['programming', 'rust'],
      },
      {
        url: 'https://example.com/no-folder',
        title: 'Outside Folder',
        tags: [],
      },
    ]);
  });

  it('parses Firefox bookmark exports', () => {
    expect(parseNetscapeHtml(firefoxHtml)).toEqual([
      {
        url: 'https://developer.mozilla.org',
        title: 'MDN',
        tags: ['research'],
      },
    ]);
  });

  it('parses Safari bookmark exports', () => {
    expect(parseNetscapeHtml(safariHtml)).toEqual([
      {
        url: 'https://webkit.org',
        title: 'WebKit',
        tags: ['reading'],
      },
    ]);
  });

  it('imports valid bookmarks, reports invalid URLs, and preserves existing rows', () => {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO bookmarks (url, title, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('https://existing.example.com', 'Existing', null, '2026-03-20T00:00:00.000Z', '2026-03-20T00:00:00.000Z');

    const result = importBookmarks([
      { url: 'https://valid.example.com', title: 'Valid', tags: ['Programming', 'Rust'] },
      { url: 'not-a-url', title: 'Bad', tags: ['Ignore'] },
      { url: 'https://existing.example.com', title: 'Duplicate', tags: ['Duplicate'] },
    ]);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.errors).toEqual([
      'Bookmark 2: invalid URL "not-a-url"',
      'Bookmark 3: duplicate URL skipped "https://existing.example.com"',
    ]);

    const bookmarks = db.prepare('SELECT url, title FROM bookmarks ORDER BY url ASC').all() as Array<{ url: string; title: string }>;
    const tags = db.prepare('SELECT name FROM tags ORDER BY name ASC').all() as Array<{ name: string }>;

    expect(bookmarks).toEqual([
      { url: 'https://existing.example.com', title: 'Existing' },
      { url: 'https://valid.example.com', title: 'Valid' },
    ]);
    expect(tags).toEqual([{ name: 'programming' }, { name: 'rust' }]);
  });

  it('uses the URL as a fallback title and handles empty imports', () => {
    expect(importBookmarks([])).toEqual({ imported: 0, failed: 0, errors: [] });

    const result = importBookmarks([
      { url: 'https://fallback.example.com', title: '', tags: [] },
    ]);

    expect(result).toEqual({ imported: 1, failed: 0, errors: [] });

    const row = getDatabase().prepare('SELECT url, title FROM bookmarks WHERE url = ?').get('https://fallback.example.com') as { url: string; title: string };
    expect(row).toEqual({
      url: 'https://fallback.example.com',
      title: 'https://fallback.example.com',
    });
  });
});
