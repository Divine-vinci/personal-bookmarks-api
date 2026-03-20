import { getDatabase } from '../database.js';

const API_KEY_HASH_SETTING = 'api_key_hash';

type SettingRow = {
  value: string;
};

export const getApiKeyHash = (): string | null => {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).get(API_KEY_HASH_SETTING) as SettingRow | undefined;

  return row?.value ?? null;
};

export const setApiKeyHash = (hash: string): void => {
  const db = getDatabase();

  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(API_KEY_HASH_SETTING, hash);
};
