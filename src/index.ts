import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';

import { serve } from '@hono/node-server';

import { app } from './app.js';
import { config } from './config.js';
import { initDatabase } from './db/database.js';
import { getApiKeyHash, setApiKeyHash } from './db/repositories/settings-repository.js';
import { logger } from './middleware/logger-middleware.js';

export const ensureApiKeyConfigured = (): void => {
  const existingApiKeyHash = getApiKeyHash();

  if (existingApiKeyHash) {
    logger.info({ event: 'api_key_already_configured' }, 'API key already configured');
    return;
  }

  const apiKey = randomBytes(32).toString('hex');
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

  setApiKeyHash(apiKeyHash);
  logger.info({ event: 'api_key_generated', apiKey }, 'Generated initial API key');
};

export const startServer = () => {
  fs.mkdirSync(config.dataDir, { recursive: true });
  initDatabase();
  ensureApiKeyConfigured();

  return serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      logger.info(
        {
          event: 'server_started',
          host: info.address,
          port: info.port,
        },
        'personal-bookmarks-api server started',
      );
    },
  );
};

if (!process.env.VITEST) {
  startServer();
}
