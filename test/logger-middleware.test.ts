import { describe, expect, it, vi } from 'vitest';

import { createConfig } from '../src/config.js';
import { createLogger, loggerMiddleware } from '../src/middleware/logger-middleware.js';

describe('createLogger', () => {
  it('uses LOG_LEVEL from config', () => {
    const logger = createLogger(
      createConfig({
        LOG_LEVEL: 'debug',
      } as NodeJS.ProcessEnv),
    );

    expect(logger.level).toBe('debug');
  });

  it('writes structured JSON logs', () => {
    const writes: string[] = [];
    const destination = {
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    };

    const logger = createLogger(createConfig(), destination as never);
    logger.info({ event: 'test_event', port: 3456 }, 'server started');

    expect(writes).toHaveLength(1);

    const payload = JSON.parse(writes[0] as string) as {
      level: number;
      time: string;
      event: string;
      port: number;
      msg: string;
    };

    expect(payload.level).toBe(30);
    expect(payload.event).toBe('test_event');
    expect(payload.port).toBe(3456);
    expect(payload.msg).toBe('server started');
    expect(typeof payload.time).toBe('string');
  });
});

describe('loggerMiddleware', () => {
  it('calls next when node bindings are not present', async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    const middleware = loggerMiddleware(createConfig());

    await middleware({ env: {} } as never, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
