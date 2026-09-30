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

export type ClientMessage =
  | { t: 'hello'; v: number; roomCode: string }
  | { t: 'pos'; p: PosPayload }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; room: string; you: string; roster: RosterEntry[] }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'pos'; id: string; name: string; p: PosPayload }
  | { t: 'dots'; players: DotPayload[] }
  | { t: 'pong' }
  | { t: 'error'; code: string; message: string };
