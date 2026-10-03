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
  name TEXT NOT NULL DEFAULT 'District Server',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
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
-- NOTE: rooms_public_active_idx is created below AFTER ensuring the v2 columns.
-- v2: named + public/private servers (idempotent for existing databases).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'District Server';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_visibility_check') THEN
    ALTER TABLE rooms ADD CONSTRAINT rooms_visibility_check CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;
`;

/** v2: named + public/private servers. Runs on every boot so existing databases heal. */
const ENSURE_V2_STATEMENTS = [
  "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'District Server'",
  "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'",
  'CREATE INDEX IF NOT EXISTS rooms_public_active_idx ON rooms (visibility, last_active_at DESC)',
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_visibility_check') THEN
      ALTER TABLE rooms ADD CONSTRAINT rooms_visibility_check CHECK (visibility IN ('public', 'private'));
    END IF;
  END $$`,
];

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
  for (const statement of ENSURE_V2_STATEMENTS) {
    await pool.query(statement);
  }
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
