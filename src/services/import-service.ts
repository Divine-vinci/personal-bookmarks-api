import { parse as parseHtml } from 'node-html-parser';

import type { ImportResult } from '../types.js';
import { getDatabase } from '../db/database.js';

type StackEntry = string | null | typeof ROOT_ENTRY;

const ROOT_ENTRY = Symbol('root-entry');
const MAX_TITLE_LENGTH = 500;
const BROWSER_ROOT_FOLDERS = new Set([
  'bookmarks bar',
  'bookmarks menu',
  'other bookmarks',
  'favourites',
  'favorites',
  'reading list',
  'mobile bookmarks',
  'bookmarks toolbar',
  'toolbar',
]);

export interface ParsedBookmark {
  url: string;
  title: string;
  tags: string[];
}

const decodeHtml = (value: string): string => {
  if (!value.includes('&')) {
    return value;
  }

  return parseHtml(`<span>${value}</span>`).textContent;
};

const normalizeText = (value: string): string => decodeHtml(value)
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeFolderName = (value: string): string => normalizeText(value).toLowerCase();

const normalizeTitle = (value: string, fallbackUrl: string): string => {
  const normalized = normalizeText(value);
  return (normalized || fallbackUrl).slice(0, MAX_TITLE_LENGTH);
};

const extractHref = (attributes: string): string => {
  const match = /\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
  return normalizeText(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
};

const currentTags = (stack: StackEntry[]): string[] => stack.filter((entry): entry is string => typeof entry === 'string');

const folderDepth = (stack: StackEntry[]): number => stack.filter((entry) => entry !== ROOT_ENTRY).length;

const isValidUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  }
  catch {
    return false;
  }
};

export const parseNetscapeHtml = (html: string): ParsedBookmark[] => {
  const bookmarks: ParsedBookmark[] = [];
  const stack: StackEntry[] = [];
  let pendingFolder: string | null | undefined;

  const tokenRegex = /<DT>\s*<H3\b[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A\b([^>]*)>([\s\S]*?)<\/A>|<\/?DL\b[^>]*>/gi;

  for (const match of html.matchAll(tokenRegex)) {
    const token = match[0];
    const folderText = match[1];
    const anchorAttributes = match[2];
    const anchorText = match[3];

    if (/^<DT>\s*<H3/i.test(token)) {
      const folderName = normalizeFolderName(folderText ?? '');
      const skipAsBrowserRoot = folderDepth(stack) === 0 && BROWSER_ROOT_FOLDERS.has(folderName);
      pendingFolder = folderName.length > 0 && !skipAsBrowserRoot ? folderName : null;
      continue;
    }

    if (/^<DT>\s*<A/i.test(token)) {
      const url = extractHref(anchorAttributes ?? '');
      bookmarks.push({
        url,
        title: normalizeTitle(anchorText ?? '', url),
        tags: currentTags(stack),
      });
      continue;
    }

    if (/^<DL/i.test(token)) {
      stack.push(pendingFolder ?? ROOT_ENTRY);
      pendingFolder = undefined;
      continue;
    }

    if (/^<\/DL/i.test(token) && stack.length > 0) {
      stack.pop();
      pendingFolder = undefined;
    }
  }

  return bookmarks;
};

export const importBookmarks = (parsedBookmarks: ParsedBookmark[]): ImportResult => {
  if (parsedBookmarks.length === 0) {
    return { imported: 0, failed: 0, errors: [] };
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const errors: string[] = [];
  const validBookmarks: Array<ParsedBookmark & { index: number }> = [];
  let failed = 0;

  for (const [index, bookmark] of parsedBookmarks.entries()) {
    if (!isValidUrl(bookmark.url)) {
      failed += 1;
      errors.push(`Bookmark ${index + 1}: invalid URL "${bookmark.url || '[empty]'}"`);
      continue;
    }

    validBookmarks.push({
      index,
      url: bookmark.url,
      title: normalizeTitle(bookmark.title, bookmark.url),
      tags: Array.from(new Set(bookmark.tags.map((tag) => normalizeFolderName(tag)).filter(Boolean))),
    });
  }

  const insertBookmark = db.prepare(
    `INSERT OR IGNORE INTO bookmarks (url, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const selectTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insertBookmarkTag = db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');

  const importTx = db.transaction((rows: Array<ParsedBookmark & { index: number }>): ImportResult => {
    let imported = 0;

    for (const row of rows) {
      const result = insertBookmark.run(row.url, row.title, null, now, now);

      if (result.changes === 0) {
        failed += 1;
        errors.push(`Bookmark ${row.index + 1}: duplicate URL skipped "${row.url}"`);
        continue;
      }

      const bookmarkId = Number(result.lastInsertRowid);

      for (const tagName of row.tags) {
        insertTag.run(tagName);
        const tagRow = selectTag.get(tagName) as { id: number } | undefined;

        if (!tagRow) {
          throw new Error(`Failed to resolve tag after upsert: ${tagName}`);
        }

        insertBookmarkTag.run(bookmarkId, tagRow.id);
      }

      imported += 1;
    }

    return {
      imported,
      failed,
      errors,
    };
  });

  return importTx(validBookmarks);
};
