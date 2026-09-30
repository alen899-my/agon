import type { WebSocket } from 'ws';
import {
  MAX_ROOM_MEMBERS,
  ROOM_TTL_HOURS,
  deleteRoom,
  getMembership,
  getRoom,
  normalizeRoomCode,
  touchRoomActivity,
} from '../services/rooms.service.js';
import { ApiError } from '../utils/http.js';
import {
  type PosPayload,
  type RosterEntry,
  type ServerMessage,
} from './protocol.js';

/**
 * Presence hub: one socket set per invite-code room. Relays player
 * transforms with distance culling (near ghosts @10 Hz, everyone as
 * 1 Hz map dots). Socket presence is NOT room membership — closing a
 * socket never deletes rows; REST /leave and the expiry janitor do.
 */
const CULL_DISTANCE = 130;
const POS_PER_SECOND_LIMIT = 30;
const DOTS_INTERVAL_MS = 1000;
const HELLO_TIMEOUT_MS = 5_000;
const HELLO_PER_MINUTE_PER_IP = 12;
const ROOM_TOUCH_THROTTLE_MS = 60_000;
const WORLD_BOUND = 130;
const MAX_ABS_SPEED = 60;

export interface MemberState {
  ws: WebSocket;
  playerId: string;
  name: string;
  role: 'host' | 'member';
  roomCode: string | null;
  pos: PosPayload | null;
  helloed: boolean;
  alive: boolean;
  msgStamps: number[];
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function validPos(p: unknown): p is PosPayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = p as Record<string, unknown>;
  return (
    Number.isFinite(v.x) && Math.abs(v.x as number) <= WORLD_BOUND &&
    Number.isFinite(v.z) && Math.abs(v.z as number) <= WORLD_BOUND &&
    Number.isFinite(v.y) && (v.y as number) >= 0 && (v.y as number) <= 30 &&
    Number.isFinite(v.yaw) && Number.isFinite(v.facing) &&
    typeof v.driving === 'boolean' &&
    typeof v.vehicleKind === 'string' &&
    (v.vehicleKind as string).length >= 1 &&
    (v.vehicleKind as string).length <= 24 &&
    Number.isFinite(v.speed) && Math.abs(v.speed as number) <= MAX_ABS_SPEED
  );
}

export class RoomHub {
  private readonly rooms = new Map<string, Map<string, MemberState>>();
  private readonly dotsTimers = new Map<string, NodeJS.Timeout>();
  private readonly helloStamps = new Map<string, number[]>();
  private readonly roomTouch = new Map<string, number>();

  /** Creates tracked state for an authenticated socket; callers wire events. */
  admit(ws: WebSocket, playerId: string, name: string): MemberState {
    const state: MemberState = {
      ws, playerId, name, role: 'member', roomCode: null,
      pos: null, helloed: false, alive: true, msgStamps: [],
    };
    const timer = setTimeout(() => {
      if (!state.helloed) ws.close(4408, 'hello timeout');
    }, HELLO_TIMEOUT_MS);
    timer.unref?.();
    ws.once('close', () => clearTimeout(timer));
    return state;
  }

