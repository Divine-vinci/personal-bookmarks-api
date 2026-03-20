import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { DatabaseManager } from '../../src/db/database.js';
import { getDatabase, setDatabaseManager } from '../../src/db/database.js';
import { setApiKeyHash } from '../../src/db/repositories/settings-repository.js';
import { createInMemoryManager } from '../helpers.js';

const API_KEY = 'test-api-key';

const authorizedImportRequest = (app: ReturnType<typeof createApp>, file: File) => {
  const form = new FormData();
  form.set('file', file);

  return app.request('/api/import', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
    },
    body: form,
  });
};

describe('import routes', () => {
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

  it('requires authentication', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('file', new File(['<DL><p></DL><p>'], 'bookmarks.html', { type: 'text/html' }));

    const response = await app.request('/api/import', {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key',
      },
    });
  });

  it('imports bookmarks from multipart Netscape HTML files', async () => {
    const app = createApp();
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Bookmarks bar</H3>
  <DL><p>
    <DT><H3>Programming</H3>
    <DL><p>
      <DT><A HREF="https://example.com/one">One</A>
      <DT><A HREF="not-a-url"></A>
      <DT><A HREF="https://example.com/one">Duplicate</A>
      <DT><A HREF="https://example.com/two"></A>
    </DL><p>
  </DL><p>
</DL><p>`;

    const response = await authorizedImportRequest(
      app,
      new File([html], 'bookmarks.html', { type: 'text/html' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      imported: 2,
      failed: 2,
      errors: [
        'Bookmark 2: invalid URL "not-a-url"',
        'Bookmark 3: duplicate URL skipped "https://example.com/one"',
      ],
    });

    const rows = getDatabase().prepare('SELECT url, title FROM bookmarks ORDER BY url ASC').all() as Array<{ url: string; title: string }>;
    expect(rows).toEqual([
      { url: 'https://example.com/one', title: 'One' },
      { url: 'https://example.com/two', title: 'https://example.com/two' },
    ]);
  });

  it('returns an invalid_request error when the file field is missing', async () => {
    const app = createApp();
    const form = new FormData();

    const response = await app.request('/api/import', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
      },
      body: form,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'Bookmark file is required',
      },
    });
  });

  it('rejects files over the 10MB route limit', async () => {
    const app = createApp();
    const oversizedFile = new File(['x'.repeat((10 * 1024 * 1024) + 1)], 'huge.html', { type: 'text/html' });

    const response = await authorizedImportRequest(app, oversizedFile);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_request',
        message: 'Request body exceeds 10MB limit',
      },
    });
  });
});
