import { TRACK_POINTS } from './Track';
import { trackProgress } from './Track';
import type { RacerState } from './RaceSim';
import type { RaceTrackId } from './F1Track';
import { F1_LENGTH, f1InDrs, f1Progress } from './F1Track';
import { raceDistanceAt, racePathAt } from '../../server/src/agents/racePath';
import { f1DistanceAt, f1PathAt } from '../../server/src/agents/f1Path';

export const CPU_RACER_ID_PREFIX = 'cpu-';

const CPU_NAMES = ['Ghost', 'Neon', 'Vector', 'Apex', 'Blaze', 'Circuit', 'Turbo', 'Viper'];

/** Difficulty presets: top-speed factor, corner-brake strength, steering noise. */
export const CPU_DIFFICULTIES = {
  easy:   { speedFactor: 0.72, cornerBrake: 0.55, noise: 5 * (Math.PI / 180) },
  medium: { speedFactor: 0.88, cornerBrake: 0.35, noise: 2 * (Math.PI / 180) },
  hard:   { speedFactor: 1.00, cornerBrake: 0.20, noise: 0.5 * (Math.PI / 180) },
} as const;

export type CpuDifficulty = keyof typeof CPU_DIFFICULTIES;

/** Segment lengths for look-ahead. Pre-computed once for the whole module. */
const SEG_LENGTHS: number[] = [];
let TOTAL_TRACK_LEN = 0;
for (let i = 0; i < TRACK_POINTS.length; i++) {
  const p = TRACK_POINTS[i];
  const q = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
  const l = Math.hypot(q.x - p.x, q.z - p.z);
  SEG_LENGTHS.push(l);
  TOTAL_TRACK_LEN += l;
}

/** Sample the track poly at a given total distance (wraps). */
function sampleTrack(dist: number): { x: number; z: number; yaw: number } {
  let remaining = ((dist % TOTAL_TRACK_LEN) + TOTAL_TRACK_LEN) % TOTAL_TRACK_LEN;
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    if (remaining <= SEG_LENGTHS[i]) {
      const p = TRACK_POINTS[i];
      const q = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
      const t = remaining / SEG_LENGTHS[i];
      const dx = q.x - p.x, dz = q.z - p.z;
      return {
        x: p.x + dx * t,
        z: p.z + dz * t,
        yaw: Math.atan2(dx, -dz),
      };
    }
    remaining -= SEG_LENGTHS[i];
  }
  return { x: TRACK_POINTS[0].x, z: TRACK_POINTS[0].z, yaw: 0 };
}

export class CpuRacer {
  readonly id: string;
  readonly name: string;
  readonly vehicleKind: string;
  readonly track: RaceTrackId;

  /** World position. */
  x = 0; z = 0; y = 0; yaw = 0; speed = 0; steer = 0; braking = false;

  /** Distance along the track poly (wraps). */
  private trackDist = 0;
  private readonly trackLen: number;
  private readonly speedFactor: number;
  private readonly cornerBrake: number;
  /** Base top-speed in m/s derived from the vehicle kind's topSpeed (km/h / 3.6). */
  private readonly baseTopSpeed: number;

  /** RacerState (shared reference — mutated each tick). */
  readonly state: RacerState;

  private lapStartTime = 0;
  private lastLapDist: number | null = null;
  private nextCheckpoint = 1;

  readonly laneOffset: number;

  constructor(index: number, vehicleKind: string, topSpeedKmh: number, laps: number, difficulty: CpuDifficulty, startDist: number, laneOffset = 0, track: RaceTrackId = 'city') {
    this.id = `${CPU_RACER_ID_PREFIX}${index}`;
    this.name = CPU_NAMES[index % CPU_NAMES.length];
    this.vehicleKind = vehicleKind;
    this.laneOffset = laneOffset;
    this.track = track;
    this.trackLen = track === 'f1' ? F1_LENGTH : TOTAL_TRACK_LEN;

    const d = CPU_DIFFICULTIES[difficulty];
    this.speedFactor = d.speedFactor;
    this.cornerBrake = d.cornerBrake;
    this.baseTopSpeed = (topSpeedKmh / 3.6) * d.speedFactor;

    // Place on the track grid position for this CPU slot.
    this.trackDist = startDist;
    const pos = this.sampleAt(this.trackDist, this.laneOffset);
    this.x = pos.x;
    this.z = pos.z;
    this.y = pos.y ?? 0;
    this.yaw = pos.yaw;
    this.trackDist = this.distanceAt(this.x, this.z, this.laneOffset);

    this.state = {
      id: this.id,
      name: this.name,
      ready: true,
      vehicleKind,
      lap: 1,
      checkpoint: 0,
      dist: 0,
      finished: false,
      finishMs: 0,
      bestLapMs: 0,
      isLocal: false,
    };
  }

  private sampleAt(dist: number, lane: number): { x: number; z: number; y: number; yaw: number; curvature: number } {
    if (this.track === 'f1') return f1PathAt(dist, lane);
    return racePathAt(dist, lane) as { x: number; z: number; y: number; yaw: number; curvature: number };
  }

  private distanceAt(x: number, z: number, lane: number): number {
    if (this.track === 'f1') return f1DistanceAt(x, z, lane);
    return raceDistanceAt(x, z, lane);
  }

