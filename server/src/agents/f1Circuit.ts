/**
 * F1 Circuit: separate hillside arena far from the city (does not reuse city streets).
 * Closed Catmull-Rom spline with elevation, curvy F1-style sectors, 2 DRS straights + pit lane.
 *
 * Coordinate frame: absolute world coords around F1_ORIGIN (far outside LIMIT=160
 * so city traffic/buildings/colliders never overlap). Race dist is measured in
 * XZ-plane metres along the centreline (elevation is visual + gentle grade only).
 */

export interface F1Point { x: number; z: number; y: number }

/** Island origin — far east so the city (within ±160) never overlaps. */
export const F1_ORIGIN = { x: 650, z: 0 };
/** Reception gantry on the road connecting the city to the circuit. */
export const F1_PORTAL_CITY = { x: F1_ORIGIN.x - 330, z: 80 };
/** Paddock anchor on the island (spectators, pit building, spawn before grid). */
export const F1_PADDOCK = { x: F1_ORIGIN.x - 40, z: -76 };
export const F1_TRACK_WIDTH = 13;
export const F1_HALF = F1_TRACK_WIDTH / 2;
export const F1_CHECKPOINT_COUNT = 8;
export const F1_START_OFFSET = 0;

export type RaceTrackId = 'city' | 'f1';

/** Ordered perimeter with an infield S section. The final two points approach
 * the start straight in its travel direction, avoiding a crossing at closure.
 * Heights stay above the island base and change gradually through the crests. */
const REL: [number, number, number][] = [
  [0, -110, 2],
  [100, -110, 2],
  [190, -105, 3],
  [248, -62, 5],
  [258, 5, 8],
  [220, 66, 11],
  [155, 90, 12],
  [95, 65, 10],
  [40, 102, 8],
  [-35, 145, 6],
  [-125, 145, 4],
  [-205, 130, 3],
  [-250, 80, 2],
  [-253, 15, 1],
  [-220, -48, 1],
  [-170, -100, 2],
  [-100, -110, 2],
];

const CONTROL: F1Point[] = REL.map(([dx, dz, y]) => ({
  x: F1_ORIGIN.x + dx,
  z: dz,
  y,
}));

interface Sample { x: number; z: number; y: number; yaw: number; dist: number; curvature: number }

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildSamples(): Sample[] {
  const n = CONTROL.length;
  const stepsPer = 64;
  const pts: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i + n - 1) % n];
    const p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n];
    const p3 = CONTROL[(i + 2) % n];
    for (let j = 0; j < stepsPer; j++) {
      const t = j / stepsPer;
      const x = catmull(p0.x, p1.x, p2.x, p3.x, t);
      const z = catmull(p0.z, p1.z, p2.z, p3.z, t);
      const y = catmull(p0.y, p1.y, p2.y, p3.y, t);
      // Exact spline derivative keeps the lane offsets normal to the road.
      const derivative = (a: number, b: number, c: number, d: number): number =>
        0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t * t);
      const yaw = Math.atan2(derivative(p0.x, p1.x, p2.x, p3.x), -derivative(p0.z, p1.z, p2.z, p3.z));
      const last = pts[pts.length - 1];
      const dist = last ? last.dist + Math.hypot(x - last.x, z - last.z) : 0;
      pts.push({ x, z, y, yaw, dist, curvature: 0 });
    }
  }
  const total = pts[pts.length - 1].dist + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  // Curvature from yaw deltas (smoothed over ±3 samples).
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 3 + pts.length) % pts.length];
    const b = pts[(i + 3) % pts.length];
    let dyaw = b.yaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const ds = (b.dist - a.dist + total) % total;
    pts[i].curvature = ds > 0 ? dyaw / ds : 0;
  }
  return pts;
}

const SAMPLES: Sample[] = buildSamples();

export const F1_LENGTH: number = (() => {
  const last = SAMPLES[SAMPLES.length - 1];
  return last.dist + Math.hypot(SAMPLES[0].x - last.x, SAMPLES[0].z - last.z);
})();

function sampleAtDist(dist: number): Sample {
  const d = ((dist % F1_LENGTH) + F1_LENGTH) % F1_LENGTH;
  // Binary search over dist.
  let lo = 0;
  let hi = SAMPLES.length - 1;
  if (d <= SAMPLES[0].dist) return SAMPLES[0];
  if (d >= SAMPLES[hi].dist) lo = hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (SAMPLES[mid].dist <= d) lo = mid;
    else hi = mid;
  }
  const a = SAMPLES[lo];
  const b = lo === SAMPLES.length - 1 ? { ...SAMPLES[0], dist: F1_LENGTH } : SAMPLES[hi];
  const span = b.dist - a.dist || 1;
  const t = (d - a.dist) / span;
  let dyaw = b.yaw - a.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    y: a.y + (b.y - a.y) * t,
    yaw: a.yaw + dyaw * t,
    dist: d,
    curvature: a.curvature + (b.curvature - a.curvature) * t,
  };
}

