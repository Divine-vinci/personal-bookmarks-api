import type { Tag } from '../../types.js';
import { getDatabase } from '../database.js';

export const listTags = (): Tag[] => {
  const db = getDatabase();

  return db.prepare(
    `SELECT t.name, COUNT(bt.bookmark_id) AS count
     FROM tags t
     INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
     GROUP BY t.id, t.name
     HAVING COUNT(bt.bookmark_id) > 0
     ORDER BY t.name ASC`,
  ).all() as Tag[];
};
