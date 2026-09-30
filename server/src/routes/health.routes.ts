import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../utils/http.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ok', db: 'up' });
    } catch (error) {
      console.error('[health] db check failed', error);
      res.status(200).json({ status: 'degraded', db: 'down' });
    }
  }),
);
