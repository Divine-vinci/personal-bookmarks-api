import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ZodError } from 'zod';

import { createBookmark, deleteBookmark, getBookmarkById, listBookmarks, updateBookmark } from '../db/repositories/bookmark-repository.js';
import { validationErrorToException } from '../middleware/error-middleware.js';
import { createBookmarkSchema, updateBookmarkSchema } from '../schemas/bookmark-schemas.js';
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

  app.delete(
    '/:id',
    zValidator('param', idParamSchema, (result) => {
      if (!result.success) {
        throw validationErrorToException(result.error as ZodError);
      }
    }),
    (c) => {
      const { id } = c.req.valid('param');
      deleteBookmark(id);

      return c.body(null, 204);
    },
  );

  app.put(
    '/:id',
    zValidator('param', idParamSchema, (result) => {
      if (!result.success) {
        throw validationErrorToException(result.error as ZodError);
      }
    }),
    zValidator('json', updateBookmarkSchema, (result) => {
      if (!result.success) {
        throw validationErrorToException(result.error as ZodError);
      }
    }),
    (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const bookmark = updateBookmark(id, input);

      return c.json(bookmark);
    },
  );

  return app;
};
