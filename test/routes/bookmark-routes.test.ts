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
});
