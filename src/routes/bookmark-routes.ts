import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ZodError } from 'zod';

import { createBookmark, getBookmarkById, listBookmarks } from '../db/repositories/bookmark-repository.js';
import { validationErrorToException } from '../middleware/error-middleware.js';
import { createBookmarkSchema } from '../schemas/bookmark-schemas.js';
import { idParamSchema, paginationSchema } from '../schemas/common-schemas.js';

export const createBookmarkRoutes = () => {
  const app = new Hono();

  app.get(
    '/',
    zValidator('query', paginationSchema, (result) => {
      if (!result.success) {
        throw validationErrorToException(result.error as ZodError);
      }
    }),
    (c) => {
      const options = c.req.valid('query');
      const result = listBookmarks(options);

      return c.json(result);
    },
  );

  app.get(
    '/:id',
    zValidator('param', idParamSchema, (result) => {
      if (!result.success) {
        throw validationErrorToException(result.error as ZodError);
      }
    }),
    (c) => {
      const { id } = c.req.valid('param');
      const bookmark = getBookmarkById(id);

      return c.json(bookmark);
    },
  );

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
