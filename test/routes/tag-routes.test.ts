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

    const response = await authorizedGetRequest(app, '/api/tags');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
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

    const response = await authorizedGetRequest(app, '/api/tags');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
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

    const response = await authorizedGetRequest(app, '/api/tags');
    const body = await response.json() as Array<{ name: string }>;

    expect(response.status).toBe(200);
    expect(body.map((tag) => tag.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('excludes zero-count tags after bookmark deletion', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/only',
      title: 'Only Bookmark',
      tags: ['orphan-tag', 'shared-tag'],
    });
    const created = await createResponse.json() as { id: number };

    await authorizedJsonRequest(app, {
      url: 'https://example.com/other',
      title: 'Other Bookmark',
      tags: ['shared-tag'],
    });

    const deleteResponse = await authorizedDeleteRequest(app, `/api/bookmarks/${created.id}`);
    expect(deleteResponse.status).toBe(204);

    const response = await authorizedGetRequest(app, '/api/tags');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ name: 'shared-tag', count: 1 }]);
  });

  it('excludes zero-count tags after bookmark update removes tag', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/updatable',
      title: 'Updatable Bookmark',
      tags: ['will-remove', 'will-keep'],
    });
    const created = await createResponse.json() as { id: number };

    const updateResponse = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/updatable',
      title: 'Updatable Bookmark',
      tags: ['will-keep'],
    });
    expect(updateResponse.status).toBe(200);

    const response = await authorizedGetRequest(app, '/api/tags');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ name: 'will-keep', count: 1 }]);
  });

  it('requires authentication', async () => {
    const app = createApp();

    const response = await app.request('/api/tags');

    expect(response.status).toBe(401);
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

    const response = await authorizedGetRequest(app, '/api/tags');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ name: 'common', count: 3 }]);
  });
});
