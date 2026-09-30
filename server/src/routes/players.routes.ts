import { Router } from 'express';
import { getPlayer } from '../controllers/players.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const playersRouter = Router();

playersRouter.use(requireAuth);
playersRouter.get('/:id', getPlayer);
