import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createConfig } from '../../src/config.js';

const ISO_8601_UTC_MILLIS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('health routes', () => {
  it('returns the expected health payload with a 200 status', async () => {
    const app = createApp(createConfig({ CORS_ORIGINS: '' } as NodeJS.ProcessEnv));

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);

    const body = await response.json() as Record<string, string>;

    expect(body).toEqual({
      status: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(body.status).toBe('ok');
    expect(body.timestamp).toMatch(ISO_8601_UTC_MILLIS_REGEX);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('returns only the status and timestamp fields', async () => {
    const app = createApp(createConfig({ CORS_ORIGINS: '' } as NodeJS.ProcessEnv));

    const response = await app.request('/api/health');
    const body = await response.json() as Record<string, string>;

    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp']);
  });

  it('returns a JSON content type', async () => {
    const app = createApp(createConfig({ CORS_ORIGINS: '' } as NodeJS.ProcessEnv));

    const response = await app.request('/api/health');

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('does not require an authorization header', async () => {
    const app = createApp(createConfig({ CORS_ORIGINS: '' } as NodeJS.ProcessEnv));

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
    });
  });
});
