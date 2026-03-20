import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { DatabaseManager } from '../../src/db/database.js';
import { getDatabase, setDatabaseManager } from '../../src/db/database.js';
import { setApiKeyHash } from '../../src/db/repositories/settings-repository.js';
import { createInMemoryManager } from '../helpers.js';

const API_KEY = 'test-api-key';

const authorizedJsonRequest = (app: ReturnType<typeof createApp>, body: unknown) => app.request('/api/bookmarks', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${API_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

const authorizedGetRequest = (app: ReturnType<typeof createApp>, path: string) => app.request(path, {
  method: 'GET',
  headers: {
    authorization: `Bearer ${API_KEY}`,
  },
});

describe('bookmark routes', () => {
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

  it('creates a bookmark and returns the complete bookmark object', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com',
      title: 'Example',
      description: 'Useful link',
      tags: ['rust', 'async'],
    });

    expect(response.status).toBe(201);

    const body = await response.json() as {
      id: number;
      url: string;
      title: string;
      description: string | null;
      tags: string[];
      created_at: string;
      updated_at: string;
    };

    expect(body).toMatchObject({
      id: 1,
      url: 'https://example.com',
      title: 'Example',
      description: 'Useful link',
      tags: ['async', 'rust'],
    });
    expect(new Date(body.created_at).toISOString()).toBe(body.created_at);
    expect(new Date(body.updated_at).toISOString()).toBe(body.updated_at);
  });

  it('creates and associates tags for a new bookmark', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/tags',
      title: 'Tagged bookmark',
      tags: ['rust', 'async'],
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      tags: ['async', 'rust'],
    });

    const db = getDatabase();
    const tagRows = db.prepare('SELECT name FROM tags ORDER BY name ASC').all() as Array<{ name: string }>;
    const junctionRows = db.prepare('SELECT bookmark_id, tag_id FROM bookmark_tags ORDER BY tag_id ASC').all() as Array<{ bookmark_id: number; tag_id: number }>;

    expect(tagRows).toEqual([{ name: 'async' }, { name: 'rust' }]);
    expect(junctionRows).toHaveLength(2);
    expect(junctionRows.every((row) => row.bookmark_id === 1)).toBe(true);
  });

  it('reuses existing tags instead of duplicating them', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/one',
      title: 'First',
      tags: ['rust', 'async'],
    });

    const secondResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/two',
      title: 'Second',
      tags: ['async', 'web'],
    });

    expect(secondResponse.status).toBe(201);
    await expect(secondResponse.json()).resolves.toMatchObject({
      tags: ['async', 'web'],
    });

    const db = getDatabase();
    const tagRows = db.prepare('SELECT id, name FROM tags ORDER BY name ASC').all() as Array<{ id: number; name: string }>;
    const asyncCount = db.prepare('SELECT COUNT(*) as count FROM tags WHERE name = ?').get('async') as { count: number };
    const junctionCount = db.prepare('SELECT COUNT(*) as count FROM bookmark_tags').get() as { count: number };

    expect(tagRows.map((row) => row.name)).toEqual(['async', 'rust', 'web']);
    expect(asyncCount.count).toBe(1);
    expect(junctionCount.count).toBe(4);
  });

  it('returns an empty tags array when tags is empty', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/empty-tags',
      title: 'No tags',
      tags: [],
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      tags: [],
    });
  });

  it('returns an empty tags array when tags is omitted', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/no-tags-field',
      title: 'Missing tags field',
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      tags: [],
    });
  });

  it('stores tags as trimmed lowercase values', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/normalized-tags',
      title: 'Normalized tags',
      tags: [' Rust ', 'ASYNC'],
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      tags: ['async', 'rust'],
    });
  });

  it('returns duplicate_url when the URL already exists', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/duplicate',
      title: 'First',
    });

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/duplicate',
      title: 'Second',
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'duplicate_url',
        message: 'A bookmark with this URL already exists',
      },
    });
  });

  it('returns validation_error when url is missing', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      title: 'Missing URL',
    });

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string; message: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'url')).toBe(true);
  });

  it('returns validation_error when title is missing', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/missing-title',
    });

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string; message: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'title')).toBe(true);
  });

  it('returns invalid_url for invalid URL format', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'not-a-url',
      title: 'Bad URL',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_url',
        message: 'Invalid url: must be a valid URL',
      },
    });
  });

  it('deduplicates tags in input', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/dedup-tags',
      title: 'Dedup tags',
      tags: ['rust', 'rust', 'async'],
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      tags: ['async', 'rust'],
    });

    const db = getDatabase();
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags WHERE name = ?').get('rust') as { count: number };
    expect(tagCount.count).toBe(1);
  });

  it('returns 401 for unauthenticated request', async () => {
    const app = createApp();

    const response = await app.request('/api/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', title: 'Test' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns response with exactly the expected fields', async () => {
    const app = createApp();

    const response = await authorizedJsonRequest(app, {
      url: 'https://example.com/exact-fields',
      title: 'Exact fields',
    });

    expect(response.status).toBe(201);
    const body = await response.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['created_at', 'description', 'id', 'tags', 'title', 'updated_at', 'url']);
  });

  it('supports description as null and when omitted', async () => {
    const app = createApp();

    const nullDescriptionResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/null-description',
      title: 'Null description',
      description: null,
    });
    const omittedDescriptionResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/omitted-description',
      title: 'Omitted description',
    });

    expect(nullDescriptionResponse.status).toBe(201);
    expect(omittedDescriptionResponse.status).toBe(201);
    await expect(nullDescriptionResponse.json()).resolves.toMatchObject({ description: null });
    await expect(omittedDescriptionResponse.json()).resolves.toMatchObject({ description: null });
  });

  it('returns 200 with the complete bookmark object including tags for GET /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/get-by-id',
      title: 'Get by id',
      description: 'Fetch me',
      tags: ['rust', 'async'],
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedGetRequest(app, `/api/bookmarks/${created.id}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: created.id,
      url: 'https://example.com/get-by-id',
      title: 'Get by id',
      description: 'Fetch me',
      tags: ['async', 'rust'],
    });
  });

  it('returns 404 for a non-existent bookmark ID', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks/999');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Bookmark not found',
      },
    });
  });

  it('returns 422 for a non-numeric bookmark ID', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks/not-a-number');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string; message: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'id')).toBe(true);
  });

  it('returns 401 for unauthenticated GET requests', async () => {
    const app = createApp();

    const listResponse = await app.request('/api/bookmarks');
    const singleResponse = await app.request('/api/bookmarks/1');

    expect(listResponse.status).toBe(401);
    expect(singleResponse.status).toBe(401);
  });

  it('returns paginated data and total for GET /api/bookmarks', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/list-one',
      title: 'List one',
      tags: ['alpha'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/list-two',
      title: 'List two',
      tags: ['beta', 'gamma'],
    });

    const db = getDatabase();
    db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE url = ?').run(
      '2026-03-20T12:00:00.000Z',
      '2026-03-20T12:00:00.000Z',
      'https://example.com/list-one',
    );
    db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE url = ?').run(
      '2026-03-20T12:01:00.000Z',
      '2026-03-20T12:01:00.000Z',
      'https://example.com/list-two',
    );

    const response = await authorizedGetRequest(app, '/api/bookmarks');

    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: Array<{ title: string; tags: string[] }>;
      total: number;
    };

    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]?.tags).toEqual(['beta', 'gamma']);
    expect(body.data[1]?.tags).toEqual(['alpha']);
  });

  it('applies default pagination with limit 20 and offset 0', async () => {
    const app = createApp();

    for (let index = 0; index < 25; index += 1) {
      await authorizedJsonRequest(app, {
        url: `https://example.com/default-page-${index}`,
        title: `Bookmark ${index.toString().padStart(2, '0')}`,
      });
    }

    const db = getDatabase();
    for (let index = 0; index < 25; index += 1) {
      db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE url = ?').run(
        `2026-03-20T12:${index.toString().padStart(2, '0')}:00.000Z`,
        `2026-03-20T12:${index.toString().padStart(2, '0')}:00.000Z`,
        `https://example.com/default-page-${index}`,
      );
    }

    const response = await authorizedGetRequest(app, '/api/bookmarks');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(25);
    expect(body.data).toHaveLength(20);
    expect(body.data[0]?.title).toBe('Bookmark 24');
    expect(body.data[19]?.title).toBe('Bookmark 05');
  });

  it('supports a custom limit query parameter', async () => {
    const app = createApp();

    for (let index = 0; index < 6; index += 1) {
      await authorizedJsonRequest(app, {
        url: `https://example.com/custom-limit-${index}`,
        title: `Limit ${index}`,
      });
    }

    const response = await authorizedGetRequest(app, '/api/bookmarks?limit=5');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: unknown[]; total: number };
    expect(body.total).toBe(6);
    expect(body.data).toHaveLength(5);
  });

  it('caps limit values above 100 at 100', async () => {
    const app = createApp();
    const db = getDatabase();
    const now = '2026-03-20T12:00:00.000Z';
    const insert = db.prepare(
      'INSERT INTO bookmarks (url, title, description, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)',
    );

    for (let index = 0; index < 105; index += 1) {
      insert.run(`https://example.com/capped-limit-${index}`, `Cap ${index.toString().padStart(3, '0')}`, now, now);
    }

    const response = await authorizedGetRequest(app, '/api/bookmarks?limit=999');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: unknown[]; total: number };
    expect(body.total).toBe(105);
    expect(body.data).toHaveLength(100);
  });

  it('applies offset to skip records', async () => {
    const app = createApp();

    for (let index = 0; index < 5; index += 1) {
      await authorizedJsonRequest(app, {
        url: `https://example.com/offset-${index}`,
        title: `Offset ${index}`,
      });
    }

    const db = getDatabase();
    for (let index = 0; index < 5; index += 1) {
      db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE url = ?').run(
        `2026-03-20T13:0${index}:00.000Z`,
        `2026-03-20T13:0${index}:00.000Z`,
        `https://example.com/offset-${index}`,
      );
    }

    const response = await authorizedGetRequest(app, '/api/bookmarks?offset=2');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(5);
    expect(body.data).toHaveLength(3);
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Offset 2', 'Offset 1', 'Offset 0']);
  });

  it('sorts by created_at descending by default', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-created-old',
      title: 'Oldest',
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-created-new',
      title: 'Newest',
    });

    const db = getDatabase();
    db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE url = ?').run(
      '2026-03-20T12:00:00.000Z',
      '2026-03-20T12:00:00.000Z',
      'https://example.com/sort-created-old',
    );
    db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE url = ?').run(
      '2026-03-20T12:01:00.000Z',
      '2026-03-20T12:01:00.000Z',
      'https://example.com/sort-created-new',
    );

    const response = await authorizedGetRequest(app, '/api/bookmarks');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }> };
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Newest', 'Oldest']);
  });

  it('sorts by title in ascending alphabetical order', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-title-zeta',
      title: 'Zeta',
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-title-alpha',
      title: 'Alpha',
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-title-beta',
      title: 'Beta',
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?sort=title');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }> };
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Alpha', 'Beta', 'Zeta']);
  });

  it('sorts by updated_at descending', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-updated-first',
      title: 'First updated',
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/sort-updated-second',
      title: 'Second updated',
    });

    const db = getDatabase();
    db.prepare('UPDATE bookmarks SET updated_at = ? WHERE url = ?').run('2026-03-20T12:00:00.000Z', 'https://example.com/sort-updated-first');
    db.prepare('UPDATE bookmarks SET updated_at = ? WHERE url = ?').run('2026-03-20T13:00:00.000Z', 'https://example.com/sort-updated-second');

    const response = await authorizedGetRequest(app, '/api/bookmarks?sort=updated_at');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }> };
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Second updated', 'First updated']);
  });

  it('returns 422 for an invalid sort value', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks?sort=invalid');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string; message: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'sort')).toBe(true);
  });

  it('returns an empty dataset when no bookmarks exist', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it('returns 422 for limit=0', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks?limit=0');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'limit')).toBe(true);
  });

  it('returns 422 for negative offset', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks?offset=-1');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'offset')).toBe(true);
  });
});
