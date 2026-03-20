import { createHash, randomBytes } from 'node:crypto';

import { Hono } from 'hono';

import { setApiKeyHash } from '../db/repositories/settings-repository.js';
import { logger } from '../middleware/logger-middleware.js';

export const createAuthRoutes = () => {
  const app = new Hono();

  app.post('/regenerate', (c) => {
    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    setApiKeyHash(apiKeyHash);
    logger.info({ event: 'api_key_regenerated' }, 'API key regenerated');

    return c.json({ api_key: apiKey });
  });

  return app;
};
