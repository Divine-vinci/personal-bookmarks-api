import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

import type { ApiError, ValidationErrorDetail } from '../types.js';
import { logger } from './logger-middleware.js';

const JSON_CONTENT_TYPE = 'application/json';
const INVALID_URL_MESSAGE = 'Invalid url: must be a valid URL';

type HttpErrorLike = Error & {
  getResponse: () => Response;
  status?: number;
};

const createErrorResponse = (
  code: string,
  message: string,
  details?: ValidationErrorDetail[],
): ApiError => {
  return details && details.length > 0
    ? { error: { code, message, details } }
    : { error: { code, message } };
};

const createJsonHttpException = (status: ContentfulStatusCode, body: ApiError) => {
  return new HTTPException(status, {
    message: body.error.message,
    res: new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': JSON_CONTENT_TYPE,
      },
    }),
  });
};

const isHttpError = (error: unknown): error is HttpErrorLike => {
  return typeof error === 'object'
    && error !== null
    && 'getResponse' in error
    && typeof error.getResponse === 'function';
};

const parseHttpExceptionResponse = async (error: HttpErrorLike): Promise<ApiError | null> => {
  const response = error.getResponse();
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes(JSON_CONTENT_TYPE)) {
    try {
      const data = await response.clone().json();

      if (
        typeof data === 'object'
        && data !== null
        && 'error' in data
        && typeof data.error === 'object'
        && data.error !== null
        && 'code' in data.error
        && 'message' in data.error
        && typeof data.error.code === 'string'
        && typeof data.error.message === 'string'
      ) {
        const details = 'details' in data.error && Array.isArray(data.error.details)
          ? data.error.details.filter((detail: unknown): detail is ValidationErrorDetail => (
            typeof detail === 'object'
            && detail !== null
            && 'field' in detail
            && 'message' in detail
            && typeof detail.field === 'string'
            && typeof detail.message === 'string'
          ))
          : undefined;

        return createErrorResponse(data.error.code, data.error.message, details);
      }
    }
    catch {
      return null;
    }
  }

  const text = await response.text();
  const status = typeof error.status === 'number' ? error.status : response.status;
  return createErrorResponse(status >= 500 ? 'internal_error' : 'invalid_request', text || error.message);
};

const mapZodIssueToDetail = (issue: ZodError['issues'][number]): ValidationErrorDetail => ({
  field: issue.path.length > 0 ? issue.path.map(String).join('.') : 'request',
  message: issue.message,
});

const isMalformedJsonError = (error: unknown): error is SyntaxError => {
  return error instanceof SyntaxError && /JSON/i.test(error.message);
};

const isBodyLimitError = (error: unknown): boolean => {
  return isHttpError(error) && error.status === 413;
};

export const isInvalidUrlZodError = (error: ZodError): boolean => {
  return error.issues.some((issue) => (
    issue.path[0] === 'url'
    && issue.code === 'invalid_format'
    && 'format' in issue
    && issue.format === 'url'
  ));
};

export const validationErrorToException = (error: ZodError): HTTPException | ZodError => {
  if (isInvalidUrlZodError(error)) {
    return invalidUrl(INVALID_URL_MESSAGE);
  }

  return error;
};

export const notFound = (message = 'Resource not found') => {
  return createJsonHttpException(404, createErrorResponse('not_found', message));
};

export const conflict = (message = 'Resource already exists') => {
  return createJsonHttpException(409, createErrorResponse('duplicate_url', message));
};

export const invalidUrl = (message = INVALID_URL_MESSAGE) => {
  return createJsonHttpException(400, createErrorResponse('invalid_url', message));
};

export const invalidRequest = (message = 'Invalid request body') => {
  return createJsonHttpException(400, createErrorResponse('invalid_request', message));
};

export const errorHandler = (async (error: unknown, c) => {
  if (error instanceof ZodError) {
    const details = error.issues.map(mapZodIssueToDetail);
    return c.json(createErrorResponse('validation_error', 'Validation failed', details), 422);
  }

  if (isMalformedJsonError(error)) {
    return c.json(createErrorResponse('invalid_request', 'Invalid JSON body'), 400);
  }

  if (isHttpError(error)) {
    if (isBodyLimitError(error)) {
      return c.json(createErrorResponse('invalid_request', 'Request body exceeds 1MB limit'), 400);
    }

    const body = await parseHttpExceptionResponse(error);
    const status = typeof error.status === 'number' ? error.status : error.getResponse().status;

    if (body) {
      return c.json(body, status as ContentfulStatusCode);
    }

    return c.json(
      createErrorResponse('invalid_request', error.message || 'Invalid request'),
      status as ContentfulStatusCode,
    );
  }

  logger.error({ err: error, event: 'unhandled_error', path: c.req.path }, 'Unhandled application error');
  return c.json(createErrorResponse('internal_error', 'Internal server error'), 500);
}) satisfies ErrorHandler;

export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(createErrorResponse('not_found', 'Route not found'), 404);
};
