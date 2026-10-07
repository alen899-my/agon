import { loadBuildings, saveBuilding } from '../agents/buildings.js';
import type { WebSocket } from 'ws';
import {
  MAX_ROOM_MEMBERS,
  ROOM_TTL_HOURS,
  getMembership,
  getRoom,
  normalizeRoomCode,
  touchRoomActivity,
} from '../services/rooms.service.js';
import { ApiError } from '../utils/http.js';
import {
  type PosPayload,
  type RaceSnapshotMsg,
  type RacePosPayload,
  type RosterEntry,
  type ServerMessage,
  type CrimeReport,
  rideToMsg,
} from './protocol.js';
import { AgentDirector } from '../agents/director.js';
import { OpenRouterBrain } from '../agents/llm.js';
import { DialogueBrain } from '../agents/dialogue.js';
import { modelOptions } from '../agents/provider.js';
import { ScriptedDispatcher } from '../agents/scripted.js';
import { config } from '../config.js';

/**
 * Presence hub: one socket set per invite-code room. Relays player
 * transforms with distance culling (near ghosts @10 Hz, everyone as
 * 1 Hz map dots). Socket presence is NOT room membership — closing a
 * socket never deletes rows; REST /leave and the expiry janitor do.
 */
const CULL_DISTANCE = 130;
const POS_PER_SECOND_LIMIT = 30;
const DOTS_INTERVAL_MS = 1000;
const HELLO_TIMEOUT_MS = 15_000;
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
  private readonly pendingHellos = new WeakSet<MemberState>();
  private readonly raceSnapshots = new Map<string, RaceSnapshotMsg>();
  private readonly raceTargets = new Map<string, string>();
  private readonly rooms = new Map<string, Map<string, MemberState>>();
  private readonly dotsTimers = new Map<string, NodeJS.Timeout>();
  private readonly helloStamps = new Map<string, number[]>();
  private readonly roomTouch = new Map<string, number>();
  /** Arena directory: joinable race lobbies per room, keyed by host player id. */
  private readonly raceDir = new Map<string, Map<string, { hostId: string; hostName: string; laps: number; count: number; phase: 'lobby' | 'countdown' | 'racing' | 'finished' | 'idle' }>>();
  /** Server-authoritative role agents (police slice) — one director per room. */
  private readonly directors = new Map<string, { director: AgentDirector; timer: NodeJS.Timeout; lastPush: number }>();

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
      this.touchThrottled(code);
      const players = [...room.values()]
        .filter((m) => m.pos)
        .map((m) => ({ id: m.playerId, x: m.pos!.x, z: m.pos!.z, driving: m.pos!.driving }));
      for (const member of room.values()) send(member.ws, { t: 'dots', players });
    }, DOTS_INTERVAL_MS);
    timer.unref?.();
    this.dotsTimers.set(code, timer);
  }

  /** Lazily starts the agent director tick for a room (100ms sim, 500ms push). */
  private ensureAgents(code: string): void {
    if (this.directors.has(code)) return;
    const scripted = new ScriptedDispatcher();
    // Read through validated config (not raw process.env) so AI_MODE,
    // GEMINI_* and intervals match the booted server. modelOptions(config)
    // accepts the validated object because the AI_* fields stay strings.
    const useLlm = config.AI_MODE !== 'scripted';
    const opts = modelOptions(config as unknown as Record<string, unknown>);
    if (useLlm && !opts.apiKey) console.warn('[ai] AI_MODE=llm but no API key for provider gemini; using scripted fallback. Set GEMINI_API_KEY.');
    const brain = useLlm
      ? new OpenRouterBrain(opts)
      : scripted;
    const dialogue = useLlm ? new DialogueBrain({ ...modelOptions(config as unknown as Record<string, unknown>), minIntervalMs: 15000, maxCallsPerMinute: 4 }) : undefined;
    const director = new AgentDirector({
      dialogue: dialogue ? context => dialogue.generate(context) : undefined,
      brain,
      fallback: scripted,
      brainIntervalMs: Math.max(6000, config.AI_BRAIN_INTERVAL_MS),
    });
    let loaded = false;
    let loading = false;
    let nextLoad = 0;
    const pending = new Map<string, import('../agents/livingWorld.js').BuildDelta>();
    let saving = false;
    let nextSave = 0;
    const timer = setInterval(() => {
      const room = this.rooms.get(code);
      if (!room || room.size === 0) {
        // Keep retrying unsaved stages before releasing an empty room.
        if (pending.size > 0 || saving) { void flush(); return; }
        director.dispose(); dialogue?.dispose(); clearInterval(timer);
        this.directors.delete(code);
        return;
      }
      if (!loaded) {
        if (!loading && Date.now() >= nextLoad) {
          loading = true;
          void loadBuildings(code).then(rows => { director.world.construction.restore(rows); loaded = true; })
            .catch(() => { nextLoad = Date.now() + 10_000; console.error('[agents] building restore failed; retrying'); })
            .finally(() => { loading = false; });
        }
        return;
      }
      director.tick();
      for (const delta of director.world.construction.drainDeltas()) {
        pending.set(delta.siteId, delta);
        for (const member of room.values()) if (member.helloed) send(member.ws, { t: 'build_delta', delta });
      }
      void flush();
      const entry = this.directors.get(code);
      const now = Date.now();
      if (entry && now - entry.lastPush >= 500) {
        entry.lastPush = now;
        const snap = director.getSnapshot();
        const a = { ...snap, rides: snap.rides?.map(rideToMsg) };
        for (const member of room.values()) {
          if (member.helloed) send(member.ws, { t: 'agent_state', a });
        }
      }
      for (const e of director.drainEvents()) {
        for (const member of room.values()) {
          if (member.helloed) send(member.ws, { t: 'agent_event', e });
        }
      }
    }, 100);
    timer.unref?.();
    async function flush(): Promise<void> {
      if (saving || Date.now() < nextSave || pending.size === 0) return;
      saving = true;
      try {
        for (const [id, delta] of pending) {
          await saveBuilding(code, delta);
          if (pending.get(id) === delta) pending.delete(id);
        }
      } catch { nextSave = Date.now() + 10_000; console.error('[agents] building save failed; retrying'); }
      finally { saving = false; }
    }
    this.directors.set(code, { director, timer, lastPush: 0 });
  }

  /** Validates a client crime report (bounds + enum). */
  private validCrime(c: unknown): c is CrimeReport {
    if (typeof c !== 'object' || c === null) return false;
    const v = c as Record<string, unknown>;
    return (
      typeof v.type === 'string' &&
      ['kill_ped', 'explosion', 'shooting', 'hit_and_run', 'reckless_driving'].includes(v.type) &&
      Number.isFinite(v.x) && Math.abs(v.x as number) <= 160 &&
      Number.isFinite(v.z) && Math.abs(v.z as number) <= 160
    );
  }

  /** Crime report: scores wanted, may spawn a cruiser. Throttled like pos. */
  onCrimeReport(state: MemberState, payload: unknown): void {
    if (!state.helloed || !state.roomCode) return;
    const now = Date.now();
    state.msgStamps = state.msgStamps.filter((t) => now - t < 1000);
    if (state.msgStamps.length >= POS_PER_SECOND_LIMIT) return;
    state.msgStamps.push(now);
    if (!this.validCrime(payload)) return;
    this.ensureAgents(state.roomCode);
    this.directors.get(state.roomCode)?.director.reportCrime(
      state.playerId, state.name, { ...(payload as CrimeReport), at: now },
    );
  }

  async onHello(state: MemberState, rawCode: unknown, ip: string): Promise<void> {
    if (state.helloed || this.pendingHellos.has(state) || state.ws.readyState !== state.ws.OPEN) return;
    this.pendingHellos.add(state);
    try {
    if (!this.helloAllowed(ip + ':' + state.playerId)) {
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
      send(state.ws, { t: 'error', code: 'room_expired', message: 'That server expired.' });
      return;
    }
    const membership = await getMembership(code, state.playerId);
    if (!membership) {
      send(state.ws, { t: 'error', code: 'not_a_member', message: 'Join this server with its code first.' });
      return;
    }
    if (state.ws.readyState !== state.ws.OPEN) return;
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
    const previous = present.get(state.playerId);
    state.role = membership.role;
    state.roomCode = code;
    state.helloed = true;
    present.set(state.playerId, state);
    previous?.ws.close(4409, 'superseded');
    this.touchThrottled(code);
    this.ensureDots(code);
    this.ensureAgents(code);
    send(state.ws, { t: 'welcome', room: code, you: state.playerId, roster: this.presentRoster(code) });
    const roster = this.presentRoster(code);
    for (const [id, member] of present) {
      if (id !== state.playerId) {
        send(member.ws, { t: 'roster', roster });
        if (member.pos) send(state.ws, { t: 'pos', id, name: member.name, p: member.pos });
      }
    }
    } finally { this.pendingHellos.delete(state); }
  }

  onPos(state: MemberState, payload: unknown): void {
    if (!state.helloed || !state.roomCode || this.rooms.get(state.roomCode)?.get(state.playerId) !== state) return;
    const now = Date.now();
    state.msgStamps = state.msgStamps.filter((t) => now - t < 1000);
    if (state.msgStamps.length >= POS_PER_SECOND_LIMIT) return; // drop abuse, keep socket
    state.msgStamps.push(now);
    if (!validPos(payload)) return;
    state.pos = payload;
    // Feed the room's agent director (pursuit truth + last-known positions).
    this.ensureAgents(state.roomCode);
    this.directors.get(state.roomCode)?.director.setMemberPos(
      state.playerId, state.name, payload.x, payload.z,
      Math.abs(payload.speed), payload.driving,
    );
    const room = this.rooms.get(state.roomCode);
    if (!room) return;
    for (const [id, member] of room) {
      if (id === state.playerId || !member.helloed) continue;
      // Receivers without a position yet (just spawned) get everything until localized.
      if (member.pos && Math.hypot(member.pos.x - payload.x, member.pos.z - payload.z) > CULL_DISTANCE) continue;
      send(member.ws, { t: 'pos', id: state.playerId, name: state.name, p: payload });
    }
  }

  private validRacePos(r: unknown): r is RacePosPayload {
    if (typeof r !== 'object' || r === null) return false;
    const v = r as Record<string, unknown>;
    return (
      typeof v.hostId === 'string' && v.hostId.length > 0 && v.hostId.length <= 100 &&
      (v.leaving === undefined || typeof v.leaving === 'boolean') &&
      Number.isInteger(v.lap) && (v.lap as number) >= 1 && (v.lap as number) <= 11 &&
      Number.isInteger(v.cp) && (v.cp as number) >= 0 && (v.cp as number) < 8 &&
      Number.isFinite(v.dist) && (v.dist as number) >= 0 && (v.dist as number) <= 7000 &&
      typeof v.finished === 'boolean' &&
      Number.isFinite(v.finishMs) && (v.finishMs as number) >= 0 && (v.finishMs as number) <= 3600000 &&
      Number.isFinite(v.bestLapMs) && (v.bestLapMs as number) >= 0 && (v.bestLapMs as number) <= 3600000 &&
      typeof v.vehicleKind === 'string' && (v.vehicleKind as string).length >= 1 && (v.vehicleKind as string).length <= 24 &&
      typeof v.ready === 'boolean' &&
      Number.isFinite(v.blinker) && (v.blinker as number) >= 0 && (v.blinker as number) <= 3
    );
  }

  private validRaceSnapshot(s: unknown): boolean {
    if (typeof s !== 'object' || s === null) return false;
    const v = s as Record<string, unknown>;
    if (!['idle', 'lobby', 'countdown', 'racing', 'finished'].includes(v.phase as string)) return false;
    if (!Number.isInteger(v.laps) || (v.laps as number) < 1 || (v.laps as number) > 10) return false;
    if (!Array.isArray(v.racers) || (v.racers as unknown[]).length > 8) return false;
    if (!Number.isFinite(v.sentAt) || !Number.isFinite(v.countdownEndsAt) || !Number.isFinite(v.startedAt)) return false;
    const ids = new Set<string>();
    return v.racers.every((r: unknown) => {
      if (!r || typeof r !== 'object') return false;
      const row = r as Record<string, unknown>;
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.name !== 'string' || row.name.length > 24) return false;
      ids.add(row.id);
      return this.validRacePos({ ...row, hostId: row.id, cp: row.checkpoint, blinker: 0 });
    });
  }

  /** Race progress: route only to members of the selected race. */
  onRacePos(state: MemberState, payload: unknown): void {
    if (!state.helloed || !state.roomCode) return;
    const now = Date.now();
    state.msgStamps = state.msgStamps.filter((t) => now - t < 1000);
    if (state.msgStamps.length >= POS_PER_SECOND_LIMIT) return;
    state.msgStamps.push(now);
    if (!this.validRacePos(payload)) return;
    const room = this.rooms.get(state.roomCode);
    if (!room) return;
    const host = room.get(payload.hostId);
    const race = this.raceSnapshots.get(payload.hostId);
    if (!host || !race) { send(state.ws, { t: 'error', code: 'race_join_failed', message: 'That race is no longer available.' }); return; }
    const target = this.raceTargets.get(state.playerId);
    if (payload.leaving) {
      if (target !== payload.hostId) return;
      this.raceTargets.delete(state.playerId);
    } else {
      if (target && target !== payload.hostId) return;
      if (!target && (race.phase !== 'lobby' || [...this.raceTargets.values()].filter(id => id === payload.hostId).length >= 8)) {
        send(state.ws, { t: 'error', code: 'race_join_failed', message: 'That race is full or has already started.' }); return;
      }
      this.raceTargets.set(state.playerId, payload.hostId);
    }
    for (const [id, member] of room) {
      if (id === state.playerId || !member.helloed || (id !== payload.hostId && this.raceTargets.get(id) !== payload.hostId)) continue;
      send(member.ws, { t: 'race_pos', id: state.playerId, name: state.name, r: payload as never });
    }
  }

  /** Host-authoritative race snapshot: relayed only to opted-in members. */
  onRaceState(state: MemberState, snapshot: unknown): void {
    if (!state.helloed || !state.roomCode) return;
    if (!this.validRaceSnapshot(snapshot)) return;
    const room = this.rooms.get(state.roomCode);
    if (!room) return;
    const s = snapshot as RaceSnapshotMsg;
    if (s.phase !== 'idle') {
      if (s.racers[0]?.id !== state.playerId || s.racers.some(r => !room.has(r.id))) return;
      const target = this.raceTargets.get(state.playerId);
      if (target && target !== state.playerId) return;
      if (s.racers.some(r => r.id !== state.playerId && this.raceTargets.get(r.id) !== state.playerId)) return;
      this.raceTargets.set(state.playerId, state.playerId);
      this.raceSnapshots.set(state.playerId, s);
    } else if (!this.raceSnapshots.has(state.playerId)) return;
    // Maintain the arena directory: only lobby/countdown are joinable.
    let dir = this.raceDir.get(state.roomCode);
    if (!dir) {
      dir = new Map();
      this.raceDir.set(state.roomCode, dir);
    }
    if (s.phase === 'lobby' || s.phase === 'countdown') {
      dir.set(state.playerId, {
        hostId: state.playerId, hostName: state.name, laps: s.laps,
        count: Math.min(8, s.racers.length), phase: s.phase,
      });
    } else {
      dir.delete(state.playerId);
    }
    for (const [id, member] of room) {
      if (id === state.playerId || !member.helloed || this.raceTargets.get(id) !== state.playerId) continue;
      send(member.ws, { t: 'race_state', id: state.playerId, name: state.name, s: snapshot as never });
    }
    if (s.phase === 'idle') {
      this.raceSnapshots.delete(state.playerId);
      for (const [id, hostId] of this.raceTargets) if (hostId === state.playerId) this.raceTargets.delete(id);
    }
    this.broadcastRaceDir(state.roomCode);
  }

  /** Arena directory request: which races can I join in this room? */
  onRaceList(state: MemberState): void {
    if (!state.helloed || !state.roomCode) return;
    this.sendRaceDir(state);
  }

  private sendRaceDir(state: MemberState): void {
    if (!state.roomCode) return;
    const dir = this.raceDir.get(state.roomCode);
    const races = [...(dir?.values() ?? [])].filter((r) => r.phase === 'lobby' || r.phase === 'countdown').slice(0, 12);
    send(state.ws, { t: 'race_dir', races });
  }

  private broadcastRaceDir(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const dir = this.raceDir.get(code);
    const races = [...(dir?.values() ?? [])].filter((r) => r.phase === 'lobby' || r.phase === 'countdown').slice(0, 12);
    for (const member of room.values()) {
      if (!member.helloed) continue;
      send(member.ws, { t: 'race_dir', races });
    }
  }

  onLeave(state: MemberState): void {
    if (!state.roomCode) return;
    const code = state.roomCode;
    const room = this.rooms.get(code);
    if (!room || room.get(state.playerId)?.ws !== state.ws) return;
    room.delete(state.playerId);
    this.directors.get(code)?.director.removeMember(state.playerId);
    this.raceSnapshots.delete(state.playerId);
    this.raceTargets.delete(state.playerId);
    for (const [id, hostId] of this.raceTargets) if (hostId === state.playerId) this.raceTargets.delete(id);
    // Host left: drop their advertised lobby so the directory never shows ghosts.
    const dir = this.raceDir.get(code);
    if (dir?.delete(state.playerId)) this.broadcastRaceDir(code);
    if (room.size === 0) {
      this.rooms.delete(code);
      this.raceDir.delete(code);
    } else {
      const roster = this.presentRoster(code);
      for (const member of room.values()) send(member.ws, { t: 'roster', roster });
    }
  }

  /** For heartbeat sweeps. */
  eachSocket(fn: (state: MemberState) => void): void {
    for (const room of this.rooms.values()) for (const member of room.values()) fn(member);
  }
}
