import type { Request, Response } from 'express';
import { asyncHandler, ApiError } from '../utils/http.js';
import { getById } from '../services/players.service.js';
import { toPublicPlayer } from '../services/players.types.js';

/** GET /api/players/:id — public profile. */
export const getPlayer = asyncHandler(async (req: Request, res: Response) => {
  const player = await getById(req.params.id);
  if (!player) throw new ApiError(404, 'player_not_found', 'No player with that id.');
  res.status(200).json({ player: toPublicPlayer(player) });
});