/** World pose at a centreline distance with lateral lane offset (right-positive). */
export function f1PathAt(distance: number, lane = 0): { x: number; z: number; y: number; yaw: number; curvature: number } {
  const s = sampleAtDist(distance + F1_START_OFFSET);
  const rx = Math.cos(s.yaw);
  const rz = Math.sin(s.yaw);
  return { x: s.x + rx * lane, z: s.z + rz * lane, y: s.y, yaw: s.yaw, curvature: s.curvature };
}

/** Projected distance of (x,z) onto the centreline (lane-aware). */
export function f1DistanceAt(x: number, z: number, _lane = 0): number {
  return f1Progress(x, z).dist;
}

export interface F1Progress {
  dist: number;
  lapDist: number;
  checkpoint: number;
  lateral: number;
  signedLateral: number;
  tangentYaw: number;
  height: number;
  grade: number;
  curvature: number;
}

/** Project (x,z) onto the spline. O(N) over ~360 samples — fine at 10Hz + per-frame for player. */
export function f1Progress(x: number, z: number): F1Progress {
  let best = 0;
  let bestLat = Infinity;
  let bestYaw = 0;
  let bestY = 0;
  let bestCurve = 0;
  // Coarse stride then refine around best (cheap + accurate).
  let bestIdx = 0;
  for (let i = 0; i < SAMPLES.length; i += 2) {
    const s = SAMPLES[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestLat * bestLat || bestLat === Infinity) {
      // True lateral via closest sample is enough for coarse pass.
      if (d2 < (bestLat === Infinity ? Infinity : bestLat * bestLat)) {
        bestLat = Math.sqrt(d2);
        bestIdx = i;
      }
    }
  }
  // Refine: project onto segments around bestIdx ±3.
  bestLat = Infinity;
  for (let k = -4; k < 4; k++) {
    const a = SAMPLES[(bestIdx + k + SAMPLES.length) % SAMPLES.length];
    const b = SAMPLES[(bestIdx + k + 1 + SAMPLES.length) % SAMPLES.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const lat = Math.hypot(x - px, z - pz);
    if (lat < bestLat) {
      bestLat = lat;
      const segLen = Math.sqrt(len2);
      best = a.dist + segLen * t;
      bestYaw = Math.atan2(dx, -dz);
      bestY = a.y + (b.y - a.y) * t;
      bestCurve = a.curvature;
    }
  }
  const lapDist = ((best - F1_START_OFFSET) % F1_LENGTH + F1_LENGTH) % F1_LENGTH;
  const checkpoint = Math.floor((lapDist / F1_LENGTH) * F1_CHECKPOINT_COUNT) % F1_CHECKPOINT_COUNT;
  // Grade: sample ±8m for gentle slope factor.
  const ahead = sampleAtDist(best + 8);
  const behind = sampleAtDist(best - 8);
  const grade = (ahead.y - behind.y) / 16;
  const center = sampleAtDist(best);
  const signedLateral = (x - center.x) * Math.cos(bestYaw) + (z - center.z) * Math.sin(bestYaw);
  return { dist: best % F1_LENGTH, lapDist, checkpoint, lateral: bestLat, signedLateral, tangentYaw: bestYaw, height: bestY, grade, curvature: bestCurve };
}

/** True when (x,z) is on F1 asphalt. */
export function f1OnTrack(x: number, z: number, half = F1_HALF): boolean {
  // Quick reject far from island.
  if (Math.abs(x - F1_ORIGIN.x) > 320 || Math.abs(z) > 220) return false;
  const p = f1Progress(x, z);
  return p.lateral < half || f1IsPit(p);
}

/** Rolling parkland base: deterministic ±3m hills so the island reads as countryside. */
export function f1BaseNoise(x: number, z: number): number {
  return (
    Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.017 + 0.6) * 1.4 +
    Math.sin(x * 0.008 + 0.3) * Math.sin(z * 0.011 + 2.1) * 1.8
  );
}

/**
 * Terrain height off the asphalt: track-corridor lift blending out to rolling
 * base by ~110m. The road visuals (terrain mesh + skirts) and physics
 * (Map.groundHeight) share this so cars never float or sink on grass.
 */
