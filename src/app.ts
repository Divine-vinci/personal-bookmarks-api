import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppConfig } from './config.js';
import { config } from './config.js';
import { loggerMiddleware } from './middleware/logger-middleware.js';

export const createApp = (appConfig: AppConfig = config) => {
  const app = new Hono();

  if (appConfig.corsOrigins.length > 0) {
    app.use('*', cors({ origin: appConfig.corsOrigins }));
  }

  app.use('*', loggerMiddleware(appConfig));

  app.route('/bookmarks', new Hono());
  app.route('/tags', new Hono());
  app.route('/auth', new Hono());

  return app;
};

export const app = createApp();
