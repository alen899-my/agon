import { pool } from '../db/pool.js';
import { ApiError } from '../utils/http.js';
import type { Player } from './players.types.js';

const NAME_PATTERN = /^[\p{L}\p{N} _.\-]+$/u;
export const MAX_NAME_LENGTH = 24;

/** Normalizes + validates a display name. Throws 400 ApiError when invalid. */
export function normalizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    throw new ApiError(400, 'invalid_name', `Name must be 1–${MAX_NAME_LENGTH} characters.`);
  }
  if (!NAME_PATTERN.test(name)) {
    throw new ApiError(400, 'invalid_name', 'Name may only contain letters, numbers, spaces and _ . -');
  }
  return name;
}

/** Name-only login: existing names return, new names are created. */
export async function findOrCreateByName(name: string): Promise<Player> {
  const { rows } = await pool.query<Player>(
    `INSERT INTO players (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET last_seen_at = now()
     RETURNING id, name, created_at, last_seen_at`,
    [name],
  );
  return rows[0];
}

export async function getById(id: string): Promise<Player | null> {
  const { rows } = await pool.query<Player>(
    'SELECT id, name, created_at, last_seen_at FROM players WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function touchLastSeen(id: string): Promise<void> {
  await pool.query('UPDATE players SET last_seen_at = now() WHERE id = $1', [id]);
}
