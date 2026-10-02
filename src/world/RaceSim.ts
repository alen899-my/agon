import { CHECKPOINT_COUNT, MAX_RACERS, TRACK_LENGTH, trackProgress } from './Track';

export type RacePhase = 'idle' | 'lobby' | 'countdown' | 'racing' | 'finished';
export interface RacerState {
  id: string;
  name: string;
  ready: boolean;
  vehicleKind: string;
  lap: number; // 1-based current lap
  checkpoint: number;
  dist: number; // total race distance covered
  finished: boolean;
  finishMs: number;
  bestLapMs: number;
  isLocal: boolean;
}

export interface RaceResultEntry {
  id: string;
  name: string;
  position: number;
  totalMs: number;
  bestLapMs: number;
  vehicleKind: string;
  dnf: boolean;
}

/** 1.2s red lights + 3s count; green coincides with release. */
export const COUNTDOWN_MS = 4200;
const FINISH_TIMEOUT_MS = 60000;

/** F1-style start-light stage for the countdown overlay. */
export function lightStage(msRemaining: number): { reds: number; amber: boolean; green: boolean; num: number } {
  const elapsed = COUNTDOWN_MS - Math.max(0, msRemaining);
  // 0-1.2s: reds light up one by one (5). 1.2-4.2s: all red + 3-2-1. 4.2-5.2s: green GO.
  if (elapsed < 1200) return { reds: 1 + Math.floor((elapsed / 1200) * 5), amber: false, green: false, num: 3 };
  if (elapsed < 4200) {
    const n = 3 - Math.floor((elapsed - 1200) / 1000);
    return { reds: 5, amber: elapsed > 3200, green: false, num: Math.max(1, n) };
  }
  return { reds: 0, amber: false, green: true, num: 0 };
}

export class RaceSim {
  phase: RacePhase = 'idle';
  laps = 3;
  racers = new Map<string, RacerState>();
  countdownEndsAt = 0;
  startedAt = 0;
  finishedAt = 0;
  private selectedHostId = '';
  private nextCheckpoint = 1;
  private lapStartTime = 0;
  private lastLapDist: number | null = null;
  private localId = '';

  get hostId(): string {
    return this.selectedHostId;
  }
  get isHost(): boolean {
    return this.localId !== '' && this.hostId === this.localId;
  }
  get count(): number {
    return this.racers.size;
  }
  get allReady(): boolean {
    if (this.racers.size < 2) return false;
    return [...this.racers.values()].every((r) => r.ready);
  }
  get canStart(): boolean {
    return this.phase === 'lobby' && this.isHost && this.racers.size >= 2 && this.racers.size <= MAX_RACERS && this.allReady;
  }

  create(localId: string, name: string, vehicleKind: string, laps: number): void {
    this.reset();
    this.selectedHostId = localId;
    this.localId = localId;
    this.laps = Math.max(1, Math.min(10, Math.round(laps) || 3));
    this.phase = 'lobby';
    this.finishedAt = 0;
    this.startedAt = 0;
    this.racers.set(localId, {
      id: localId, name, ready: true, vehicleKind, lap: 1, checkpoint: 0,
      dist: 0, finished: false, finishMs: 0, bestLapMs: 0, isLocal: true,
    });
    this.resetLapTracking();
  }

  joinAs(localId: string, name: string, vehicleKind: string, hostId: string): void {
    if (this.phase !== 'idle' || !hostId || hostId === localId) return;
    this.selectedHostId = hostId;
    this.localId = localId;
    if (!this.racers.has(localId)) {
      this.racers.set(localId, {
        id: localId, name, ready: false, vehicleKind, lap: 1, checkpoint: 0,
        dist: 0, finished: false, finishMs: 0, bestLapMs: 0, isLocal: true,
      });
    }
    if (this.phase === 'idle') this.phase = 'lobby';
  }

