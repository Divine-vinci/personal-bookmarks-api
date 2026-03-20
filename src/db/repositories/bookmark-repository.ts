import type { CreateBookmarkInput } from '../../schemas/bookmark-schemas.js';
import type { Bookmark } from '../../types.js';
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
