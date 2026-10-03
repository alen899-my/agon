import type { Request, Response } from 'express';
import { asyncHandler, ApiError } from '../utils/http.js';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  listPublicRooms,
  memberCount,
  normalizeRoomCode,
  normalizeRoomVisibility,
  roomHostName,
  roomRoster,
} from '../services/rooms.service.js';

function roomShape(
  code: string,
  hostId: string,
  max: number,
  count: number,
  extra: { name: string; visibility: 'public' | 'private'; host_name?: string | null },
) {
  return { code, host_player_id: hostId, max_members: max, member_count: count, ...extra };
}

/** POST /api/rooms — create a server ({ name?, visibility? }), caller becomes host. */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const visibility = normalizeRoomVisibility(req.body?.visibility);
  // Name validation needs the host name for the default; validated again inside the service.
  const room = await createRoom(req.player!.id, { name: req.body?.name ?? '', visibility });
  const hostName = await roomHostName(room.code);
  res.status(201).json({ room: roomShape(room.code, room.host_player_id, room.max_members, 1, { name: room.name, visibility: room.visibility, host_name: hostName }) });
});

/** GET /api/rooms — public server browser (never includes private rooms, no roster leak). */
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const rooms = await listPublicRooms();
  res.status(200).json({ rooms });
});

/** GET /api/rooms/:code — live pre-join check + preview (no roster leak). */
export const check = asyncHandler(async (req: Request, res: Response) => {
  const code = normalizeRoomCode(req.params.code);
  const room = await getRoom(code);
  if (!room) throw new ApiError(404, 'room_not_found', 'No server with that code.');
  const [count, hostName] = await Promise.all([memberCount(code), roomHostName(code)]);
  res.status(200).json({
    room: roomShape(room.code, room.host_player_id, room.max_members, count, { name: room.name, visibility: room.visibility, host_name: hostName }),
    full: count >= room.max_members,
  });
});

/** POST /api/rooms/join { code } — join by invite code (idempotent). */
export const join = asyncHandler(async (req: Request, res: Response) => {
  const code = normalizeRoomCode(req.body?.code);
  const room = await joinRoom(code, req.player!.id);
  const [count, roster, hostName] = await Promise.all([memberCount(code), roomRoster(code), roomHostName(code)]);
  res.status(200).json({ room: roomShape(room.code, room.host_player_id, room.max_members, count, { name: room.name, visibility: room.visibility, host_name: hostName }), roster });
});

/** POST /api/rooms/leave { code } — leave; host migrates, last out deletes. */
export const leave = asyncHandler(async (req: Request, res: Response) => {
  const code = normalizeRoomCode(req.body?.code);
  await leaveRoom(code, req.player!.id);
  res.status(200).json({ left: code });
});