  /** Merge host snapshot: keep local ready intent + local vehicle choice in lobby. */
  applySnapshot(msg: { sentAt: number; phase: RacePhase; laps: number; racers: Omit<RacerState, 'isLocal'>[]; countdownEndsAt: number; startedAt: number }, nowMs = Date.now()): void {
    if (this.phase === 'idle') return;
    const local = this.racers.get(this.localId);
    const wasPhase = this.phase;
    if (wasPhase === 'racing' && msg.phase === 'countdown') return;
    const sameLaps = msg.laps === this.laps;
    if (msg.phase === 'countdown' && wasPhase !== 'countdown') this.resetLapTracking();
    if (msg.phase === 'lobby' && wasPhase !== 'lobby') this.resetLapTracking();
    this.phase = msg.phase;
    this.laps = msg.laps;
    // Translate the host clock once per start; browser uptime and device clocks differ.
    const offset = nowMs - msg.sentAt;
    if (msg.phase === 'countdown' && wasPhase !== 'countdown') this.countdownEndsAt = msg.countdownEndsAt + offset;
    if (msg.phase === 'racing' && wasPhase !== 'racing') {
      this.startedAt = wasPhase === 'countdown' ? this.countdownEndsAt : msg.startedAt + offset;
    }
    if (msg.phase === 'lobby') this.countdownEndsAt = this.startedAt = 0;
    this.racers.clear();
    for (const r of msg.racers.slice(0, MAX_RACERS)) {
      this.racers.set(r.id, { ...r, isLocal: r.id === this.localId });
    }
    // Preserve local ready intent + vehicle pick if host snapshot lags a frame.
    if (local && this.phase === 'lobby' && wasPhase === 'lobby' && sameLaps) {
      const cur = this.racers.get(this.localId);
      if (cur) {
        cur.ready = local.ready;
        if (local.vehicleKind) cur.vehicleKind = local.vehicleKind;

      }
    }
    if (local && wasPhase === 'racing' && this.phase !== 'lobby') {
      // Monotonic merge: a stale host snapshot must never downgrade local
      // progress — otherwise a first finisher loses their finish (and the
      // consumed wrap edge never re-fires, so the board waits for the final).
      const cur = this.racers.get(this.localId);
      if (cur) {
        if (local.finished) {
          cur.finished = true;
          cur.finishMs = local.finishMs || cur.finishMs;
          if (local.bestLapMs > 0 && (!cur.bestLapMs || local.bestLapMs < cur.bestLapMs)) cur.bestLapMs = local.bestLapMs;
        }
        if (local.lap > cur.lap) { cur.lap = local.lap; cur.checkpoint = local.checkpoint; }
        if (local.dist > cur.dist) cur.dist = local.dist;
        if (local.bestLapMs > 0 && (!cur.bestLapMs || local.bestLapMs < cur.bestLapMs)) cur.bestLapMs = local.bestLapMs;
      } else {
        this.racers.set(this.localId, local);
      }
    }
    if (this.phase === 'racing' && this.lapStartTime === 0 && this.startedAt > 0) {
      this.lapStartTime = this.startedAt;
    }
  }

  /** Host departure closes the race; a missing grid member cancels countdown. */
  removeParticipant(leftId: string): string {
    if (!this.racers.has(leftId) && leftId !== this.hostId) return this.hostId;
    const wasHost = leftId === this.hostId;
    this.racers.delete(leftId);
    if (wasHost) { this.reset(); return ''; }
    if (this.racers.size === 0) {
      this.reset();
      return '';
    }
    // Back to lobby if host left mid-countdown (grid no longer valid).
    if (this.phase === 'countdown') {
      this.phase = 'lobby';
      this.countdownEndsAt = 0;
      for (const r of this.racers.values()) r.ready = false;
    }
    return this.hostId;
  }

  /** Full lobby (8 racers). */
  get full(): boolean {
    return this.racers.size >= MAX_RACERS;
  }

  snapshot(nowMs = Date.now()): { sentAt: number; phase: RacePhase; laps: number; racers: RacerState[]; countdownEndsAt: number; startedAt: number } {
    return {
      sentAt: nowMs,
      phase: this.phase,
      laps: this.laps,
      racers: [...this.racers.values()].map((r) => ({ ...r, isLocal: false })),
      countdownEndsAt: this.countdownEndsAt,
      startedAt: this.startedAt,
    };
  }

  setReady(id: string, ready: boolean): void {
    if (this.phase !== 'lobby') return;
    this.racers.get(id)?.ready !== undefined && (this.racers.get(id)!.ready = ready);
  }

