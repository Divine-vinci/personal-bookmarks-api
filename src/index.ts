import { serve } from '@hono/node-server';

import { app } from './app.js';
import { config } from './config.js';
import { logger } from './middleware/logger-middleware.js';

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
