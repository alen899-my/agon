import type { Request, Response } from 'express';
import { asyncHandler, ApiError } from '../utils/http.js';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  memberCount,
  normalizeRoomCode,
  roomRoster,
} from '../services/rooms.service.js';

function roomShape(code: string, hostId: string, max: number, count: number) {
  return { code, host_player_id: hostId, max_members: max, member_count: count };
}

/** POST /api/rooms — create a private server, caller becomes host. */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const room = await createRoom(req.player!.id);
  res.status(201).json({ room: roomShape(room.code, room.host_player_id, room.max_members, 1) });
});

/** GET /api/rooms/:code — live pre-join check for the join form (no roster leak). */
export const check = asyncHandler(async (req: Request, res: Response) => {
  const code = normalizeRoomCode(req.params.code);
  const room = await getRoom(code);
  if (!room) throw new ApiError(404, 'room_not_found', 'No server with that code.');
  const count = await memberCount(code);
  res.status(200).json({
    room: roomShape(room.code, room.host_player_id, room.max_members, count),
    full: count >= room.max_members,
  });
});

/** POST /api/rooms/join { code } — join by invite code (idempotent). */
export const join = asyncHandler(async (req: Request, res: Response) => {
  const code = normalizeRoomCode(req.body?.code);
  const room = await joinRoom(code, req.player!.id);
  const [count, roster] = await Promise.all([memberCount(code), roomRoster(code)]);
  res.status(200).json({ room: roomShape(room.code, room.host_player_id, room.max_members, count), roster });
});

/** POST /api/rooms/leave { code } — leave; host migrates, last out deletes. */
export const leave = asyncHandler(async (req: Request, res: Response) => {
  const code = normalizeRoomCode(req.body?.code);
  await leaveRoom(code, req.player!.id);
  res.status(200).json({ left: code });
});