  setLaps(laps: number): void {
    if (this.phase !== 'lobby' || !this.isHost) return;
    this.laps = Math.max(1, Math.min(10, Math.round(laps) || 3));
    for (const r of this.racers.values()) r.ready = r.isLocal;
  }

  upsertRemote(r: RacerState): void {
    if (r.id === this.localId) return;
    const existing = this.racers.get(r.id);
    if (!existing) {
      if (!this.isHost || this.phase !== 'lobby' || this.racers.size >= MAX_RACERS) return;
      this.racers.set(r.id, { ...r, isLocal: false });
      return;
    }
    if (this.phase === 'finished') return;
    existing.name = r.name;
    existing.ready = r.ready;
    existing.vehicleKind = r.vehicleKind;
    if (this.phase === 'racing') {
      // Monotonic merge: late corrections (better times) always apply, and a
      // recorded finish is never cleared by an older duplicate. Checkpoint
      // rides with total distance so mid-lap progress still tracks live.
      if (r.lap > existing.lap) existing.lap = r.lap;
      if (r.dist >= existing.dist) { existing.dist = r.dist; existing.checkpoint = r.checkpoint; }
      if (r.bestLapMs > 0 && (!existing.bestLapMs || r.bestLapMs < existing.bestLapMs)) existing.bestLapMs = r.bestLapMs;
      if (r.finished && !existing.finished) {
        existing.finished = true;
        existing.finishMs = r.finishMs;
        if (r.bestLapMs > 0 && (!existing.bestLapMs || r.bestLapMs < existing.bestLapMs)) existing.bestLapMs = r.bestLapMs;
      }
    }
  }

  rematch(): boolean {
    if (!this.isHost || this.phase !== 'finished') return false;
    this.phase = 'lobby';
    this.countdownEndsAt = this.startedAt = this.finishedAt = 0;
    this.resetLapTracking();
    for (const r of this.racers.values()) Object.assign(r, {
      ready: r.isLocal, lap: 1, checkpoint: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0,
    });
    return true;
  }

  startCountdown(nowMs: number): boolean {
    if (!this.canStart) return false;
    this.phase = 'countdown';
    this.resetLapTracking();
    this.countdownEndsAt = nowMs + COUNTDOWN_MS;
    return true;
  }

  pollCountdown(nowMs: number): void {
    if (this.phase === 'countdown' && nowMs >= this.countdownEndsAt) {
      this.phase = 'racing';
      this.resetLapTracking();
      this.startedAt = this.countdownEndsAt;
      this.lapStartTime = this.startedAt;
      for (const r of this.racers.values()) {
        r.lap = 1;
        r.checkpoint = 0;
        r.dist = 0;
        r.finished = false;
        r.finishMs = 0;
        r.bestLapMs = 0;
      }
    }
  }