export function f1TerrainHeightAt(x: number, z: number): number {
  const p = f1Progress(x, z);
  const base = f1BaseNoise(x, z);
  const shoulder = p.signedLateral > 0 && f1InPitSpan(p.lapDist) ? F1_PIT.laneOffset + 12 : F1_HALF + 12;
  if (p.lateral <= shoulder) return p.height;
  const t = Math.max(0, Math.min(1, (p.lateral - shoulder) / (110 - shoulder)));
  const smooth = t * t * (3 - 2 * t);
  return p.height * (1 - smooth) + base * smooth;
}

/** Drivable surface height: track height on asphalt, terrain blend off-track. */
export function f1HeightAt(x: number, z: number): number {
  if (Math.abs(x - F1_ORIGIN.x) > 340 || Math.abs(z) > 240) return 0;
  const p = f1Progress(x, z);
  if (p.lateral <= F1_HALF + 2) return p.height;
  return f1TerrainHeightAt(x, z);
}

/**
 * Corner zones for kerbs/boards: centreline ranges where the track actually
 * turns (|curvature| above threshold), merged to runs of at least minLen.
 * Real F1 has kerbs only at corners — never on straights.
 */
export interface F1KerbZone { start: number; end: number; side: 1 | -1 }
export function f1KerbZones(threshold = 0.008, minLen = 18, step = 4): F1KerbZone[] {
  const zones: F1KerbZone[] = [];
  let runStart = -1;
  let runSide = 0;
  const count = Math.floor(F1_LENGTH / step);
  const flush = (endDist: number): void => {
    if (runStart >= 0 && endDist - runStart >= minLen) {
      zones.push({ start: runStart, end: endDist, side: (runSide >= 0 ? 1 : -1) as 1 | -1 });
    }
    runStart = -1;
    runSide = 0;
  };
  for (let i = 0; i <= count; i++) {
    const d = (i / count) * F1_LENGTH;
    const c = sampleAtDist(d).curvature;
    if (Math.abs(c) > threshold) {
      if (runStart < 0) runStart = d;
      runSide += c;
    } else {
      flush(d);
    }
  }
  flush(F1_LENGTH);
  return zones;
}

export interface F1GridSlot { x: number; z: number; y: number; yaw: number }

/** 8 staggered grid slots behind the start line. */
export function f1GridSlots(): F1GridSlot[] {
  const slots: F1GridSlot[] = [];
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const back = 10 + row * 12 + col * 6;
    const offset = ((F1_START_OFFSET - back) % F1_LENGTH + F1_LENGTH) % F1_LENGTH;
    const s = sampleAtDist(offset);
    const rx = Math.cos(s.yaw);
    const rz = Math.sin(s.yaw);
    const side = col === 0 ? -2.4 : 2.4;
    slots.push({ x: s.x + rx * side, z: s.z + rz * side, y: s.y, yaw: s.yaw });
  }
  return slots;
}

export function f1StartLine(): { x: number; z: number; y: number; yaw: number } {
  const s = sampleAtDist(F1_START_OFFSET);
  return { x: s.x, z: s.z, y: s.y, yaw: s.yaw };
}

export function f1Checkpoints(): { x: number; z: number; y: number; yaw: number }[] {
  const pts: { x: number; z: number; y: number; yaw: number }[] = [];
  for (let i = 0; i < F1_CHECKPOINT_COUNT; i++) {
    const s = sampleAtDist(F1_START_OFFSET + (i / F1_CHECKPOINT_COUNT) * F1_LENGTH);
    pts.push({ x: s.x, z: s.z, y: s.y, yaw: s.yaw });
  }
  return pts;
}

/** Two DRS straights as lap-distance ranges (start straight + back straight). */
export const F1_DRS_ZONES: { name: string; start: number; end: number }[] = [
  { name: 'DRS 1 · START/FINISH', start: F1_LENGTH - 90, end: 145 },
  { name: 'DRS 2 · BACK STRAIGHT', start: F1_LENGTH * 0.54, end: F1_LENGTH * 0.64 },
];

/** True when a lap-distance sits inside a DRS zone. */
export function f1InDrs(lapDist: number): boolean {
  const d = ((lapDist % F1_LENGTH) + F1_LENGTH) % F1_LENGTH;
  return F1_DRS_ZONES.some((z) => (z.start <= z.end ? d >= z.start && d <= z.end : d >= z.start || d <= z.end));
}

