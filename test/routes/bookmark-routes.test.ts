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
    ).all(created.id) as Array<{ name: string }> ;

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
    await firstResponse.json();

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
});
