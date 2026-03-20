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
import { createExportRoutes } from './routes/export-routes.js';
import { createHealthRoutes } from './routes/health-routes.js';
import { createImportRoutes } from './routes/import-routes.js';
import { createTagRoutes } from './routes/tag-routes.js';

const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const IMPORT_PATH = '/api/import';
const defaultBodyLimit = bodyLimit({ maxSize: DEFAULT_BODY_LIMIT_BYTES });

export const createApp = (appConfig: AppConfig = config) => {
  const app = new Hono();

  app.use('*', loggerMiddleware(appConfig));

  if (appConfig.corsOrigins.length > 0) {
    app.use('*', cors({ origin: appConfig.corsOrigins }));
  }

  app.use('*', async (c, next) => {
    if (c.req.path === IMPORT_PATH) {
      await next();
      return;
    }

    await defaultBodyLimit(c, next);
  });
  app.use('*', authMiddleware());

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.route('/api/health', createHealthRoutes());
  app.route('/api/auth', createAuthRoutes());
  app.route('/api/bookmarks', createBookmarkRoutes());
  app.route('/api/import', createImportRoutes());
  app.route('/api/tags', createTagRoutes());
  app.route('/api/export', createExportRoutes());

  return app;
};

export const app = createApp();