  private helloAllowed(ip: string): boolean {
    const now = Date.now();
    const stamps = (this.helloStamps.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (stamps.length >= HELLO_PER_MINUTE_PER_IP) return false;
    stamps.push(now);
    this.helloStamps.set(ip, stamps);
    return true;
  }

  private presentRoster(code: string): RosterEntry[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return [...room.values()].map((m) => ({ id: m.playerId, name: m.name, role: m.role }));
  }

  private touchThrottled(code: string): void {
    const now = Date.now();
    if (now - (this.roomTouch.get(code) ?? 0) < ROOM_TOUCH_THROTTLE_MS) return;
    this.roomTouch.set(code, now);
    void touchRoomActivity(code).catch((error) => console.error('[realtime] room touch failed', error));
  }

  private ensureDots(code: string): void {
    if (this.dotsTimers.has(code)) return;
    const timer = setInterval(() => {
      const room = this.rooms.get(code);
      if (!room || room.size === 0) {
        clearInterval(timer);
        this.dotsTimers.delete(code);
        return;
      }
      const players = [...room.values()]
        .filter((m) => m.pos)
        .map((m) => ({ id: m.playerId, x: m.pos!.x, z: m.pos!.z, driving: m.pos!.driving }));
      for (const member of room.values()) send(member.ws, { t: 'dots', players });
    }, DOTS_INTERVAL_MS);
    timer.unref?.();
    this.dotsTimers.set(code, timer);
  }

  async onHello(state: MemberState, rawCode: unknown, ip: string): Promise<void> {
    if (!this.helloAllowed(ip)) {
      send(state.ws, { t: 'error', code: 'rate_limited', message: 'Too many join attempts. Wait a minute.' });
      state.ws.close(4413, 'rate limited');
      return;
    }
    let code: string;
    try {
      code = normalizeRoomCode(rawCode);
    } catch (error) {
      send(state.ws, { t: 'error', code: 'invalid_code', message: error instanceof ApiError ? error.message : 'Bad room code.' });
      return;
    }
    const room = await getRoom(code);
    if (!room) {
      send(state.ws, { t: 'error', code: 'room_not_found', message: 'No server with that code.' });
      return;
    }
    if (Date.now() - new Date(room.last_active_at).getTime() > ROOM_TTL_HOURS * 3_600_000) {
      await deleteRoom(code);
      send(state.ws, { t: 'error', code: 'room_expired', message: 'That server expired.' });
      return;
    }
    const membership = await getMembership(code, state.playerId);
    if (!membership) {
      send(state.ws, { t: 'error', code: 'not_a_member', message: 'Join this server with its code first.' });
      return;
    }
    let present = this.rooms.get(code);
    if (!present) {
      present = new Map();
      this.rooms.set(code, present);
    }
    if (!present.has(state.playerId) && present.size >= MAX_ROOM_MEMBERS) {
      send(state.ws, { t: 'error', code: 'room_full', message: 'That server is full (100 players).' });
      return;
    }
    // Single socket per player: drop a stale duplicate.
    present.get(state.playerId)?.ws.close(4409, 'superseded');
    state.role = membership.role;
    state.roomCode = code;
    state.helloed = true;
    present.set(state.playerId, state);
    this.touchThrottled(code);
    this.ensureDots(code);
    send(state.ws, { t: 'welcome', room: code, you: state.playerId, roster: this.presentRoster(code) });
    const roster = this.presentRoster(code);
    for (const [id, member] of present) {
      if (id !== state.playerId) send(member.ws, { t: 'roster', roster });
    }
  }

  onPos(state: MemberState, payload: unknown): void {
    if (!state.helloed || !state.roomCode) return;
    const now = Date.now();
    state.msgStamps = state.msgStamps.filter((t) => now - t < 1000);
    if (state.msgStamps.length >= POS_PER_SECOND_LIMIT) return; // drop abuse, keep socket
    state.msgStamps.push(now);
    if (!validPos(payload)) return;
    state.pos = payload;
    const room = this.rooms.get(state.roomCode);
    if (!room) return;
    for (const [id, member] of room) {
      if (id === state.playerId || !member.helloed) continue;
      // Receivers without a position yet (just spawned) get everything until localized.
      if (member.pos && Math.hypot(member.pos.x - payload.x, member.pos.z - payload.z) > CULL_DISTANCE) continue;
      send(member.ws, { t: 'pos', id: state.playerId, name: state.name, p: payload });
    }
  }

  onLeave(state: MemberState): void {
    if (!state.roomCode) return;
    const room = this.rooms.get(state.roomCode);
    if (!room || room.get(state.playerId)?.ws !== state.ws) return;
    room.delete(state.playerId);
    if (room.size === 0) {
      this.rooms.delete(state.roomCode);
    } else {
      const roster = this.presentRoster(state.roomCode);
      for (const member of room.values()) send(member.ws, { t: 'roster', roster });
    }
  }

  /** For heartbeat sweeps. */
  eachSocket(fn: (state: MemberState) => void): void {
    for (const room of this.rooms.values()) for (const member of room.values()) fn(member);
  }
}
