import { LivingWorld, OUTFITS } from './livingWorld.js';
import type { DialogueGenerator } from './dialogueTypes.js';
/**
 * AgentDirector: per-room server authority for role agents (slice: police).
 *
 * Owns wanted levels, cruiser truth, and arrests. Brains (LLM primary,
 * scripted fallback) only pick tactics from the closed goal enum; the
 * deterministic driver below executes movement and verdicts every tick.
 */
import { getCharacter } from './characters.js';
import { POLICE_POST, clampWorld, nearestRoadLine, pushOutOfBlocks } from './worldData.js';
import type {
  AgentEvent,
  AgentGoal,
  Brain,
  CopInfo,
  CrimeEvent,
  DirectorSnapshot,
  SuspectInfo,
} from './types.js';

const CRIME_STARS: Record<CrimeEvent['type'], number> = {
  kill_ped: 2,
  explosion: 2,
  hit_and_run: 2,
  shooting: 1,
  reckless_driving: 1,
};
const DECAY_MS = 25_000;
const TICK_MS = 100;
const PURSUE_SPEED = 17;
const PATROL_SPEED = 8;
const ARREST_DIST = 3.5;
const ARREST_HOLD_MS = 3000;
const ROADBLOCK_WAIT_MS = 20_000;

interface Member {
  name: string;
  x: number;
  z: number;
  speed: number;
  driving: boolean;
  seenAt: number;
}

interface Suspect extends SuspectInfo {
  arrestHoldMs: number;
}

interface Cruiser extends CopInfo {
  tx: number;
  tz: number;
  topSpeed: number;
  goalSince: number;
}

export interface DirectorOptions {
  dialogue?: DialogueGenerator;
  brain: Brain;
  fallback: Brain;
  brainIntervalMs: number;
  now?: () => number;
}

let copSeq = 0;

export class AgentDirector {
  readonly world = new LivingWorld();
  private brainPending = false;
  private revision = 0;
  private disposed = false;
  private readonly goalCache = new Map<string, { at: number; goal: AgentGoal }>();
  private lost = new Set<string>();
  private arrests: number[] = [];
  dispose(): void { this.disposed = true; this.revision++; this.world.dispose(); }
  private scheduleBrain(): void { this.brainPending = true; this.revision++; }
  private readonly members = new Map<string, Member>();
  private readonly suspects = new Map<string, Suspect>();
  private readonly cruisers: Cruiser[] = [];
  private readonly events: AgentEvent[] = [];
  private lastTick = 0;
  private lastBrainAt = -Infinity;
  private lastRideKey = '';
  private brainBusy = false;
  private patrolAngle = 0;

  constructor(private readonly opts: DirectorOptions) { this.world.dialogue = opts.dialogue; }

  get copCount(): number {
    return this.cruisers.length;
  }

  setMemberPos(playerId: string, name: string, x: number, z: number, speed: number, driving: boolean): void {
    this.members.set(playerId, { name, x, z, speed, driving, seenAt: this.now() });
  }

  removeMember(playerId: string): void {
    this.members.delete(playerId);
    this.scheduleBrain();
    this.suspects.delete(playerId);
    for (const c of this.cruisers) {
      if (c.suspectId === playerId) {
        c.suspectId = null;
        c.mode = 'return';
      }
    }
  }

  reportCrime(playerId: string, name: string, event: CrimeEvent): void {
    const now = this.now();
    this.scheduleBrain();
    if (['explosion', 'kill_ped', 'hit_and_run'].includes(event.type)) this.world.incident(event.x, event.z, now);
    let s = this.suspects.get(playerId);
    if (!s) {
      const m = this.members.get(playerId);
      s = {
        playerId, name,
        x: event.x, z: event.z, speed: m?.speed ?? 0, driving: m?.driving ?? false,
        wanted: 0, lastCrimeAt: 0, lastKnownX: event.x, lastKnownZ: event.z, arrestHoldMs: 0,
      };
      this.suspects.set(playerId, s);
    }
    s.name = name;
    s.wanted = Math.min(5, s.wanted + (CRIME_STARS[event.type] ?? 1));
    s.lastCrimeAt = now;
    s.lastKnownX = event.x;
    s.lastKnownZ = event.z;
    s.arrestHoldMs = 0;
    this.ensureCruisers();
  }