/** Pit lane: parallel to the start straight, right side (+lateral). */
export const F1_PIT = {
  entryDist: F1_LENGTH - 140,
  exitDist: 140,
  laneOffset: F1_HALF + 7,
  speedLimit: 80 / 3.6,
  boxCount: 8,
};

export function f1PitLaneAt(dist: number): { x: number; z: number; y: number; yaw: number } {
  return f1PathAt(dist, f1PitOffset(dist));
}

export function f1PitOffset(dist: number): number {
  const d = ((dist % F1_LENGTH) + F1_LENGTH) % F1_LENGTH;
  const along = (d - F1_PIT.entryDist + F1_LENGTH) % F1_LENGTH;
  const span = F1_LENGTH - F1_PIT.entryDist + F1_PIT.exitDist;
  const t = Math.max(0, Math.min(1, along / 40, (span - along) / 40));
  return (F1_HALF - 2.8) + (F1_PIT.laneOffset - F1_HALF + 2.8) * t * t * (3 - 2 * t);
}

export function f1IsPit(p: F1Progress): boolean {
  return f1InPitSpan(p.lapDist) && p.signedLateral > F1_HALF + 0.5 && Math.abs(p.signedLateral - f1PitOffset(p.lapDist)) <= 2.8;
}

export function f1HasPitWall(dist: number): boolean {
  const d = ((dist % F1_LENGTH) + F1_LENGTH) % F1_LENGTH;
  return d > F1_LENGTH - 90 || d < 90;
}

export function f1AtPitBox(p: F1Progress): boolean {
  return f1IsPit(p) && Array.from({ length: F1_PIT.boxCount }, (_, i) => F1_LENGTH - 80 + i * 20)
    .some(d => Math.abs(((p.lapDist - d + F1_LENGTH * 1.5) % F1_LENGTH) - F1_LENGTH / 2) < 3);
}

/** Shared by visible barriers and collision detection. */
export function f1BarrierOffset(dist: number, side: number): number {
  const p = sampleAtDist(dist);
  const runoff = 6 + Math.min(7, Math.abs(p.curvature) * 450);
  return side * (side > 0 && f1InPitSpan(dist) ? Math.max(F1_HALF + runoff, f1PitOffset(dist) + 4) : F1_HALF + runoff);
}

/** True when lapDist is within the pit-lane span (wrap-aware). */
export function f1InPitSpan(lapDist: number): boolean {
  const d = ((lapDist % F1_LENGTH) + F1_LENGTH) % F1_LENGTH;
  const { entryDist, exitDist } = F1_PIT;
  return d >= entryDist || d <= exitDist;
}

export function formatF1Time(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.0';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const d = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

export interface F1Turn { name: string; x: number; z: number; label: string; sub: string }

const TURN_POINTS = [
  { name: 'T1', index: 3, label: 'UPHILL LEFT', sub: 'T1 · CLIMB' },
  { name: 'T2', index: 5, label: 'CREST LEFT', sub: 'CREST · LATE APEX' },
  { name: 'T3-T4', index: 7, label: 'S-CURVES', sub: 'HILL TOP · FLOW' },
  { name: 'T5', index: 9, label: 'DOWNHILL RIGHT', sub: 'BACK STRAIGHT ENTRY' },
  { name: 'T6', index: 12, label: 'WEST HAIRPIN', sub: 'BRAKE · LATE APEX' },
  { name: 'T7-T8', index: 15, label: 'FINAL SWEEP', sub: 'ONTO THE STRAIGHT' },
];

export const F1_TURNS: F1Turn[] = TURN_POINTS.map((t) => {
  const s = CONTROL[t.index];
  return { name: t.name, x: s.x, z: s.z, label: t.label, sub: t.sub };
});

/** Next F1 turn ahead of (x,z) along the centreline. */
export function f1NextTurn(x: number, z: number): { turn: F1Turn; dist: number; isApproaching: boolean; isApex: boolean } {
  const p = f1Progress(x, z);
  let bestTurn = F1_TURNS[0];
  let minAhead = Infinity;
  for (let i = 0; i < F1_TURNS.length; i++) {
    const t = F1_TURNS[i];
    const tp = f1Progress(t.x, t.z);
    const ahead = ((tp.dist - p.dist) % F1_LENGTH + F1_LENGTH) % F1_LENGTH;
    if (ahead < minAhead) {
      minAhead = ahead;
      bestTurn = t;
    }
  }
  const dist = minAhead;
  return { turn: bestTurn, dist, isApproaching: dist <= 130, isApex: dist <= 26 };
}
