import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createConfig } from '../../src/config.js';

describe('health routes', () => {
  it('returns a health payload without requiring authentication', async () => {
    const app = createApp(createConfig({ CORS_ORIGINS: '' } as NodeJS.ProcessEnv));

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);

    const body = await response.json() as { status: string; timestamp: string };

    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
