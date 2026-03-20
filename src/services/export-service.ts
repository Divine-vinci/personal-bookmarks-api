import type { Bookmark } from '../types.js';
import { getDatabase } from '../db/database.js';

type BookmarkRow = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type BookmarkTagRow = {
  bookmark_id: number;
  name: string;
};

export const exportAllBookmarks = (): Bookmark[] => {
  const db = getDatabase();
  const bookmarkRows = db.prepare(
    `SELECT id, url, title, description, created_at, updated_at
     FROM bookmarks
     ORDER BY created_at ASC`,
  ).all() as BookmarkRow[];

  if (bookmarkRows.length === 0) {
    return [];
  }

  const tagRows = db.prepare(
    `SELECT bt.bookmark_id, t.name
     FROM bookmark_tags bt
     INNER JOIN tags t ON t.id = bt.tag_id
     ORDER BY t.name ASC`,
  ).all() as BookmarkTagRow[];

  const tagsByBookmarkId = new Map<number, string[]>();

  for (const tagRow of tagRows) {
    const existingTags = tagsByBookmarkId.get(tagRow.bookmark_id);

    if (existingTags) {
      existingTags.push(tagRow.name);
      continue;
    }

    tagsByBookmarkId.set(tagRow.bookmark_id, [tagRow.name]);
  }

  return bookmarkRows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    tags: tagsByBookmarkId.get(row.id) ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};
