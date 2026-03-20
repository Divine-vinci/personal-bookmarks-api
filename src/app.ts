import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppConfig } from './config.js';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { loggerMiddleware } from './middleware/logger-middleware.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { createHealthRoutes } from './routes/health-routes.js';

export const createApp = (appConfig: AppConfig = config) => {
  const app = new Hono();

  if (appConfig.corsOrigins.length > 0) {
    app.use('*', cors({ origin: appConfig.corsOrigins }));
  }

  app.use('*', loggerMiddleware(appConfig));
  app.use('*', authMiddleware());

  app.route('/api/health', createHealthRoutes());
  app.route('/api/auth', createAuthRoutes());
  app.route('/api/bookmarks', new Hono());
  app.route('/api/tags', new Hono());

  return app;
};

export const app = createApp();
