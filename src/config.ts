export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface AppConfig {
  port: number;
  dataDir: string;
  corsOrigins: string[];
  logLevel: LogLevel;
  nodeEnv: string;
}

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const DEFAULT_DATA_DIR = './data';
const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_NODE_ENV = 'development';
const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : DEFAULT_PORT;
};

const parseCorsOrigins = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

const parseLogLevel = (value: string | undefined): LogLevel => {
  if (value && VALID_LOG_LEVELS.has(value)) {
    return value as LogLevel;
  }

  return DEFAULT_LOG_LEVEL;
};

export const createConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  port: parsePort(env.PORT),
  dataDir: env.DATA_DIR || DEFAULT_DATA_DIR,
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  logLevel: parseLogLevel(env.LOG_LEVEL),
  nodeEnv: env.NODE_ENV || DEFAULT_NODE_ENV,
});

export const config = createConfig();
