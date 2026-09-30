import { Router } from 'express';
import { check, create, join, leave } from '../controllers/rooms.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const roomsRouter = Router();

roomsRouter.use(requireAuth);
roomsRouter.post('/', create);
roomsRouter.get('/:code', check);
roomsRouter.post('/join', join);
roomsRouter.post('/leave', leave);
