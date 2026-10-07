import type { PedAgent, BuildSite, BuildDelta, RideState } from '../agents/livingWorld.js';

export interface RideMsg {
  steer?: number; braking?: boolean;
  id: string;
  name: string;
  kind: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  lap: number;
  state: 'countdown' | 'racing' | 'cooldown';
}

export function rideToMsg(r: RideState): RideMsg {
  return { id: r.id, name: r.name, kind: r.kind, x: r.x, z: r.z, yaw: r.yaw, speed: r.speed, lap: r.lap, state: r.state, steer: r.steer, braking: r.braking };
}
/**
 * Realtime wire protocol (v2, JSON). Mirrored by the web client in
 * `src/api/realtime.ts` — keep both sides in lockstep when changing message shapes.
 *
 * Presence only: each client simulates its own world; the server relays
 * player transforms + roster. No shared world state (traffic, parked cars).
 * v2 adds server-authoritative AI role agents (police slice): crime reports
 * up, agent state/events down. Old clients ignore unknown `t` values.
 */

export const PROTOCOL_VERSION = 2;

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

/** Client-observed crime, attributed to the sender. Server validates + scores. */
export interface CrimeReport {
  type: 'kill_ped' | 'explosion' | 'shooting' | 'hit_and_run' | 'reckless_driving';
  x: number;
  z: number;
}

export interface CopStateMsg {
  onFoot?: boolean;
  vehicleX?: number;
  vehicleZ?: number;
  id: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  mode: 'patrol' | 'respond' | 'pursue' | 'arrest' | 'return';
  lightsOn: boolean;
  suspectId: string | null;
}

export interface AgentStateMsg {
  walkers?: PedAgent[];
  sites?: BuildSite[];
  cops: CopStateMsg[];
  wanted: Record<string, number>;
  rides?: RideMsg[];
}

export interface AgentEventMsg {
  kind: 'pursuit_start' | 'busted' | 'stand_down';
  copId: string;
  suspectId: string | null;
  x: number;
  z: number;
}

export type ClientMessage =
  | { t: 'hello'; v: number; roomCode: string }
  | { t: 'pos'; p: PosPayload }
  | { t: 'race_state'; s: RaceSnapshotMsg }
  | { t: 'race_pos'; r: RacePosPayload }
  | { t: 'race_list' }
  | { t: 'crime_report'; c: CrimeReport }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; room: string; you: string; roster: RosterEntry[] }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'pos'; id: string; name: string; p: PosPayload }
  | { t: 'race_state'; id: string; name: string; s: RaceSnapshotMsg }
  | { t: 'race_pos'; id: string; name: string; r: RacePosPayload }
  | { t: 'race_dir'; races: RaceDirEntry[] }
  | { t: 'dots'; players: DotPayload[] }
  | { t: 'build_delta'; delta: BuildDelta }
  | { t: 'agent_state'; a: AgentStateMsg }
  | { t: 'agent_event'; e: AgentEventMsg }
  | { t: 'pong' }
  | { t: 'error'; code: string; message: string };
