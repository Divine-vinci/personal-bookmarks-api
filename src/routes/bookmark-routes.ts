import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ZodError } from 'zod';

import { createBookmark } from '../db/repositories/bookmark-repository.js';
import { validationErrorToException } from '../middleware/error-middleware.js';
import { createBookmarkSchema } from '../schemas/bookmark-schemas.js';

export const createBookmarkRoutes = () => {
  const app = new Hono();

  app.post(
    '/',
    zValidator('json', createBookmarkSchema, (result) => {
      if (!result.success) {
        throw validationErrorToException(result.error as ZodError);
      }
    }),
    (c) => {
      const input = c.req.valid('json');
      const bookmark = createBookmark(input);

      return c.json(bookmark, 201);
    },
  );

  return app;
};
