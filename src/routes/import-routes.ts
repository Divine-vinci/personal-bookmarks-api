import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { invalidRequest } from '../middleware/error-middleware.js';
import { importBookmarks, parseNetscapeHtml } from '../services/import-service.js';

const IMPORT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const IMPORT_BODY_LIMIT_RESPONSE = {
  error: {
    code: 'invalid_request',
    message: 'Request body exceeds 10MB limit',
  },
} as const;

const getUploadedFile = (value: unknown): File | null => {
  if (value instanceof File) {
    return value;
  }

  if (Array.isArray(value)) {
    const [first] = value;
    return first instanceof File ? first : null;
  }

  return null;
};

export const createImportRoutes = () => {
  const app = new Hono();

  app.use('*', bodyLimit({
    maxSize: IMPORT_MAX_SIZE_BYTES,
    onError: (c) => c.json(IMPORT_BODY_LIMIT_RESPONSE, 400),
  }));

  app.post('/', async (c) => {
    const contentType = c.req.header('content-type')?.toLowerCase() ?? '';

    if (!contentType.includes('multipart/form-data')) {
      throw invalidRequest('Expected multipart/form-data with a file field');
    }

    const body = await c.req.parseBody();
    const file = getUploadedFile(body.file);

    if (!file) {
      throw invalidRequest('Bookmark file is required');
    }

    const html = await file.text();
    const result = importBookmarks(parseNetscapeHtml(html));

    return c.json(result);
  });

  return app;
};
