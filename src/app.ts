import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import type { AppConfig } from './config.js';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error-middleware.js';
import { loggerMiddleware } from './middleware/logger-middleware.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { createBookmarkRoutes } from './routes/bookmark-routes.js';
import { createHealthRoutes } from './routes/health-routes.js';

export const createApp = (appConfig: AppConfig = config) => {
  const app = new Hono();

  app.use('*', loggerMiddleware(appConfig));

  if (appConfig.corsOrigins.length > 0) {
    app.use('*', cors({ origin: appConfig.corsOrigins }));
  }

  app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));
  app.use('*', authMiddleware());

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route('/api/health', createHealthRoutes());
  app.route('/api/auth', createAuthRoutes());
  app.route('/api/bookmarks', createBookmarkRoutes());
  app.route('/api/tags', new Hono());

  return app;
};

export const app = createApp();
