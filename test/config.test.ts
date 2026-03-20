import { describe, expect, it } from 'vitest';

import { createConfig } from '../src/config.js';

describe('createConfig', () => {
  it('uses documented defaults when env vars are missing or invalid', () => {
    expect(
      createConfig({
        PORT: 'invalid',
        LOG_LEVEL: 'not-a-level',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      port: 3000,
      dataDir: './data',
      corsOrigins: [],
      logLevel: 'info',
      nodeEnv: 'development',
    });
  });

  it('parses custom values from env', () => {
    expect(
      createConfig({
        PORT: '3301',
        DATA_DIR: '/tmp/bookmarks',
        CORS_ORIGINS: 'http://localhost:3001, https://my-dashboard.com ',
        LOG_LEVEL: 'debug',
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      port: 3301,
      dataDir: '/tmp/bookmarks',
      corsOrigins: ['http://localhost:3001', 'https://my-dashboard.com'],
      logLevel: 'debug',
      nodeEnv: 'test',
    });
  });

  it('falls back to default port for out-of-range values', () => {
    expect(createConfig({ PORT: '0' } as NodeJS.ProcessEnv).port).toBe(3000);
    expect(createConfig({ PORT: '-1' } as NodeJS.ProcessEnv).port).toBe(3000);
    expect(createConfig({ PORT: '99999' } as NodeJS.ProcessEnv).port).toBe(3000);
    expect(createConfig({ PORT: '65535' } as NodeJS.ProcessEnv).port).toBe(65535);
    expect(createConfig({ PORT: '65536' } as NodeJS.ProcessEnv).port).toBe(3000);
  });

  it('falls back to default port for empty string', () => {
    expect(createConfig({ PORT: '' } as NodeJS.ProcessEnv).port).toBe(3000);
  });
});