  /** Local progress tick while racing. Returns true on lap/finish events. */
  tickLocal(x: number, z: number, nowMs: number): { lapped: boolean; finished: boolean } {
    const me = this.racers.get(this.localId);
    if (!me || this.phase !== 'racing' || me.finished) return { lapped: false, finished: false };
    const p = trackProgress(x, z);
    // Require every sector in order, relative to the start line.
    // Crossing the line itself may be wide (racing line / drift): the wrap
    // edge matters more than lateral on that exact tick, otherwise a legit
    // finish is swallowed and the board waits for the timeout final.
    const previous = this.lastLapDist;
    // Within one tick of the line (35m) and now past it: a genuine crossing
    // even if the line itself was taken wide.
    const wrappedWide = previous !== null && previous > TRACK_LENGTH - 35 && p.lapDist < TRACK_LENGTH * 0.1;
    if (p.lateral >= 12 && !wrappedWide) { this.lastLapDist = null; return { lapped: false, finished: false }; }
    const sector = Math.floor(p.lapDist / (TRACK_LENGTH / CHECKPOINT_COUNT));
    this.lastLapDist = p.lapDist;
    if (previous === null) return { lapped: false, finished: false };
    // A wide line crossing skips the sector-gate on this tick only — cutting
    // earlier sectors still blocks the lap via nextCheckpoint.
    if (wrappedWide && this.nextCheckpoint === CHECKPOINT_COUNT - 1) this.nextCheckpoint = CHECKPOINT_COUNT;
    const delta = ((p.lapDist - previous + TRACK_LENGTH * 1.5) % TRACK_LENGTH) - TRACK_LENGTH * 0.5;
    const forward = wrappedWide || (delta > 0 && delta <= 35);
    const wrapped = forward && previous > TRACK_LENGTH * 0.9 && p.lapDist < TRACK_LENGTH * 0.1;
    if (forward && sector === this.nextCheckpoint && Math.floor(previous / (TRACK_LENGTH / CHECKPOINT_COUNT)) === sector - 1) this.nextCheckpoint++;
    me.checkpoint = this.nextCheckpoint - 1;
    if (sector === this.nextCheckpoint - 1) me.dist = (me.lap - 1) * TRACK_LENGTH + p.lapDist;
    if (wrapped && this.nextCheckpoint === CHECKPOINT_COUNT) {
      const lapMs = nowMs - this.lapStartTime;
      if (!me.bestLapMs || lapMs < me.bestLapMs) me.bestLapMs = lapMs;
      this.nextCheckpoint = 1;
      me.checkpoint = 0;
      this.lapStartTime = nowMs;
      if (me.lap >= this.laps) {
        me.finished = true;
        me.finishMs = nowMs - this.startedAt;
        me.dist = this.laps * TRACK_LENGTH;
        return { lapped: true, finished: true };
      }
      me.lap += 1;
      me.dist = (me.lap - 1) * TRACK_LENGTH + p.lapDist;
      return { lapped: true, finished: false };
    }
    return { lapped: false, finished: false };
  }

  /** Host: close out stragglers 60s after first finisher. */
  pollFinish(nowMs: number): RaceResultEntry[] | null {
    if (this.phase !== 'racing') return null;
    const finished = [...this.racers.values()].filter((r) => r.finished);
    if (finished.length === 0) return null;
    const firstAt = this.startedAt + Math.min(...finished.map((r) => r.finishMs));
    const allDone = finished.length === this.racers.size;
    if (allDone || nowMs - firstAt >= FINISH_TIMEOUT_MS) {
      this.phase = 'finished';
      this.finishedAt = nowMs;
      // Mark stragglers DNF (keep their distance for ordering).
      return this.results();
    }
    return null;
  }

  forceFinish(nowMs: number): RaceResultEntry[] {
    this.phase = 'finished';
    this.finishedAt = nowMs;
    return this.results();
  }

  /** Any racer across the line yet (drives the live board + toasts). */
  get hasFinisher(): boolean {
    for (const r of this.racers.values()) if (r.finished) return true;
    return false;
  }
  /** First across the line (race winner once final). */
  get firstFinisher(): RacerState | null {
    let best: RacerState | null = null;
    for (const r of this.racers.values()) {
      if (!r.finished) continue;
      if (!best || r.finishMs < best.finishMs) best = r;
    }
    return best;
  }
  /** Did I finish? Shows my live board while others are still racing. */
  get localFinished(): boolean {
    return this.racers.get(this.localId)?.finished ?? false;
  }
  standings(): RacerState[] {
    return [...this.racers.values()].sort((a, b) => {
      if (a.finished && b.finished) return a.finishMs - b.finishMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      if (b.lap !== a.lap) return b.lap - a.lap;
      if (b.checkpoint !== a.checkpoint) return b.checkpoint - a.checkpoint;
      return b.dist - a.dist;
    });
  }

  results(): RaceResultEntry[] {
    return this.standings().map((r, i) => ({
      id: r.id,
      name: r.name,
      position: i + 1,
      totalMs: r.finished ? r.finishMs : 0,
      bestLapMs: r.bestLapMs,
      vehicleKind: r.vehicleKind,
      dnf: !r.finished,
    }));
  }

  reset(): void {
    this.phase = 'idle';
    this.selectedHostId = '';
    this.localId = '';
    this.racers.clear();
    this.countdownEndsAt = 0;
    this.startedAt = 0;
    this.finishedAt = 0;
    this.resetLapTracking();
  }

  private resetLapTracking(): void {
    this.lastLapDist = null;
    this.nextCheckpoint = 1;
    this.lapStartTime = 0;
  }
}
