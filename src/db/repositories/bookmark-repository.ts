import type { CreateBookmarkInput, UpdateBookmarkInput } from '../../schemas/bookmark-schemas.js';
import type { Bookmark, PaginatedResponse } from '../../types.js';
import { conflict, notFound } from '../../middleware/error-middleware.js';
import { getDatabase, type SqliteDatabase } from '../database.js';

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

const getTagsByBookmarkId = (db: SqliteDatabase, bookmarkIds: number[]): Map<number, string[]> => {
  if (bookmarkIds.length === 0) {
    return new Map<number, string[]>();
  }

  const placeholders = bookmarkIds.map(() => '?').join(', ');
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

  return tagsByBookmarkId;
};

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

const buildFtsQuery = (query: string): string => query
  .split(/\s+/)
  .filter(Boolean)
  .map((term) => `"${term.replaceAll('"', '""')}"*`)
  .join(' ');

const searchBookmarks = (
  db: SqliteDatabase,
  query: string,
  limit: number,
  offset: number,
): PaginatedResponse<Bookmark> => {
  const ftsQuery = buildFtsQuery(query);
  const tagPattern = `%${query.toLowerCase()}%`;

  if (!ftsQuery) {
    return { data: [], total: 0 };
  }

  const searchSql = `
    WITH search_results AS (
      SELECT b.id, b.url, b.title, b.description, b.created_at, b.updated_at,
             bm25(bookmarks_fts) AS rank
      FROM bookmarks_fts
      JOIN bookmarks b ON b.id = bookmarks_fts.rowid
      WHERE bookmarks_fts MATCH ?

      UNION

      SELECT b.id, b.url, b.title, b.description, b.created_at, b.updated_at,
             0 AS rank
      FROM bookmarks b
      JOIN bookmark_tags bt ON bt.bookmark_id = b.id
      JOIN tags t ON t.id = bt.tag_id
      WHERE lower(t.name) LIKE ?
        AND b.id NOT IN (
          SELECT bookmarks_fts.rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?
        )
    )
    SELECT id, url, title, description, created_at, updated_at, rank
    FROM search_results
    ORDER BY rank ASC, updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS count
    FROM (
      SELECT b.id
      FROM bookmarks_fts
      JOIN bookmarks b ON b.id = bookmarks_fts.rowid
      WHERE bookmarks_fts MATCH ?

      UNION

      SELECT b.id
      FROM bookmarks b
      JOIN bookmark_tags bt ON bt.bookmark_id = b.id
      JOIN tags t ON t.id = bt.tag_id
      WHERE lower(t.name) LIKE ?
    ) matches
  `;

  let rows: Array<BookmarkRow & { rank: number }>;
  let total: number;

  try {
    rows = db.prepare(searchSql).all(ftsQuery, tagPattern, ftsQuery, limit, offset) as Array<BookmarkRow & { rank: number }>;
    total = (db.prepare(countSql).get(ftsQuery, tagPattern) as { count: number }).count;
  } catch {
    return { data: [], total: 0 };
  }

  if (rows.length === 0) {
    return { data: [], total };
  }

  const bookmarkIds = rows.map((row) => row.id);
  const tagsByBookmarkId = getTagsByBookmarkId(db, bookmarkIds);
  const bookmarks = rows.map((row) => mapBookmarkRow(row, tagsByBookmarkId.get(row.id) ?? []));

  return { data: bookmarks, total };
};

export const listBookmarks = (options: {
  limit: number;
  offset: number;
  sort?: 'created_at' | 'updated_at' | 'title' | undefined;
  q?: string | undefined;
}): PaginatedResponse<Bookmark> => {
  const db = getDatabase();

  if (options.q) {
    return searchBookmarks(db, options.q, options.limit, options.offset);
  }

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

  const bookmarkIds = rows.map((row) => row.id);
  const tagsByBookmarkId = getTagsByBookmarkId(db, bookmarkIds);
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