  /** Advance the CPU car by `dt` seconds. Returns true if it just finished. */
  tick(dt: number, nowMs: number, startedAt: number, totalLaps: number): boolean {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    if (dt > 1 / 30) {
      const count = Math.ceil(dt / (1 / 30));
      let finished = false;
      for (let i = 0; i < count; i++) finished = this.tick(dt / count, nowMs - (count - 1 - i) * dt / count * 1000, startedAt, totalLaps) || finished;
      return finished;
    }
    if (this.state.finished) {
      const previousSpeed = this.speed;
      this.speed = Math.max(0, this.speed - 8 * dt); this.braking = this.speed > 0;
      this.trackDist += (previousSpeed + this.speed) * 0.5 * dt;
      const p = this.sampleAt(this.trackDist, this.laneOffset);
      this.x = p.x; this.z = p.z; this.y = p.y ?? 0; this.yaw = p.yaw;
      return false;
    }
    const elapsed = nowMs - startedAt;
    if (elapsed <= 0) return false;

    // Initialise lap start time on first tick.
    if (this.lapStartTime === 0) this.lapStartTime = startedAt;

    // Look ahead far enough to brake within the available straight.
    const isF1 = this.track === 'f1';
    const drs = isF1 && f1InDrs(this.trackDist);
    let targetSpeed = Math.min(isF1 ? 65 : 45, this.baseTopSpeed * (drs ? 1.12 : 1));
    for (let look = 0; look <= 145; look += 2) {
      const curvature = Math.abs(this.sampleAt(this.trackDist + look, this.laneOffset).curvature);
      const cornerSpeed = Math.sqrt((isF1 ? 13 - this.cornerBrake * 5 : 6 - this.cornerBrake * 3) / Math.max(0.001, curvature));
      targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed * cornerSpeed + 2 * (isF1 ? 20 : 8) * look));
    }
    // Simple speed lerp toward target (gentle acceleration / hard braking).
    const accelRate = 13.5 * this.speedFactor;
    const brakeRate = isF1 ? 20 : 8;
    const rate = targetSpeed > this.speed ? accelRate : brakeRate;
    const previousSpeed = this.speed;
    this.speed += Math.sign(targetSpeed - this.speed) * Math.min(rate * dt, Math.abs(targetSpeed - this.speed));
    this.braking = this.speed < previousSpeed - 0.01;

    // Advance along the track centerline with lateral lane offset.
    this.trackDist += (previousSpeed + this.speed) * 0.5 * dt;
    const pos = this.sampleAt(this.trackDist, this.laneOffset);
    this.x = pos.x; this.z = pos.z; this.y = pos.y ?? 0; this.yaw = pos.yaw;
    this.steer = Math.max(-1, Math.min(1, Math.atan(2.7 * pos.curvature) / 0.55));

    // Update RacerState via progress (city vs F1 spline).
    const p = this.track === 'f1' ? f1Progress(this.x, this.z) : trackProgress(this.x, this.z);

    const previous = this.lastLapDist;
    this.lastLapDist = p.lapDist;
    const wrapped = previous !== null && previous > this.trackLen * 0.9 && p.lapDist < this.trackLen * 0.1;

    // Checkpoint gating (mirrors RaceSim.tickLocal logic).
    const sector = Math.floor(p.lapDist / (this.trackLen / 8));
    if (previous !== null) {
      const prevSector = Math.floor(previous / (this.trackLen / 8));
      if (sector === this.nextCheckpoint && prevSector === sector - 1) this.nextCheckpoint++;
    }
    this.state.checkpoint = this.nextCheckpoint - 1;
    if (sector === this.nextCheckpoint - 1 || this.state.dist > 0) {
      this.state.dist = (this.state.lap - 1) * this.trackLen + p.lapDist;
    }

    // Lap / finish detection.
    if (wrapped && this.nextCheckpoint >= 8) {
      const lapMs = nowMs - this.lapStartTime;
      if (!this.state.bestLapMs || lapMs < this.state.bestLapMs) this.state.bestLapMs = lapMs;
      this.nextCheckpoint = 1;
      this.state.checkpoint = 0;
      this.lapStartTime = nowMs;
      if (this.state.lap >= totalLaps) {
        this.state.finished = true;
        this.state.finishMs = nowMs - startedAt;
        this.state.dist = totalLaps * this.trackLen;
        return true;
      }
      this.state.lap += 1;
      this.state.dist = (this.state.lap - 1) * this.trackLen + p.lapDist;
    }

    return false;
  }

  /** Reset to a new start position when a rematch begins. */
  reset(startDist: number, startedAt: number): void {
    this.trackDist = startDist;
    const pos = this.sampleAt(this.trackDist, this.laneOffset);
    this.x = pos.x;
    this.z = pos.z;
    this.y = pos.y ?? 0;
    this.yaw = pos.yaw;
    this.trackDist = this.distanceAt(this.x, this.z, this.laneOffset);
    this.speed = 0;
    this.steer = 0; this.braking = false;
    this.lapStartTime = startedAt;
    this.lastLapDist = null;
    this.nextCheckpoint = 1;
    Object.assign(this.state, {
      lap: 1, checkpoint: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0,
    });
  }
}
