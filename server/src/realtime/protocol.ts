/**
 * Realtime wire protocol (v1, JSON). Mirrored by the web client in
 * `src/api/realtime.ts` — keep both sides in lockstep when changing this.
 *
 * Presence only: each client simulates its own world; the server relays
 * player transforms + roster. No shared world state (traffic, parked cars).
 */

export const PROTOCOL_VERSION = 1;

/** Full transform broadcast for nearby ghosts (10 Hz). */
export interface PosPayload {
  x: number;
  z: number;
  /** Height above pavement (jump). */
  y: number;
  yaw: number;
  facing: number;
  driving: boolean;
  vehicleKind: string;
  /** Signed m/s alongside the heading. */
  speed: number;
}

/** 1 Hz compact positions for map dots (near AND far members). */
export interface DotPayload {
  id: string;
  x: number;
  z: number;
  driving: boolean;
}

export interface RosterEntry {
  id: string;
  name: string;
  role: 'host' | 'member';
}

/** Host-authoritative race snapshot (lobby/countdown/racing/finished). Relayed verbatim. */
export interface RaceSnapshotMsg {
  sentAt: number;
  phase: 'idle' | 'lobby' | 'countdown' | 'racing' | 'finished';
  laps: number;
  countdownEndsAt: number;
  startedAt: number;
  racers: { id: string; name: string; ready: boolean; vehicleKind: string; lap: number; checkpoint: number; dist: number; finished: boolean; finishMs: number; bestLapMs: number }[];
}

/** Per-racer progress @10Hz during a race. Broadcast to ALL room members (no distance cull). */
export interface RacePosPayload {
  hostId: string;
  leaving?: boolean;
  lap: number;
  cp: number;
  dist: number;
  finished: boolean;
  finishMs: number;
  bestLapMs: number;
  vehicleKind: string;
  ready: boolean;
  blinker: number;
}

/** One advertised race lobby per host inside a room (for the arena directory). */
export interface RaceDirEntry {
  hostId: string;
  hostName: string;
  laps: number;
  count: number;
  phase: RaceSnapshotMsg['phase'];
}

export type ClientMessage =
  | { t: 'hello'; v: number; roomCode: string }
  | { t: 'pos'; p: PosPayload }
  | { t: 'race_state'; s: RaceSnapshotMsg }
  | { t: 'race_pos'; r: RacePosPayload }
  | { t: 'race_list' }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; room: string; you: string; roster: RosterEntry[] }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'pos'; id: string; name: string; p: PosPayload }
  | { t: 'race_state'; id: string; name: string; s: RaceSnapshotMsg }
  | { t: 'race_pos'; id: string; name: string; r: RacePosPayload }
  | { t: 'race_dir'; races: RaceDirEntry[] }
  | { t: 'dots'; players: DotPayload[] }
  | { t: 'pong' }
  | { t: 'error'; code: string; message: string };
