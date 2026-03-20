import { createRequire } from 'node:module';

import type { HttpBindings } from '@hono/node-server';
import type { MiddlewareHandler } from 'hono';
import pino from 'pino';

import type { AppConfig } from '../config.js';
import { config } from '../config.js';

const require = createRequire(import.meta.url);
const pinoHttp = require('pino-http') as typeof import('pino-http').default;

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

const createHttpLogger = (appConfig: AppConfig = config) =>
  pinoHttp({
    logger: createLogger(appConfig),
    quietReqLogger: true,
  });

export const loggerMiddleware = (appConfig: AppConfig = config): MiddlewareHandler<NodeServerEnv> => {
  const httpLogger = createHttpLogger(appConfig);

  return async (c, next) => {
    const bindings = (c.env ?? {}) as Partial<HttpBindings>;

    if (bindings.incoming && bindings.outgoing) {
      httpLogger(bindings.incoming, bindings.outgoing);
    }

    await next();
  };
};
