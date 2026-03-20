import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { createConfig } from '../src/config.js';

describe('createApp', () => {
  it('does not return CORS headers when no origins are configured', async () => {
    const app = createApp(
      createConfig({
        CORS_ORIGINS: '',
      } as NodeJS.ProcessEnv),
    );

    const response = await app.request('/api/bookmarks', {
      headers: {
        Origin: 'http://localhost:3001',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns CORS headers for configured origins', async () => {
    const app = createApp(
      createConfig({
        CORS_ORIGINS: 'http://localhost:3001,https://my-dashboard.com',
      } as NodeJS.ProcessEnv),
    );

    const response = await app.request('/api/bookmarks', {
      headers: {
        Origin: 'https://my-dashboard.com',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('https://my-dashboard.com');
  });

  it('does not return CORS headers for non-configured origins', async () => {
    const app = createApp(
      createConfig({
        CORS_ORIGINS: 'http://localhost:3001',
      } as NodeJS.ProcessEnv),
    );

    const response = await app.request('/api/bookmarks', {
      headers: {
        Origin: 'https://evil-site.com',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('protects bookmark routes with auth middleware', async () => {
    const app = createApp();

    const response = await app.request('/api/bookmarks');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key',
      },
    });
  });

  it('keeps the health route public', async () => {
    const app = createApp();

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
    });
  });
});
