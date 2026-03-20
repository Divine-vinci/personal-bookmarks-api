import { Hono } from 'hono';

import { exportAllBookmarks } from '../services/export-service.js';

export const createExportRoutes = () => {
  const app = new Hono();

  app.get('/', (c) => {
    const bookmarks = exportAllBookmarks();
    return c.json(bookmarks, 200);
  });

  return app;
};
