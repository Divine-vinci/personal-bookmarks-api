import { Hono } from 'hono';

export const createHealthRoutes = () => {
  const app = new Hono();

  app.get('/', (c) => c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
};
