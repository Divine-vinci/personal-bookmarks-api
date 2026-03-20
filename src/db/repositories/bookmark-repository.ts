import type { CreateBookmarkInput, UpdateBookmarkInput } from '../../schemas/bookmark-schemas.js';
import type { Bookmark, PaginatedResponse } from '../../types.js';
import { conflict, notFound } from '../../middleware/error-middleware.js';
import { getDatabase } from '../database.js';

type BookmarkRow = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type TagRow = {
  id: number;
  name: string;
};

type SqliteConstraintError = Error & {
  code?: string;
};

const isDuplicateUrlError = (error: unknown): error is SqliteConstraintError => {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqliteError = error as SqliteConstraintError;
  const code = sqliteError.code ?? '';

  return code.startsWith('SQLITE_CONSTRAINT')
    && (error.message.includes('bookmarks.url') || error.message.includes('idx_bookmarks_url'));
};

const mapBookmarkRow = (row: BookmarkRow, tags: string[]): Bookmark => ({
  id: row.id,
  url: row.url,
  title: row.title,
  description: row.description,
  tags,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getBookmarkById = (id: number): Bookmark => {
  const db = getDatabase();
  const bookmarkRow = db.prepare(
    `SELECT id, url, title, description, created_at, updated_at
     FROM bookmarks
     WHERE id = ?`,
  ).get(id) as BookmarkRow | undefined;

  if (!bookmarkRow) {
    throw notFound('Bookmark not found');
  }

  const tagRows = db.prepare(
    `SELECT t.name
     FROM tags t
     INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
     WHERE bt.bookmark_id = ?
     ORDER BY t.name ASC`,
  ).all(id) as Array<Pick<TagRow, 'name'>>;

  return mapBookmarkRow(bookmarkRow, tagRows.map((tag) => tag.name));
};

const SORT_CLAUSES: Record<string, string> = {
  created_at: 'created_at DESC',
  updated_at: 'updated_at DESC',
  title: 'title ASC',
};

export const listBookmarks = (options: {
  limit: number;
  offset: number;
  sort?: 'created_at' | 'updated_at' | 'title' | undefined;
}): PaginatedResponse<Bookmark> => {
  const db = getDatabase();
  const orderBy = SORT_CLAUSES[options.sort ?? 'created_at'];

  const rows = db.prepare(
    `SELECT id, url, title, description, created_at, updated_at
     FROM bookmarks
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
  ).all(options.limit, options.offset) as BookmarkRow[];

  const total = (db.prepare('SELECT COUNT(*) as count FROM bookmarks').get() as { count: number }).count;

  if (rows.length === 0) {
    return { data: [], total };
  }

  const placeholders = rows.map(() => '?').join(', ');
  const bookmarkIds = rows.map((row) => row.id);
  const tagRows = db.prepare(
    `SELECT bt.bookmark_id, t.name
     FROM tags t
     INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
     WHERE bt.bookmark_id IN (${placeholders})
     ORDER BY t.name ASC`,
  ).all(...bookmarkIds) as Array<{ bookmark_id: number; name: string }>;

  const tagsByBookmarkId = new Map<number, string[]>();
  for (const tag of tagRows) {
    const tags = tagsByBookmarkId.get(tag.bookmark_id);
    if (tags) {
      tags.push(tag.name);
    } else {
      tagsByBookmarkId.set(tag.bookmark_id, [tag.name]);
    }
  }

  const bookmarks = rows.map((row) => mapBookmarkRow(
    row,
    tagsByBookmarkId.get(row.id) ?? [],
  ));

  return { data: bookmarks, total };
};

export const createBookmark = (input: CreateBookmarkInput): Bookmark => {
  const db = getDatabase();
  const now = new Date().toISOString();
  const normalizedTags = Array.from(new Set(input.tags ?? []));

  const insertBookmark = db.prepare(
    `INSERT INTO bookmarks (url, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const selectTag = db.prepare('SELECT id, name FROM tags WHERE name = ?');
  const insertBookmarkTag = db.prepare(
    'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)',
  );

  const createBookmarkTx = db.transaction((bookmarkInput: CreateBookmarkInput): number => {
    const bookmarkResult = insertBookmark.run(
      bookmarkInput.url,
      bookmarkInput.title,
      bookmarkInput.description ?? null,
      now,
      now,
    );
    const bookmarkId = Number(bookmarkResult.lastInsertRowid);

    for (const tagName of normalizedTags) {
      insertTag.run(tagName);
      const tagRow = selectTag.get(tagName) as TagRow | undefined;

      if (!tagRow) {
        throw new Error(`Failed to resolve tag after upsert: ${tagName}`);
      }

      insertBookmarkTag.run(bookmarkId, tagRow.id);
    }

    return bookmarkId;
  });

  try {
    const bookmarkId = createBookmarkTx(input);
    return getBookmarkById(bookmarkId);
  }
  catch (error: unknown) {
    if (isDuplicateUrlError(error)) {
      throw conflict('A bookmark with this URL already exists');
    }

    throw error;
  }
};

export const deleteBookmark = (id: number): void => {
  const db = getDatabase();
  const selectExisting = db.prepare('SELECT id FROM bookmarks WHERE id = ?');
  const deleteTagAssociations = db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?');
  const deleteBookmarkStmt = db.prepare('DELETE FROM bookmarks WHERE id = ?');

  const deleteBookmarkTx = db.transaction((bookmarkId: number) => {
    const existingBookmark = selectExisting.get(bookmarkId) as { id: number } | undefined;

    if (!existingBookmark) {
      throw notFound('Bookmark not found');
    }

    deleteTagAssociations.run(bookmarkId);
    deleteBookmarkStmt.run(bookmarkId);
  });

  deleteBookmarkTx(id);
};

export const updateBookmark = (id: number, input: UpdateBookmarkInput): Bookmark => {
  const db = getDatabase();
  const normalizedTags = Array.from(new Set(input.tags ?? []));

  const selectExisting = db.prepare('SELECT id FROM bookmarks WHERE id = ?');
  const updateStmt = db.prepare(
    `UPDATE bookmarks
     SET url = ?, title = ?, description = ?, updated_at = ?
     WHERE id = ?`,
  );
  const deleteTagAssociations = db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?');
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const selectTag = db.prepare('SELECT id, name FROM tags WHERE name = ?');
  const insertBookmarkTag = db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');

  const updateBookmarkTx = db.transaction((bookmarkId: number, bookmarkInput: UpdateBookmarkInput) => {
    const existingBookmark = selectExisting.get(bookmarkId) as { id: number } | undefined;

    if (!existingBookmark) {
      throw notFound('Bookmark not found');
    }

    const now = new Date().toISOString();

    updateStmt.run(
      bookmarkInput.url,
      bookmarkInput.title,
      bookmarkInput.description ?? null,
      now,
      bookmarkId,
    );

    deleteTagAssociations.run(bookmarkId);

    for (const tagName of normalizedTags) {
      insertTag.run(tagName);
      const tagRow = selectTag.get(tagName) as TagRow | undefined;

      if (!tagRow) {
        throw new Error(`Failed to resolve tag after upsert: ${tagName}`);
      }

      insertBookmarkTag.run(bookmarkId, tagRow.id);
    }
  });

  try {
    updateBookmarkTx(id, input);
  }
  catch (error: unknown) {
    if (isDuplicateUrlError(error)) {
      throw conflict('A bookmark with this URL already exists');
    }

    throw error;
  }

  return getBookmarkById(id);
};
