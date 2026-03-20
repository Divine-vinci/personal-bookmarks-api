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

    const response = await app.request('/bookmarks', {
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

    const response = await app.request('/bookmarks', {
      headers: {
        Origin: 'https://my-dashboard.com',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('https://my-dashboard.com');
  });
});
