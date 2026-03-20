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

const createBookmarkViaApi = (app: ReturnType<typeof createApp>, body: unknown) => app.request('/api/bookmarks', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${API_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

describe('export routes', () => {
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

    const response = await app.request('/api/export', {
      method: 'GET',
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key',
      },
    });
  });

  it('returns an empty array when no bookmarks exist', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/export');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual([]);
  });

  it('exports all bookmark fields with tags resolved to name arrays', async () => {
    const app = createApp();

    await createBookmarkViaApi(app, {
      url: 'https://example.com/with-tags',
      title: 'Tagged bookmark',
      description: 'Has tags',
      tags: ['rust', 'async'],
    });
    await createBookmarkViaApi(app, {
      url: 'https://example.com/without-tags',
      title: 'Untagged bookmark',
      description: null,
      tags: [],
    });

    const response = await authorizedGetRequest(app, '/api/export');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = await response.json() as Array<{
      id: number;
      url: string;
      title: string;
      description: string | null;
      tags: string[];
      created_at: string;
      updated_at: string;
    }>;

    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: 1,
      url: 'https://example.com/with-tags',
      title: 'Tagged bookmark',
      description: 'Has tags',
      tags: ['async', 'rust'],
    });
    expect(body[1]).toMatchObject({
      id: 2,
      url: 'https://example.com/without-tags',
      title: 'Untagged bookmark',
      description: null,
      tags: [],
    });
    expect(new Date(body[0].created_at).toISOString()).toBe(body[0].created_at);
    expect(new Date(body[0].updated_at).toISOString()).toBe(body[0].updated_at);
    expect(new Date(body[1].created_at).toISOString()).toBe(body[1].created_at);
    expect(new Date(body[1].updated_at).toISOString()).toBe(body[1].updated_at);
  });

  it('exports multiple bookmarks with mixed tag sets correctly', async () => {
    const app = createApp();

    await createBookmarkViaApi(app, {
      url: 'https://example.com/one',
      title: 'One',
      tags: ['backend', 'typescript'],
    });
    await createBookmarkViaApi(app, {
      url: 'https://example.com/two',
      title: 'Two',
      tags: ['typescript'],
    });
    await createBookmarkViaApi(app, {
      url: 'https://example.com/three',
      title: 'Three',
    });

    const response = await authorizedGetRequest(app, '/api/export');
    const body = await response.json() as Array<{ url: string; tags: string[] }>;

    expect(response.status).toBe(200);
    expect(body.map(({ url, tags }) => ({ url, tags }))).toEqual([
      {
        url: 'https://example.com/one',
        tags: ['backend', 'typescript'],
      },
      {
        url: 'https://example.com/two',
        tags: ['typescript'],
      },
      {
        url: 'https://example.com/three',
        tags: [],
      },
    ]);
  });
});
