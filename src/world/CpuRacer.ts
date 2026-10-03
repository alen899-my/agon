import { TRACK_POINTS } from './Track';
import { trackProgress } from './Track';
import type { RacerState } from './RaceSim';

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

/** Returns corner sharpness (0 = straight, 1 = hairpin) at a track position. */
function cornerSharpness(trackDist: number): number {
  const ahead = 18; // look-ahead distance in metres
  const a = sampleTrack(trackDist);
  const b = sampleTrack(trackDist + ahead);
  let dYaw = b.yaw - a.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  return Math.min(1, Math.abs(dYaw) / (Math.PI * 0.55));
}

export class CpuRacer {
  readonly id: string;
  readonly name: string;
  readonly vehicleKind: string;

  /** World position. */
  x = 0; z = 0; yaw = 0; speed = 0;

  /** Distance along the track poly (wraps). */
  private trackDist = 0;
  /** Noise accumulator for organic steering. */
  private noiseAngle = 0;
  private noiseTimer = 0;
  private noiseTarget = 0;

  private readonly speedFactor: number;
  private readonly cornerBrake: number;
  private readonly noise: number;
  /** Base top-speed in m/s derived from the vehicle kind's topSpeed (km/h / 3.6). */
  private readonly baseTopSpeed: number;

  /** RacerState (shared reference — mutated each tick). */
  readonly state: RacerState;

  private lapStartTime = 0;
  private lastLapDist: number | null = null;
  private nextCheckpoint = 1;

  readonly laneOffset: number;

  constructor(index: number, vehicleKind: string, topSpeedKmh: number, laps: number, difficulty: CpuDifficulty, startDist: number, laneOffset = 0) {
    this.id = `${CPU_RACER_ID_PREFIX}${index}`;
    this.name = CPU_NAMES[index % CPU_NAMES.length];
    this.vehicleKind = vehicleKind;
    this.laneOffset = laneOffset;

    const d = CPU_DIFFICULTIES[difficulty];
    this.speedFactor = d.speedFactor;
    this.cornerBrake = d.cornerBrake;
    this.noise = d.noise;
    this.baseTopSpeed = (topSpeedKmh / 3.6) * d.speedFactor;

    // Place on the track grid position for this CPU slot.
    this.trackDist = startDist;
    const pos = sampleTrack(this.trackDist);
    const rx = Math.cos(pos.yaw);
    const rz = Math.sin(pos.yaw);
    this.x = pos.x + rx * this.laneOffset;
    this.z = pos.z + rz * this.laneOffset;
    this.yaw = pos.yaw;

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

  /** Advance the CPU car by `dt` seconds. Returns true if it just finished. */
  tick(dt: number, nowMs: number, startedAt: number, totalLaps: number): boolean {
    if (this.state.finished) return false;
    const elapsed = nowMs - startedAt;
    if (elapsed <= 0) return false;

    // Initialise lap start time on first tick.
    if (this.lapStartTime === 0) this.lapStartTime = startedAt;

    // Corner braking: slow down proportionally to sharpness.
    const sharpness = cornerSharpness(this.trackDist);
    const targetSpeed = this.baseTopSpeed * (1 - this.cornerBrake * sharpness);

    // Simple speed lerp toward target (gentle acceleration / hard braking).
    const accelRate = this.baseTopSpeed * 1.2;
    const brakeRate = this.baseTopSpeed * 2.5;
    const rate = targetSpeed > this.speed ? accelRate : brakeRate;
    this.speed += Math.sign(targetSpeed - this.speed) * Math.min(rate * dt, Math.abs(targetSpeed - this.speed));

    // Organic steering noise that drifts slowly so the car weaves.
    this.noiseTimer -= dt;
    if (this.noiseTimer <= 0) {
      this.noiseTimer = 0.6 + Math.random() * 1.2;
      this.noiseTarget = (Math.random() * 2 - 1) * this.noise;
    }
    this.noiseAngle += (this.noiseTarget - this.noiseAngle) * Math.min(1, dt * 3);

    // Advance along the track centerline with lateral lane offset.
    this.trackDist += this.speed * dt;
    const pos = sampleTrack(this.trackDist);
    const rx = Math.cos(pos.yaw);
    const rz = Math.sin(pos.yaw);
    this.x = pos.x + rx * this.laneOffset;
    this.z = pos.z + rz * this.laneOffset;
    this.yaw = pos.yaw + this.noiseAngle;

    // Update RacerState via trackProgress.
    const p = trackProgress(this.x, this.z);

    const previous = this.lastLapDist;
    this.lastLapDist = p.lapDist;
    const wrapped = previous !== null && previous > TOTAL_TRACK_LEN * 0.9 && p.lapDist < TOTAL_TRACK_LEN * 0.1;

    // Checkpoint gating (mirrors RaceSim.tickLocal logic).
    const sector = Math.floor(p.lapDist / (TOTAL_TRACK_LEN / 8));
    if (previous !== null) {
      const prevSector = Math.floor(previous / (TOTAL_TRACK_LEN / 8));
      if (sector === this.nextCheckpoint && prevSector === sector - 1) this.nextCheckpoint++;
    }
    this.state.checkpoint = this.nextCheckpoint - 1;
    if (sector === this.nextCheckpoint - 1 || this.state.dist > 0) {
      this.state.dist = (this.state.lap - 1) * TOTAL_TRACK_LEN + p.lapDist;
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
        this.state.dist = totalLaps * TOTAL_TRACK_LEN;
        return true;
      }
      this.state.lap += 1;
      this.state.dist = (this.state.lap - 1) * TOTAL_TRACK_LEN + p.lapDist;
    }

    return false;
  }

  /** Reset to a new start position when a rematch begins. */
  reset(startDist: number, startedAt: number): void {
    this.trackDist = startDist;
    const pos = sampleTrack(this.trackDist);
    const rx = Math.cos(pos.yaw);
    const rz = Math.sin(pos.yaw);
    this.x = pos.x + rx * this.laneOffset;
    this.z = pos.z + rz * this.laneOffset;
    this.yaw = pos.yaw;
    this.speed = 0;
    this.noiseAngle = 0; this.noiseTimer = 0; this.noiseTarget = 0;
    this.lapStartTime = startedAt;
    this.lastLapDist = null;
    this.nextCheckpoint = 1;
    Object.assign(this.state, {
      lap: 1, checkpoint: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0,
    });
  }
}
