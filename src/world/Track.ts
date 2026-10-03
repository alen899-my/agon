import { TRAFFIC_ROUTE, type Point } from './Map';

function routePoint(points: readonly Point[], distance: number): Point & { yaw: number } {
  const lengths = points.map((p, i) => Math.hypot(points[(i + 1) % points.length].x - p.x, points[(i + 1) % points.length].z - p.z));
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = ((distance % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    if (remaining <= lengths[i]) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      const t = remaining / lengths[i];
      return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, yaw: Math.atan2(q.x - p.x, p.z - q.z) };
    }
    remaining -= lengths[i];
  }
  return { ...points[0], yaw: 0 };
}

export const TRACK_POINTS = TRAFFIC_ROUTE;
export const TRACK_LENGTH = (() => {
  let total = 0;
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const p = TRACK_POINTS[i];
    const q = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    total += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return total;
})();

/** Start/finish sits on the Neon Paddock main straight (x=-60, z=76), heading east under the Tokyo Speed Arena gantry. Grid stacks behind it. */
export const START_OFFSET = 76;
export const CHECKPOINT_COUNT = 8;
export const MAX_RACERS = 8;

export interface GridSlot { x: number; z: number; yaw: number }
export interface TrackProgress { dist: number; lapDist: number; checkpoint: number; lateral: number; tangentYaw: number }

/** 8 staggered grid slots on the road (2 cols x 4 rows), all on drivable asphalt behind the gantry. */
export function gridSlots(): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let i = 0; i < MAX_RACERS; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2; // 0 = left, 1 = right
    const back = 6 + row * 6;
    const offset = ((START_OFFSET - back) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
    const p = routePoint(TRACK_POINTS, offset);
    // Lateral offset: right vector = (cos yaw, sin yaw). Road half-width ~8.5m, use ±2.2m.
    const rx = Math.cos(p.yaw);
    const rz = Math.sin(p.yaw);
    const side = col === 0 ? -2.2 : 2.2;
    slots.push({ x: p.x + rx * side, z: p.z + rz * side, yaw: p.yaw });
  }
  return slots;
}

/** Project (x,z) onto the 4-segment loop. Cheap: 4 segment projections. */
export function trackProgress(x: number, z: number): TrackProgress {
  let bestDist = 0;
  let bestLateral = Infinity;
  let bestTangentYaw = 0;
  let acc = 0;
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const p: Point = TRACK_POINTS[i];
    const q: Point = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const t = Math.max(0, Math.min(1, ((x - p.x) * ux + (z - p.z) * uz) / len));
    const px = p.x + ux * len * t;
    const pz = p.z + uz * len * t;
    const lateral = Math.hypot(x - px, z - pz);
    if (lateral < bestLateral) {
      bestLateral = lateral;
      bestDist = acc + len * t;
      bestTangentYaw = Math.atan2(ux, -uz);
    }
    acc += len;
  }
  const lapDist = ((bestDist - START_OFFSET) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
  const checkpoint = Math.floor((lapDist / TRACK_LENGTH) * CHECKPOINT_COUNT) % CHECKPOINT_COUNT;
  return { dist: bestDist, lapDist, checkpoint, lateral: bestLateral, tangentYaw: bestTangentYaw };
}

/** Signed forward speed along track tangent. Negative = wrong way. */
export function forwardAlongTrack(vx: number, vz: number, tangentYaw: number): number {
  const fx = Math.sin(tangentYaw);
  const fz = -Math.cos(tangentYaw);
  return vx * fx + vz * fz;
}

/** 8 evenly spaced checkpoint world positions (for direction arrow + map pulse). */
export function checkpoints(): (Point & { yaw: number })[] {
  const pts: (Point & { yaw: number })[] = [];
  for (let i = 0; i < CHECKPOINT_COUNT; i++) {
    pts.push(routePoint(TRACK_POINTS, START_OFFSET + (i / CHECKPOINT_COUNT) * TRACK_LENGTH));
  }
  return pts;
}

/** Next checkpoint ahead of (x,z): index + bearing yaw + distance. Racing-only guide. */
export function nextCheckpoint(x: number, z: number, requiredIndex?: number): { index: number; x: number; z: number; yaw: number; dist: number } {
  const p = trackProgress(x, z);
  const cps = checkpoints();
  // Next checkpoint whose centerline distance is ahead of us (wrap-aware).
  let best = 0;
  let bestAhead = Infinity;
  for (let i = 0; i < cps.length; i++) {
    const cpDist = (START_OFFSET + (i / CHECKPOINT_COUNT) * TRACK_LENGTH) % TRACK_LENGTH;
    const ahead = ((cpDist - p.dist) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
    if (ahead < bestAhead) {
      bestAhead = ahead;
      best = i;
    }
  }
  if (requiredIndex !== undefined) best = ((requiredIndex % CHECKPOINT_COUNT) + CHECKPOINT_COUNT) % CHECKPOINT_COUNT;
  const c = cps[best];
  const dx = c.x - x;
  const dz = c.z - z;
  return { index: best, x: c.x, z: c.z, yaw: Math.atan2(dx, -dz), dist: Math.hypot(dx, dz) };
}

/** Start/finish world anchor (on the road centerline). */
export function startLine(): Point & { yaw: number } {
  return routePoint(TRACK_POINTS, START_OFFSET);
}

export function formatRaceTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.0';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const d = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

export interface RaceTurn {
  name: string;
  x: number;
  z: number;
  dir: 'right' | 'left';
  label: string;
  sub: string;
}

export const RACE_TURNS: RaceTurn[] = [
  { name: 'TURN 1', x: 76, z: 76, dir: 'right', label: 'HARD RIGHT', sub: 'EAST AVENUE DRIFT' },
  { name: 'TURN 2', x: 76, z: -76, dir: 'left', label: 'SHARP LEFT', sub: 'HARBOR DOCKS ENTRY' },
  { name: 'TURN 3', x: 136, z: -76, dir: 'right', label: 'RIGHT', sub: 'WATERFRONT SPRINT' },
  { name: 'TURN 4', x: 136, z: -136, dir: 'right', label: 'HARD RIGHT', sub: 'SOUTH HIGHWAY' },
  { name: 'TURN 5', x: -136, z: -136, dir: 'right', label: 'HARD RIGHT', sub: 'WEST BOULEVARD' },
  { name: 'TURN 6', x: -136, z: 76, dir: 'right', label: 'FINAL CORNER', sub: 'MAIN STRAIGHT' },
];

/** Fast & Furious upcoming turn calculation along the Grand Circuit. */
export function nextTurn(x: number, z: number): { turn: RaceTurn; dist: number; isApproaching: boolean; isApex: boolean } {
  const p = trackProgress(x, z);
  let bestTurn = RACE_TURNS[0];
  let minAhead = Infinity;

  for (const t of RACE_TURNS) {
    const tp = trackProgress(t.x, t.z);
    const ahead = ((tp.dist - p.dist) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
    if (ahead < minAhead) {
      minAhead = ahead;
      bestTurn = t;
    }
  }

  const directDist = Math.hypot(bestTurn.x - x, bestTurn.z - z);
  const dist = Math.min(minAhead, directDist);
  return {
    turn: bestTurn,
    dist,
    isApproaching: dist <= 110,
    isApex: dist <= 24,
  };
}

