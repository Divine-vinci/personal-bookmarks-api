import fs from 'node:fs';

import { serve } from '@hono/node-server';

import { app } from './app.js';
import { config } from './config.js';
import { initDatabase } from './db/database.js';
import { logger } from './middleware/logger-middleware.js';

fs.mkdirSync(config.dataDir, { recursive: true });
initDatabase();

serve(
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
