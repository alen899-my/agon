import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { playersRouter } from './routes/players.routes.js';
import { roomsRouter } from './routes/rooms.routes.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.CLIENT_URL }));
  app.use(express.json({ limit: '16kb' }));

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/rooms', roomsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
