-- Agon schema v2: name-only players, named public/private servers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen_at DESC);

-- Invite-code rooms, up to 100 members. Public rooms appear in the server browser.
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
-- NOTE: rooms_public_active_idx is created by migrate() AFTER ensuring the
-- v2 columns, so booting against a v1 database cannot fail here.

CREATE TABLE IF NOT EXISTS buildings_delta (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  stage SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 4),
  PRIMARY KEY (room_code, site_id)
);
