-- FTS5 virtual table: content-sync with bookmarks table
-- Indexes title, url, description for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
  title,
  url,
  description,
  content='bookmarks',
  content_rowid='id'
);

-- Trigger: sync INSERT into FTS index
CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, title, url, description)
  VALUES (new.id, new.title, new.url, new.description);
END;

-- Trigger: sync DELETE from FTS index
CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, url, description)
  VALUES ('delete', old.id, old.title, old.url, old.description);
END;

-- Trigger: sync UPDATE to FTS index (delete old, insert new)
CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, url, description)
  VALUES ('delete', old.id, old.title, old.url, old.description);
  INSERT INTO bookmarks_fts(rowid, title, url, description)
  VALUES (new.id, new.title, new.url, new.description);
END;

-- Backfill existing bookmarks into FTS index
INSERT INTO bookmarks_fts(rowid, title, url, description)
SELECT id, title, url, description FROM bookmarks;
