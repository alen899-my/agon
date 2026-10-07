import { pool } from '../db/pool.js';
import type { BuildDelta } from './livingWorld.js';

export async function loadBuildings(roomCode: string): Promise<{ siteId: string; stage: number }[]> {
  const result = await pool.query<{ siteId: string; stage: number }>(
    'SELECT site_id AS "siteId", stage FROM buildings_delta WHERE room_code = $1', [roomCode],
  );
  return result.rows;
}
export async function saveBuilding(roomCode: string, delta: BuildDelta): Promise<void> {
  await pool.query(`INSERT INTO buildings_delta (room_code, site_id, stage)
    VALUES ($1, $2, $3) ON CONFLICT (room_code, site_id)
    DO UPDATE SET stage = GREATEST(buildings_delta.stage, EXCLUDED.stage)`,
  [roomCode, delta.siteId, delta.stage]);
}
