import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const FALLBACK_SCHEMA_SQL = `-- Agon schema v1: name-only players.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen_at DESC);

-- Private servers (invite-code rooms, up to 100 members).
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  host_player_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  max_members SMALLINT NOT NULL DEFAULT 100 CHECK (max_members >= 1 AND max_members <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_code TEXT NOT NULL REFERENCES rooms (code) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, player_id)
);

CREATE INDEX IF NOT EXISTS room_members_player_idx ON room_members (player_id);
CREATE INDEX IF NOT EXISTS rooms_active_idx ON rooms (last_active_at);
`;

/** Applies schema.sql. Safe to run on every boot (IF NOT EXISTS). */
export async function migrate(): Promise<void> {
  const dir = dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    join(dir, 'schema.sql'),
    join(dir, '..', '..', 'src', 'db', 'schema.sql'),
    join(process.cwd(), 'src', 'db', 'schema.sql'),
    join(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
  ];

  let sql = '';
  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      try {
        sql = readFileSync(candidate, 'utf8');
        break;
      } catch {
        /* Continue to next candidate */
      }
    }
  }

  if (!sql) {
    sql = FALLBACK_SCHEMA_SQL;
  }

  await pool.query(sql);
}

// Allow `npm run migrate` as a one-off.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(async () => {
      console.log('[db] migration complete');
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[db] migration failed', error);
      await pool.end();
      process.exit(1);
    });
}
