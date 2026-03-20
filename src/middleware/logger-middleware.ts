import type { HttpBindings } from '@hono/node-server';
import type { MiddlewareHandler } from 'hono';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import type { AppConfig } from '../config.js';
import { config } from '../config.js';

export type NodeServerEnv = {
  Bindings: HttpBindings;
};

export const createLogger = (
  appConfig: AppConfig = config,
  destination?: pino.DestinationStream,
) =>
  pino({
    level: appConfig.logLevel,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  }, destination);

export const logger = createLogger();

const createHttpLogger = (parentLogger: pino.Logger) =>
  pinoHttp({
    logger: parentLogger,
    quietReqLogger: true,
  });

export const loggerMiddleware = (appConfig: AppConfig = config): MiddlewareHandler<NodeServerEnv> => {
  const appLogger = createLogger(appConfig);
  const httpLogger = createHttpLogger(appLogger);

  return async (c, next) => {
    const bindings = (c.env ?? {}) as Partial<HttpBindings>;

    if (bindings.incoming && bindings.outgoing) {
      httpLogger(bindings.incoming, bindings.outgoing);
    }

    await next();
  };
};
