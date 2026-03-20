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

  it('updates all fields and returns 200 for PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/original',
      title: 'Original',
      description: 'Original description',
      tags: ['rust', 'async'],
    });
    const created = await createResponse.json() as {
      id: number;
      created_at: string;
      updated_at: string;
    };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/updated',
      title: 'Updated',
      description: 'Updated description',
      tags: ['rust', 'tokio'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: created.id,
      url: 'https://example.com/updated',
      title: 'Updated',
      description: 'Updated description',
      tags: ['rust', 'tokio'],
      created_at: created.created_at,
    });
  });

  it('updates updated_at while preserving created_at for PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/time-original',
      title: 'Original time',
      tags: ['rust'],
    });
    const created = await createResponse.json() as {
      id: number;
      created_at: string;
      updated_at: string;
    };

    const db = getDatabase();
    db.prepare('UPDATE bookmarks SET created_at = ?, updated_at = ? WHERE id = ?').run(
      '2026-03-20T10:00:00.000Z',
      '2026-03-20T10:00:00.000Z',
      created.id,
    );

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/time-updated',
      title: 'Updated time',
      description: null,
      tags: ['tokio'],
    });

    expect(response.status).toBe(200);
    const updated = await response.json() as {
      created_at: string;
      updated_at: string;
    };

    expect(updated.created_at).toBe('2026-03-20T10:00:00.000Z');
    expect(updated.updated_at).not.toBe('2026-03-20T10:00:00.000Z');
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(new Date(updated.created_at).getTime());
  });

  it('reassigns tags by removing old tags and keeping shared tags for PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/tag-reassign',
      title: 'Tag reassign',
      tags: ['rust', 'async'],
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/tag-reassign',
      title: 'Tag reassign updated',
      description: null,
      tags: ['rust', 'tokio'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tags: ['rust', 'tokio'],
    });

    const db = getDatabase();
    const tagNames = db.prepare(
      `SELECT t.name
       FROM tags t
       INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
       WHERE bt.bookmark_id = ?
       ORDER BY t.name ASC`,
    ).all(created.id) as Array<{ name: string }>;

    expect(tagNames.map((row) => row.name)).toEqual(['rust', 'tokio']);
    const asyncAssociations = db.prepare(
      `SELECT COUNT(*) as count
       FROM bookmark_tags bt
       INNER JOIN tags t ON t.id = bt.tag_id
       WHERE bt.bookmark_id = ? AND t.name = ?`,
    ).get(created.id, 'async') as { count: number };
    expect(asyncAssociations.count).toBe(0);
  });

  it('removes all tag associations when tags is empty for PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/remove-tags',
      title: 'Remove tags',
      tags: ['rust', 'async'],
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/remove-tags',
      title: 'Remove tags updated',
      description: null,
      tags: [],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tags: [],
    });

    const db = getDatabase();
    const associationCount = db.prepare('SELECT COUNT(*) as count FROM bookmark_tags WHERE bookmark_id = ?').get(created.id) as { count: number };
    expect(associationCount.count).toBe(0);
  });

  it('allows changing URL to an unused URL for PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/url-change-original',
      title: 'Original URL',
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/url-change-updated',
      title: 'Updated URL',
      description: null,
      tags: [],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://example.com/url-change-updated',
    });
  });

  it('returns duplicate_url when PUT /:id uses another bookmark URL', async () => {
    const app = createApp();

    const firstResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/put-duplicate-first',
      title: 'First bookmark',
    });
    const secondResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/put-duplicate-second',
      title: 'Second bookmark',
    });
    const secondBookmark = await secondResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${secondBookmark.id}`, {
      url: 'https://example.com/put-duplicate-first',
      title: 'Second updated',
      description: null,
      tags: [],
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'duplicate_url',
        message: 'A bookmark with this URL already exists',
      },
    });
  });

  it('allows PUT /:id to keep the same URL without self-conflict', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/self-conflict',
      title: 'Self conflict',
      tags: ['rust'],
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/self-conflict',
      title: 'Self conflict updated',
      description: 'Still same URL',
      tags: ['rust', 'tokio'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: created.id,
      url: 'https://example.com/self-conflict',
      title: 'Self conflict updated',
      description: 'Still same URL',
      tags: ['rust', 'tokio'],
    });
  });

  it('returns 404 for a non-existent bookmark ID on PUT /:id', async () => {
    const app = createApp();

    const response = await authorizedPutRequest(app, '/api/bookmarks/999', {
      url: 'https://example.com/missing-bookmark',
      title: 'Missing bookmark',
      description: null,
      tags: [],
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Bookmark not found',
      },
    });
  });

  it('returns validation_error when required fields are missing for PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/put-missing-fields',
      title: 'Missing fields seed',
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      title: 'Only title',
    });

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'url')).toBe(true);
  });

  it('returns invalid_url for invalid URL format on PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/put-invalid-url',
      title: 'Invalid URL seed',
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'not-a-url',
      title: 'Invalid URL update',
      description: null,
      tags: [],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_url',
        message: 'Invalid url: must be a valid URL',
      },
    });
  });

  it('returns 401 for unauthenticated PUT requests', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/put-unauthorized',
      title: 'Unauthorized seed',
    });
    const created = await createResponse.json() as { id: number };

    const response = await app.request(`/api/bookmarks/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/put-unauthorized-updated',
        title: 'Unauthorized update',
        description: null,
        tags: [],
      }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 422 for negative offset', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks?offset=-1');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'offset')).toBe(true);
  });

  it('removes all tags when tags field is omitted in PUT /:id', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/omit-tags-put',
      title: 'Omit tags',
      tags: ['rust', 'async'],
    });
    const created = await createResponse.json() as { id: number };

    const response = await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/omit-tags-put',
      title: 'Omit tags updated',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tags: [],
    });
  });


  it('deletes a bookmark and returns 204 with an empty body', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/delete-me',
      title: 'Delete me',
      tags: ['temp'],
    });
    const created = await createResponse.json() as { id: number };

    const deleteResponse = await authorizedDeleteRequest(app, `/api/bookmarks/${created.id}`);

    expect(deleteResponse.status).toBe(204);
    expect(await deleteResponse.text()).toBe('');

    const getResponse = await authorizedGetRequest(app, `/api/bookmarks/${created.id}`);
    expect(getResponse.status).toBe(404);
  });

  it('removes bookmark tag associations but leaves orphaned tags in place', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/delete-tag-associations',
      title: 'Delete tags',
      tags: ['orphaned-tag'],
    });
    const created = await createResponse.json() as { id: number };

    const deleteResponse = await authorizedDeleteRequest(app, `/api/bookmarks/${created.id}`);

    expect(deleteResponse.status).toBe(204);

    const db = getDatabase();
    const bookmarkTagRows = db.prepare('SELECT bookmark_id, tag_id FROM bookmark_tags WHERE bookmark_id = ?').all(created.id) as Array<{ bookmark_id: number; tag_id: number }>;
    const orphanedTag = db.prepare('SELECT id, name FROM tags WHERE name = ?').get('orphaned-tag') as { id: number; name: string } | undefined;

    expect(bookmarkTagRows).toEqual([]);
    expect(orphanedTag).toMatchObject({ name: 'orphaned-tag' });
  });

  it('returns 404 not_found when deleting a non-existent bookmark', async () => {
    const app = createApp();

    const response = await authorizedDeleteRequest(app, '/api/bookmarks/999');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Bookmark not found',
      },
    });
  });

  it('returns 422 for a non-numeric bookmark ID on DELETE', async () => {
    const app = createApp();

    const response = await authorizedDeleteRequest(app, '/api/bookmarks/not-a-number');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string; message: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'id')).toBe(true);
  });

  it('returns 401 for unauthenticated DELETE requests', async () => {
    const app = createApp();

    const response = await app.request('/api/bookmarks/1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(401);
  });

  it('searches bookmarks by title via FTS5', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/rust-tokio',
      title: 'Rust Tokio Cancellation Patterns',
      description: 'Guide to cooperative cancellation',
      tags: ['rust'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/python',
      title: 'Python asyncio basics',
      description: 'Async intro',
      tags: ['python'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=tokio%20cancel');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Rust Tokio Cancellation Patterns']);
  });

  it('searches bookmarks by url via FTS5', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://tokio.rs/tutorial',
      title: 'Tokio tutorial',
      description: 'Runtime docs',
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/other',
      title: 'Other bookmark',
      description: 'Other docs',
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=tokio');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ url: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data.map((bookmark) => bookmark.url)).toEqual(['https://tokio.rs/tutorial']);
  });

  it('searches bookmarks by description via FTS5', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/fts-desc',
      title: 'SQLite docs',
      description: 'Detailed FTS5 ranking and bm25 reference',
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=ranking');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0]?.title).toBe('SQLite docs');
  });

  it('searches bookmarks by tag name', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/tagged-rust',
      title: 'Unrelated title',
      description: 'No direct term match',
      tags: ['tokio'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/tagged-other',
      title: 'Different bookmark',
      description: 'Also no match',
      tags: ['async'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=tokio');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string; tags: string[] }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0]?.title).toBe('Unrelated title');
    expect(body.data[0]?.tags).toEqual(['tokio']);
  });

  it('ranks FTS matches ahead of tag-only matches and ignores sort when q is present', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/tag-only-match',
      title: 'Alpha bookmark',
      description: 'No full text term here',
      tags: ['tokio'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/fts-best-match',
      title: 'Tokio cancellation guide',
      description: 'tokio cancellation tokio',
      tags: ['rust'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/fts-weaker-match',
      title: 'Tokio notes',
      description: 'tokio',
      tags: ['notes'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=tokio&sort=title');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(3);
    expect(body.data[0]?.title).toBe('Tokio cancellation guide');
    expect(body.data[body.data.length - 1]?.title).toBe('Alpha bookmark');
  });

  it('returns empty results when search has no matches', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/existing',
      title: 'Existing bookmark',
      description: 'Stored bookmark',
      tags: ['rust'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=nonexistent');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it('applies pagination to search results', async () => {
    const app = createApp();

    for (let index = 0; index < 6; index += 1) {
      await authorizedJsonRequest(app, {
        url: `https://example.com/search-page-${index}`,
        title: `Rust search result ${index}`,
        description: 'rust rust',
        tags: ['rust'],
      });
    }

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=rust&limit=2&offset=2');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(6);
    expect(body.data).toHaveLength(2);
  });

  it('validates empty trimmed search queries', async () => {
    const app = createApp();

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=%20%20%20');

    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; details: Array<{ field: string }> } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details.some((detail) => detail.field === 'q')).toBe(true);
  });

  it('makes newly created bookmarks searchable via insert trigger', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/newly-searchable',
      title: 'Fresh FTS entry',
      description: 'Inserted after migration',
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=fresh');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0]?.title).toBe('Fresh FTS entry');
  });

  it('updates searchable content via update trigger', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/update-search',
      title: 'Original search title',
      description: 'before update',
      tags: ['rust'],
    });
    const created = await createResponse.json() as { id: number };

    await authorizedPutRequest(app, `/api/bookmarks/${created.id}`, {
      url: 'https://example.com/update-search',
      title: 'Updated lookup phrase',
      description: 'after update',
      tags: ['rust'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=lookup');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0]?.title).toBe('Updated lookup phrase');
  });

  it('removes deleted bookmarks from search results via delete trigger', async () => {
    const app = createApp();

    const createResponse = await authorizedJsonRequest(app, {
      url: 'https://example.com/delete-search',
      title: 'Delete me from search',
      description: 'should disappear',
    });
    const created = await createResponse.json() as { id: number };

    const deleteResponse = await authorizedDeleteRequest(app, `/api/bookmarks/${created.id}`);
    expect(deleteResponse.status).toBe(204);

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=delete');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it('filters bookmarks by a single tag', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/tag-filter-rust',
      title: 'Rust guide',
      description: 'Systems programming',
      tags: ['rust'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/tag-filter-python',
      title: 'Python guide',
      description: 'Scripting language',
      tags: ['python'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=rust');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string; tags: string[] }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.title).toBe('Rust guide');
    expect(body.data[0]?.tags).toEqual(['rust']);
  });

  it('filters bookmarks by multiple tags with AND semantics', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/rust-async',
      title: 'Rust async patterns',
      description: 'Combined tags',
      tags: ['rust', 'async'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/rust-only',
      title: 'Rust only',
      description: 'Missing async tag',
      tags: ['rust'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/async-only',
      title: 'Async only',
      description: 'Missing rust tag',
      tags: ['async'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=rust,async');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Rust async patterns']);
  });

  it('returns empty results for non-existent tag filters', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/existing-tag',
      title: 'Existing bookmark',
      description: 'Stored bookmark',
      tags: ['rust'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=nonexistent');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it('applies pagination to tag-filtered results', async () => {
    const app = createApp();

    for (let index = 0; index < 5; index += 1) {
      await authorizedJsonRequest(app, {
        url: `https://example.com/paginated-tag-${index}`,
        title: `Rust pagination ${index}`,
        description: 'Pagination test',
        tags: ['rust'],
      });
    }

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=rust&limit=2&offset=1&sort=title');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(5);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Rust pagination 1', 'Rust pagination 2']);
  });

  it('applies sorting to tag-filtered results', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/tag-sort-zeta',
      title: 'Zeta note',
      description: 'Sort test',
      tags: ['rust'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/tag-sort-alpha',
      title: 'Alpha note',
      description: 'Sort test',
      tags: ['rust'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=rust&sort=title');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.data.map((bookmark) => bookmark.title)).toEqual(['Alpha note', 'Zeta note']);
  });

  it('combines full-text search and tag filtering', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/performance-rust',
      title: 'Rust performance tuning',
      description: 'Optimize throughput',
      tags: ['rust', 'performance'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/performance-python',
      title: 'Python performance tuning',
      description: 'Optimize throughput',
      tags: ['python', 'performance'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/rust-unrelated',
      title: 'Rust ownership guide',
      description: 'Borrow checker refresher',
      tags: ['rust'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?q=performance&tags=rust');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string; tags: string[] }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0]?.title).toBe('Rust performance tuning');
    expect(body.data[0]?.tags).toEqual(['performance', 'rust']);
  });

  it('treats empty tags query params as no filter', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/no-filter-a',
      title: 'First bookmark',
      description: 'No filter applied',
      tags: ['rust'],
    });
    await authorizedJsonRequest(app, {
      url: 'https://example.com/no-filter-b',
      title: 'Second bookmark',
      description: 'No filter applied',
      tags: ['python'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=%20,%20');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  it('treats tag filters as case-insensitive', async () => {
    const app = createApp();

    await authorizedJsonRequest(app, {
      url: 'https://example.com/case-insensitive-tag',
      title: 'Case insensitive tag match',
      description: 'Stored in lowercase',
      tags: ['rust'],
    });

    const response = await authorizedGetRequest(app, '/api/bookmarks?tags=RUST');

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0]?.title).toBe('Case insensitive tag match');
  });

  it('creates the FTS5 virtual table and sync triggers in the database', () => {
    const db = getDatabase();

    const table = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'bookmarks_fts'").get() as { name: string; sql: string } | undefined;
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('bookmarks_ai', 'bookmarks_ad', 'bookmarks_au') ORDER BY name ASC").all() as Array<{ name: string }>;

    expect(table?.name).toBe('bookmarks_fts');
    expect(table?.sql).toContain('VIRTUAL TABLE');
    expect(triggers.map((trigger) => trigger.name)).toEqual(['bookmarks_ad', 'bookmarks_ai', 'bookmarks_au']);
  });

});
