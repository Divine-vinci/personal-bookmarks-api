import { Hono } from 'hono';

import { listTags } from '../db/repositories/tag-repository.js';

export const createTagRoutes = () => {
  const app = new Hono();

  app.get('/', (c) => c.json(listTags()));

  return app;
};
