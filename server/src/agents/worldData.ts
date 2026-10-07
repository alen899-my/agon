/**
 * Minimal server-side world shape for agent steering.
 *
 * Mirrors the client map constants (`src/world/Map.ts`: ROADS, ROAD_HALF,
 * LIMIT, BUILDINGS). Cops only need coarse collision push-out, so the box
 * list is a snapshot — keep it in sync when the client map changes shape.
 * Drift here only affects cop pathing, never player physics.
 */

export const ROADS = [-140, -80, 0, 80, 140];
export const ROAD_HALF = 8.5;
export const WORLD_LIMIT = 160;

/** Police post anchor (South Station block). Cops spawn on the road nearby. */
export const POLICE_POST = { x: 42, z: 27 };

interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Building footprints copied from client Map.buildings() (+ station props). */
const BLOCKS: Box[] = [
  ...[-52, -27, 27, 52].flatMap(x => [-101, 101].map(z => ({ x, z, w: 20, d: 14 }))),
  ...[-101, 101].flatMap(x => [-48, -18, 22, 54].map(z => ({ x, z, w: 14, d: 18 }))),
  { x: -26, z: 23, w: 4, d: 4 },
  { x: 50, z: -38, w: 7, d: 7 },
  { x: -26, z: -48, w: 19, d: 19 },
  { x: -53, z: -49, w: 19, d: 25 },
  { x: -58, z: -20, w: 14, d: 13 },
  { x: 24, z: -22, w: 17, d: 13 },
  { x: 47, z: -20, w: 19, d: 13 },
  { x: 65, z: -45, w: 9, d: 24 },
  { x: 39, z: 44, w: 29, d: 17 },
  { x: 64, z: 60, w: 11, d: 17 },
  { x: -45, z: 53, w: 30, d: 18 },
  { x: -65, z: 28, w: 12, d: 18 },
  { x: 115, z: -108, w: 24, d: 16 },
  { x: 118, z: -62, w: 18, d: 10 },
  { x: 114, z: 108, w: 26, d: 18 },
  { x: 116, z: 122, w: 18, d: 8 },
  { x: -115, z: 112, w: 18, d: 16 },
  { x: -60, z: 118, w: 14, d: 14 },
  { x: -30, z: 118, w: 20, d: 15 },
  { x: 38, z: 118, w: 20, d: 15 },
  { x: 60, z: 118, w: 12, d: 14 },
  { x: -40, z: -120, w: 20, d: 14 },
  { x: 40, z: -120, w: 20, d: 14 },
  { x: 118, z: -125, w: 18, d: 8 },
];

export function clampWorld(v: number): number {
  return Math.max(-WORLD_LIMIT + 4, Math.min(WORLD_LIMIT - 4, v));
}

/** Push a circle (x,z,r) out of every building box. Returns corrected point. */
export function pushOutOfBlocks(x: number, z: number, r: number, extra: readonly Box[] = []): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const b of [...BLOCKS, ...extra]) {
    const dx = px - b.x;
    const dz = pz - b.z;
    const ox = b.w / 2 + r - Math.abs(dx);
    if (ox <= 0) continue;
    const oz = b.d / 2 + r - Math.abs(dz);
    if (oz <= 0) continue;
    if (ox < oz) px = b.x + Math.sign(dx || 1) * (b.w / 2 + r);
    else pz = b.z + Math.sign(dz || 1) * (b.d / 2 + r);
  }
  return { x: px, z: pz };
}

/** Nearest road-line coordinate for one axis (keeps cruisers on asphalt). */
export function nearestRoadLine(v: number): number {
  let best = ROADS[0];
  for (const r of ROADS) if (Math.abs(v - r) < Math.abs(v - best)) best = r;
  return best;
}
