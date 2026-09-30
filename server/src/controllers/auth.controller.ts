import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/http.js';
import { findOrCreateByName, getById, normalizeName } from '../services/players.service.js';
import { toPublicPlayer } from '../services/players.types.js';
import { signToken } from '../services/tokens.service.js';

/** POST /api/auth/login — name-only login. Creates the name on first use. */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const name = normalizeName(req.body?.name);
  const player = await findOrCreateByName(name);
  const token = signToken(player.id, player.name);
  res.status(200).json({ token, player: toPublicPlayer(player) });
});

/** GET /api/auth/me — current session player. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const player = await getById(req.player!.id);
  res.status(200).json({ player: player ? toPublicPlayer(player) : null });
});