  /** Advance the world by real elapsed ms (call every ~100ms). */
  tick(): void {
    const now = this.now();
    const dtMs = this.lastTick === 0 ? TICK_MS : Math.min(1000, now - this.lastTick);
    this.lastTick = now;
    const dt = dtMs / 1000;
    this.refreshSuspects(now);
    this.decayWanted(now);
    this.ensureCruisers();
    const stages = this.world.blackboard.sites.map(s => s.stage).join(',');
    this.world.tick(dt, now, {
      cops: this.cruisers.map(c => ({ ...c, pursuing: c.mode === 'pursue' })),
      members: [...this.members.values()],
      blocked: (x, z) => { const p = pushOutOfBlocks(x, z, 0.4, this.world.blackboard.sites.filter(s => s.stage > 0)); return p.x !== x || p.z !== z || (x >= -8 && x <= 58 && z >= -70 && z <= -42); },
    });
    if (stages !== this.world.blackboard.sites.map(s => s.stage).join(',')) this.scheduleBrain();
    const rideKey = this.world.rides.map(r => r.id + r.state).join(',');
    if (rideKey !== this.lastRideKey) { this.lastRideKey = rideKey; this.scheduleBrain(); }
    for (const s of this.suspects.values()) {
      const stale = now - (this.members.get(s.playerId)?.seenAt ?? s.lastCrimeAt) > 20_000;
      if (s.wanted && stale && !this.lost.has(s.playerId)) { this.lost.add(s.playerId); this.scheduleBrain(); }
      if (!stale) this.lost.delete(s.playerId);
    }
    if (this.anyWanted() && now - this.lastBrainAt > 45_000) this.brainPending = true;
    void this.refreshBrain(now);
    for (const c of this.cruisers) this.driveCop(c, dt, now);
    this.checkArrests(dtMs, now);
    // Drop despawned cruisers (returned to post with no wanted).
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const c = this.cruisers[i];
      if (c.mode === 'return' && Math.hypot(c.x - c.tx, c.z - c.tz) < 6 && c.speed < 1) {
        if (!this.anyWanted()) {
          this.emit({ kind: 'stand_down', copId: c.id, suspectId: null, x: c.x, z: c.z });
          this.cruisers.splice(i, 1);
        }
      }
    }
  }

  getSnapshot(): DirectorSnapshot {
    return {
      rides: this.world.rideSnapshot(),
      walkers: [...this.world.snapshot().filter(p => !this.cruisers.some((c, i) => p.id === ['w-00', 'w-01'][i])), ...this.cruisers.filter(c => c.onFoot).map(c => ({
        id: c.id + '-officer', role: 'police' as const, name: 'Officer Morgan', outfit: OUTFITS.police,
        x: c.x, z: c.z, yaw: c.yaw, speed: c.speed, task: 'arrest', chatUntil: 0,
      }))],
      sites: this.world.blackboard.sites.map(s => ({ ...s })),
      cops: this.cruisers.map((c) => ({
        id: c.id, onFoot: c.onFoot, vehicleX: c.vehicleX, vehicleZ: c.vehicleZ, x: c.x, z: c.z, yaw: c.yaw, speed: c.speed,
        mode: c.mode, lightsOn: c.mode === 'pursue' || c.mode === 'respond',
        suspectId: c.suspectId,
      })),
      wanted: Object.fromEntries([...this.suspects.values()].map((s) => [s.playerId, s.wanted])),
    };
  }

  drainEvents(): AgentEvent[] {
    return this.events.splice(0);
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private anyWanted(): boolean {
    for (const s of this.suspects.values()) if (s.wanted > 0) return true;
    return false;
  }

  private refreshSuspects(now: number): void {
    for (const [id, m] of this.members) {
      const s = this.suspects.get(id);
      if (!s) continue;
      s.x = m.x;
      s.z = m.z;
      s.speed = m.speed;
      s.driving = m.driving;
      // Live sighting refreshes last-known while anyone is near the action.
      if (now - m.seenAt < 3000) {
        s.lastKnownX = m.x;
        s.lastKnownZ = m.z;
      }
    }
    // Forget members gone >10s (stale pos); keep wanted record for decay.
    for (const [id, s] of this.suspects) {
      if (!this.members.has(id) && now - s.lastCrimeAt > 60_000) this.suspects.delete(id);
    }
  }

  private decayWanted(now: number): void {
    for (const s of this.suspects.values()) {
      if (s.wanted > 0 && now - s.lastCrimeAt > DECAY_MS) {
        s.wanted -= 1;
        this.scheduleBrain();
        s.lastCrimeAt = now;
        s.arrestHoldMs = 0;
      }
    }
  }

  private ensureCruisers(): void {
    const def = getCharacter('police');
    if (!def?.enabled) return;
    if (!this.anyWanted() || this.cruisers.length > 0) {
      // Second cruiser for hot suspects.
      const hot = [...this.suspects.values()].some((s) => s.wanted >= 4);
      if (!(hot && this.cruisers.length < def.maxPerRoom)) return;
    }
    const sx = nearestRoadLine(POLICE_POST.x);
    const id = `cop-${++copSeq}`;
    // Roll out already pursuing the hottest suspect: no brain round-trip
    // latency before the siren starts. The brain refines tactics later.
    const hot = [...this.suspects.values()].filter((s) => s.wanted > 0)
      .sort((a, b) => b.wanted - a.wanted)[0];
    this.cruisers.push({
      id, x: sx, z: POLICE_POST.z + 6, yaw: 0, speed: 0,
      mode: hot ? 'pursue' : 'patrol', lightsOn: true, suspectId: hot?.playerId ?? null,
      tx: hot?.lastKnownX ?? sx, tz: hot?.lastKnownZ ?? POLICE_POST.z + 6,
      topSpeed: PURSUE_SPEED, goalSince: this.now(),
    });
    if (hot) this.emit({ kind: 'pursuit_start', copId: id, suspectId: hot.playerId, x: sx, z: POLICE_POST.z + 6 });
  }

  private async refreshBrain(now: number): Promise<void> {
    if (this.disposed || this.brainBusy || !this.brainPending || now - this.lastBrainAt < this.opts.brainIntervalMs) return;
    this.brainPending = false;
    this.brainBusy = true;
    this.lastBrainAt = now;
    const revision = this.revision;
    const sites = this.world.blackboard.sites.map(s => ({ ...s }));
    const incidents = [...this.world.blackboard.incidents.values()].length;
    const ctx = {
      now, cops: this.cruisers.map(c => ({ ...c })),
      suspects: [...this.suspects.values()].map(s => ({ ...s })),
      sites,
      escalate: [...this.suspects.values()].filter(s => s.wanted > 0).length > 1 || this.arrests.filter(at => now - at < 60_000).length >= 2,
      world: `sites ${sites.map(s => `${s.id}:stage${s.stage}`).join(', ') || 'none'}; open incidents ${incidents}; builders ${this.world.blackboard.agents.size} walkers active`,
      rides: this.world.rides.map(r => ({ id: r.id, name: r.name, state: r.state, lap: r.lap })),
    };
    const signature = JSON.stringify([ctx.suspects.map(s => [s.playerId, s.wanted, s.driving]).sort(), ctx.cops.map(c => [c.mode, c.suspectId]), ctx.sites.map(s => [s.id, s.stage]), ctx.rides.map(r => [r.id, r.state])]);
    try {
      const cached = this.goalCache.get(signature);
      let goal = cached && now - cached.at < 60_000 ? cached.goal : null;
      if (!goal) {
        try { goal = await this.opts.brain.decide(ctx); } catch { /* scripted fallback */ }
        if (!goal) goal = await this.opts.fallback.decide(ctx);
        if (goal) this.goalCache.set(signature, { at: now, goal });
      }
      for (const [key, entry] of this.goalCache) if (now - entry.at >= 60_000) this.goalCache.delete(key);
      if (!this.disposed && this.revision === revision && goal) this.applyGoal(this.cruisers[0], goal, now);
    } catch { /* Steering and world rules continue even if both brains fail. */ }
    finally { this.brainBusy = false; }
  }

  private applyGoal(cop: Cruiser | undefined, goal: AgentGoal, now: number): void {
    if (goal.directives) {
      if (goal.directives.siteFocus) this.world.directives.siteFocus = goal.directives.siteFocus;
      if (goal.directives.raceNow) this.world.directives.raceNow = true;
    }
    if (!cop) return;
    cop.goalSince = now;
    switch (goal.action) {
      case 'pursue': {
        const s = goal.suspectId ? this.suspects.get(goal.suspectId) : undefined;
        if (!s || s.wanted <= 0) return;
        const started = cop.mode !== 'pursue';
        cop.mode = 'pursue';
        cop.suspectId = s.playerId;
        cop.topSpeed = PURSUE_SPEED;
        cop.tx = s.lastKnownX;
        cop.tz = s.lastKnownZ;
        if (started) this.emit({ kind: 'pursuit_start', copId: cop.id, suspectId: s.playerId, x: cop.x, z: cop.z });
        break;
      }
      case 'roadblock': {
        if (goal.x === undefined || goal.z === undefined) return;
        cop.mode = 'respond';
        cop.tx = goal.x;
        cop.tz = goal.z;
        cop.topSpeed = PURSUE_SPEED;
        break;
      }
      case 'patrol':
        cop.mode = 'patrol';
        cop.suspectId = null;
        cop.topSpeed = PATROL_SPEED;
        break;
      case 'standDown':
        cop.mode = 'return';
        cop.suspectId = null;
        cop.topSpeed = PATROL_SPEED;
        cop.tx = nearestRoadLine(POLICE_POST.x);
        cop.tz = POLICE_POST.z + 6;
        break;
      default:
        break;
    }
  }

  private checkArrests(dtMs: number, now: number): void {
    for (const s of this.suspects.values()) {
      if (s.wanted <= 0) continue;
      const cop = this.cruisers.find(c => c.mode === 'pursue' && c.suspectId === s.playerId && Math.hypot(c.x - s.x, c.z - s.z) < ARREST_DIST);
      if (!cop || Math.abs(s.speed) >= 2) { s.arrestHoldMs = 0; continue; }
      // Accumulate once per suspect, regardless of the number of officers nearby.
      s.arrestHoldMs += dtMs;
      if (s.arrestHoldMs < ARREST_HOLD_MS) continue;
      s.wanted = 0; s.arrestHoldMs = 0; this.scheduleBrain();
      this.arrests.push(now); this.arrests = this.arrests.filter(at => now - at < 60_000);
      for (const c of this.cruisers) if (c.suspectId === s.playerId) {
        c.mode = 'return'; c.suspectId = null;
        c.tx = nearestRoadLine(POLICE_POST.x); c.tz = POLICE_POST.z + 6;
      }
      this.emit({ kind: 'busted', copId: cop.id, suspectId: s.playerId, x: s.x, z: s.z });
    }
  }
  private driveCop(c: Cruiser, dt: number, now: number): void {
    if (c.mode === 'pursue' && c.suspectId) {
      const s = this.suspects.get(c.suspectId);
      if (!s || s.wanted <= 0) {
        c.mode = 'return';
        c.suspectId = null;
        c.tx = nearestRoadLine(POLICE_POST.x);
        c.tz = POLICE_POST.z + 6;
      } else {
        c.tx = s.lastKnownX;
        c.tz = s.lastKnownZ;
        const d = Math.hypot(s.x - c.x, s.z - c.z);
        if (!c.onFoot && !s.driving && d < 8) {
          c.onFoot = true; c.vehicleX = c.x; c.vehicleZ = c.z; c.speed = 0;
        }
        if (c.onFoot && (s.driving || d > 18)) { c.x = c.vehicleX!; c.z = c.vehicleZ!; c.onFoot = false; }
      }
    } else if (c.mode === 'respond') {
      // Roadblock: park at the point; re-engage if the suspect closes in.
      const s = c.suspectId ? this.suspects.get(c.suspectId) : [...this.suspects.values()].find((v) => v.wanted > 0);
      if (s) {
        const d = Math.hypot(s.x - c.x, s.z - c.z);
        if (d < 25) {
          this.applyGoal(c, { action: 'pursue', suspectId: s.playerId }, now);
        } else if (now - c.goalSince > ROADBLOCK_WAIT_MS) {
          this.applyGoal(c, { action: 'pursue', suspectId: s.playerId }, now);
        }
      }
    } else if (c.mode === 'patrol' || c.mode === 'return') {
      this.patrolAngle += dt * 0.15;
      if (c.mode === 'patrol') {
        c.tx = POLICE_POST.x + Math.cos(this.patrolAngle) * 40;
        c.tz = POLICE_POST.z + Math.sin(this.patrolAngle) * 40;
      }
      // New crime while patrolling: engage via fallback immediately.
      const hot = [...this.suspects.values()].filter((s) => s.wanted > 0)
        .sort((a, b) => b.wanted - a.wanted)[0];
      if (hot && c.mode === 'patrol') this.applyGoal(c, { action: 'pursue', suspectId: hot.playerId }, now);
    }
    if (c.onFoot) {
      if (c.mode === 'return') {
        c.tx = c.vehicleX!; c.tz = c.vehicleZ!;
        if (Math.hypot(c.tx - c.x, c.tz - c.z) < 1) {
          c.onFoot = false; c.tx = nearestRoadLine(POLICE_POST.x); c.tz = POLICE_POST.z + 6;
        }
      }
      if (c.onFoot) {
        const d = Math.hypot(c.tx - c.x, c.tz - c.z);
        c.speed = d > 1.5 ? 3 : 0; c.yaw = Math.atan2(c.tx - c.x, -(c.tz - c.z));
        const p = pushOutOfBlocks(c.x + Math.sin(c.yaw) * c.speed * dt, c.z - Math.cos(c.yaw) * c.speed * dt, 0.4, this.world.blackboard.sites.filter(s => s.stage > 0));
        c.x = p.x; c.z = p.z; return;
      }
    }
    // Seek steering with accel/brake limits.
    const dx = c.tx - c.x;
    const dz = c.tz - c.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = dist > 0.5 ? Math.atan2(dx, -dz) : c.yaw;
    let dy = wantYaw - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, dy));
    const wantSpeed = dist < 3 ? 0 : c.topSpeed * Math.min(1, dist / 12);
    c.speed += Math.max(-14 * dt, Math.min(10 * dt, wantSpeed - c.speed));
    c.x += Math.sin(c.yaw) * c.speed * dt;
    c.z += -Math.cos(c.yaw) * c.speed * dt;
    const fixed = pushOutOfBlocks(c.x, c.z, 2.2, this.world.blackboard.sites.filter(s => s.stage > 0));
    c.x = clampWorld(fixed.x);
    c.z = clampWorld(fixed.z);
    c.lightsOn = c.mode === 'pursue' || c.mode === 'respond';
  }

  private emit(e: AgentEvent): void {
    this.events.push(e);
  }
}

export { AgentDirector as WorldDirector };
