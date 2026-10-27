import { Router } from 'express';
import { pool } from '../db/pool.js';
import { redis } from '../db/redis.js';

export const healthRouter = Router();

healthRouter.get('/live', (req, res) => res.json({ status: 'ok' }));

healthRouter.get('/ready', async (req, res) => {
  const checks = { postgres: 'down', redis: 'down' };
  try {
    await pool.query('SELECT 1');
    checks.postgres = 'up';
  } catch {
    // reported below
  }
  try {
    await redis.ping();
    checks.redis = 'up';
  } catch {
    // reported below
  }

  const ready = Object.values(checks).every((value) => value === 'up');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', checks });
});
