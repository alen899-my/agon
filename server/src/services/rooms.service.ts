import { randomInt } from 'node:crypto';
import { pool } from '../db/pool.js';
import { ApiError } from '../utils/http.js';

export const MAX_ROOM_MEMBERS = 100;
export const ROOM_CODE_LENGTH = 6;
/** Crockford-ish alphabet without ambiguous 0/O/1/I. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_TTL_HOURS = 24;

export interface Room {
  code: string;
  host_player_id: string;
  max_members: number;
  created_at: string;
  last_active_at: string;
}

export interface RoomRosterEntry {
  player_id: string;
  name: string;
  role: 'host' | 'member';
  joined_at: string;
}

/** Random 6-char room code. Pure — unit-testable without a database. */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Normalizes user-typed codes (case/space tolerant). Throws 400 when malformed. */
export function normalizeRoomCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[\s-]+/g, '') : '';
  if (!new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code)) {
    throw new ApiError(400, 'invalid_code', 'Server codes are 6 characters (A–Z, 2–9).');
  }
  return code;
}

function isExpired(room: Room): boolean {
  return Date.now() - new Date(room.last_active_at).getTime() > ROOM_TTL_HOURS * 3_600_000;
}

export async function createRoom(hostPlayerId: string): Promise<Room> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const { rows } = await client.query<Room>(
        'INSERT INTO rooms (code, host_player_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING *', [code, hostPlayerId]);
      if (!rows[0]) continue;
      await client.query("INSERT INTO room_members (room_code, player_id, role) VALUES ($1, $2, 'host')", [code, hostPlayerId]);
      await client.query('COMMIT');
      return rows[0];
    }
    throw new ApiError(500, 'room_create_failed', 'Could not create a server. Please try again.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function getRoom(code: string): Promise<Room | null> {
  const { rows } = await pool.query<Room>('SELECT * FROM rooms WHERE code = $1', [code]);
  return rows[0] ?? null;
}

export async function memberCount(code: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM room_members WHERE room_code = $1',
    [code],
  );
  return Number(rows[0].count);
}

async function deleteRoom(code: string): Promise<void> {
  await pool.query('DELETE FROM rooms WHERE code = $1', [code]);
}

export { deleteRoom };

/** Membership row for realtime admission (null when not a member). */
export async function getMembership(
  code: string,
  playerId: string,
): Promise<{ role: 'host' | 'member' } | null> {
  const { rows } = await pool.query<{ role: 'host' | 'member' }>(
    'SELECT role FROM room_members WHERE room_code = $1 AND player_id = $2',
    [code, playerId],
  );
  return rows[0] ?? null;
}

export async function touchRoomActivity(code: string): Promise<void> {
  await pool.query('UPDATE rooms SET last_active_at = now() WHERE code = $1', [code]);
}

/** Join by invite code. Idempotent for existing members. Enforces the 100-player cap. */
export async function joinRoom(code: string, playerId: string): Promise<Room> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize capacity checks, duplicate joins, and concurrent leaves per room.
    const { rows } = await client.query<Room>('SELECT * FROM rooms WHERE code = $1 FOR UPDATE', [code]);
    const room = rows[0];
    if (!room) throw new ApiError(404, 'room_not_found', 'No server with that code. Check the code with the host.');
    if (isExpired(room)) throw new ApiError(410, 'room_expired', 'That server expired. Ask the host for a new code.');
    const existing = await client.query('SELECT 1 FROM room_members WHERE room_code = $1 AND player_id = $2', [code, playerId]);
    if (existing.rowCount === 0) {
      const count = await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM room_members WHERE room_code = $1', [code]);
      if (Number(count.rows[0].count) >= room.max_members) throw new ApiError(409, 'room_full', 'That server is full. Ask the host to free a place, then try again.');
      await client.query('INSERT INTO room_members (room_code, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [code, playerId]);
    }
    const updated = await client.query<Room>('UPDATE rooms SET last_active_at = now() WHERE code = $1 RETURNING *', [code]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/** Membership changes share the room lock with joining and host migration. */
export async function leaveRoom(code: string, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<Room>('SELECT * FROM rooms WHERE code = $1 FOR UPDATE', [code]);
    const room = rows[0];
    if (room) {
      await client.query('DELETE FROM room_members WHERE room_code = $1 AND player_id = $2', [code, playerId]);
      const remaining = await client.query<{ player_id: string }>(
        'SELECT player_id FROM room_members WHERE room_code = $1 ORDER BY joined_at ASC, player_id ASC LIMIT 1', [code]);
      if (remaining.rowCount === 0) await client.query('DELETE FROM rooms WHERE code = $1', [code]);
      else {
        if (room.host_player_id === playerId) {
          const next = remaining.rows[0].player_id;
          await client.query('UPDATE rooms SET host_player_id = $1 WHERE code = $2', [next, code]);
          await client.query("UPDATE room_members SET role = 'host' WHERE room_code = $1 AND player_id = $2", [code, next]);
        }
        await client.query('UPDATE rooms SET last_active_at = now() WHERE code = $1', [code]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function roomRoster(code: string): Promise<RoomRosterEntry[]> {
  const { rows } = await pool.query<RoomRosterEntry>(
    `SELECT m.player_id, p.name, m.role, m.joined_at FROM room_members m
     JOIN players p ON p.id = m.player_id WHERE m.room_code = $1 ORDER BY m.joined_at ASC`,
    [code],
  );
  return rows;
}

/** Deletes rooms idle longer than the TTL. Returns the pruned count. */
export async function pruneExpiredRooms(): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM rooms WHERE last_active_at < now() - make_interval(hours => $1)',
    [ROOM_TTL_HOURS],
  );
  return rowCount ?? 0;
}
