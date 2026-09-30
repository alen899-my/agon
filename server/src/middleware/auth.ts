import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getById, touchLastSeen } from '../services/players.service.js';
import { verifyToken } from '../services/tokens.service.js';
import { ApiError } from '../utils/http.js';

export interface AuthPlayer {
  id: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      player?: AuthPlayer;
    }
  }
}

/** Requires `Authorization: Bearer <jwt>`, attaches the player, refreshes last_seen. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new ApiError(401, 'unauthorized', 'Missing bearer token.');
    }
    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new ApiError(401, 'token_expired', 'Session expired. Enter your name again.');
      if (error instanceof jwt.JsonWebTokenError) throw new ApiError(401, 'invalid_token', 'Invalid session token.');
      throw error;
    }
    const player = await getById(payload.sub);
    if (!player) throw new ApiError(401, 'unknown_player', 'Player no longer exists.');
    req.player = { id: player.id, name: player.name };
    void touchLastSeen(player.id).catch((error) => console.error('[auth] last_seen update failed', error));
    next();
  } catch (error) {
    next(error);
  }
}
