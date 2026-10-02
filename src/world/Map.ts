import type { VehicleKind } from './Vehicles';

export interface Point { x: number; z: number }
export interface Box extends Point { w: number; d: number; h: number }
export interface Building extends Box { kind: 'apartment' | 'shop' | 'warehouse' | 'station'; shade: number; name?: string }
export interface Place extends Point { id: string; name: string; category: string; description: string }
export const LIMIT = 112;
export const ROADS = [-80, 0, 80];
/** Road half-width (8.5m asphalt) + racing clearance. Nothing drivable may sit inside. */
export const ROAD_HALF = 8.5;
export const RACE_CLEARANCE = 11;
/** True when (x,z) sits on any road band (centerlines ROADS, half-width half). */
export function onRoad(x: number, z: number, half = ROAD_HALF): boolean {
  return ROADS.some((line) => Math.abs(x - line) < half || Math.abs(z - line) < half);
}
export const PLACES: Place[] = [
  { id: 'plaza', name: 'Civic Square', category: 'PUBLIC SPACE', x: -27, z: 23, description: 'A quiet square at the heart of the district.' },
  { id: 'market', name: 'Market Street', category: 'SHOPS & CAFÉS', x: 22, z: -12, description: 'Small storefronts, long sidewalks, familiar faces.' },
  { id: 'park', name: 'North Gardens', category: 'PARK', x: 44, z: -48, description: 'A little room to breathe between the buildings.' },
  { id: 'homes', name: 'The Residences', category: 'NEIGHBORHOOD', x: -42, z: -27, description: 'Apartment blocks around a shared courtyard.' },
  { id: 'station', name: 'South Station', category: 'TRANSIT', x: 42, z: 27, description: 'The beginning of a journey. Platforms open to the sky.' },
  { id: 'works', name: 'The Foundry', category: 'INDUSTRIAL', x: -45, z: 65, description: 'Old workshops at the edge of the neighborhood.' },
  { id: 'game-center', name: 'Game Center', category: 'SPORTS & ARCADE', x: -22, z: 48, description: 'Table tennis hall. Walk in to play a match.' },
  { id: 'race-arena', name: 'Neon Paddock', category: 'RACING ARENA', x: -45, z: 82, description: 'Tokyo-drift paddock. Host a race, line up 8 cars, run the city loop.' },
];

/** Neon Paddock race arena anchor (north edge, off the racing line). */
export const RACE_ARENA = { x: -45, z: 82 };
/** Game Center court anchor (off-road block between Civic Square and The Foundry). */
export const GAME_CENTER = { x: -22, z: 48 };
/** Basketball hoop anchor: side court north of the table hall. Shooter stands ~4.2m south of the rim. */
export const HOOP = { x: -22, z: 64.5 };
export const FREE_THROW_DIST = 4.2;
/** Rim/backboard dims in meters. */
export const RIM = { h: 3.05, r: 0.225, tube: 0.02, boardW: 1.8, boardH: 1.05, boardBottom: 2.9, boardZ: 0.45 };
/** ITTF table dims in meters, centered on GAME_CENTER. w = width across X, d = length along play axis Z. */
export const TABLE = { w: 1.525, d: 2.74, h: 0.76, netH: 0.1525 };

export function buildings(): Building[] {
  const result: Building[] = [];
  const add = (x: number, z: number, w: number, d: number, h: number, kind: Building['kind'], shade: number, name?: string) => result.push({ x, z, w, d, h, kind, shade, name });
  add(-26, -48, 19, 19, 22, 'apartment', 0, '01');
  add(-53, -49, 19, 25, 31, 'apartment', 1, '02');
  add(-58, -20, 14, 13, 14, 'apartment', 2, '03');
  add(24, -22, 17, 13, 8, 'shop', 1, 'COFFEE');
  add(47, -20, 19, 13, 10, 'shop', 0, 'MARKET');
  add(65, -45, 9, 24, 14, 'apartment', 2);
  add(39, 44, 29, 17, 11, 'station', 1, 'SOUTH STATION');
  add(64, 60, 11, 17, 16, 'apartment', 0);
  add(-45, 53, 30, 18, 12, 'warehouse', 2, 'FOUNDRY');
  add(-65, 28, 12, 18, 8, 'warehouse', 1);
  // Perimeter blocks reuse the same three facade families.
  for (let i = 0; i < 4; i++) {
    const x = [-52, -27, 27, 52][i];
    add(x, -101, 20, 14, 12 + (i % 3) * 7, i % 2 ? 'shop' : 'apartment', i % 3);
    add(x, 101, 20, 14, 10 + (i % 3) * 5, 'apartment', (i + 1) % 3);
  }
  for (const x of [-101, 101]) for (const z of [-48, -18, 22, 54]) add(x, z, 14, 18, 12 + Math.abs(z) % 17, 'apartment', Math.abs(z) % 3);
  return result;
}
export const BUILDINGS = buildings();
export const SOLIDS: Box[] = [...BUILDINGS,
  { x: -27, z: 23, w: 4, d: 4, h: 2.5 },
  { x: 43, z: -48, w: 7, d: 7, h: 0.8 },
  // Table tennis table body blocks walking (players enter via E, not by walking through).
  { x: GAME_CENTER.x, z: GAME_CENTER.z, w: TABLE.w, d: TABLE.d, h: TABLE.h },
  // Basketball pole + stanchion (rim overhangs the court, walkable under it).
  { x: HOOP.x, z: HOOP.z + 0.9, w: 0.5, d: 0.5, h: 3.9 },
];

export interface Collider { x: number; z: number; r: number; kind: 'prop' | 'vehicle' | 'ped'; label?: string }
/** Street furniture + parked cars that now block movement (Phase 0 colliders). */
export const PARKED_CARS: Collider[] = [
  { x: -14, z: -38, r: 2.4, kind: 'vehicle', label: 'parked-van' },
  { x: 14, z: -54, r: 2.2, kind: 'vehicle', label: 'parked-car' },
  { x: 55, z: 16, r: 2.2, kind: 'vehicle', label: 'parked-car' },
];
/** Lamp posts line the x=0 avenue; any lamp falling inside a cross-road band
 *  is pushed along the sidewalk so no post ever stands on driving asphalt. */
export const LAMPS: Collider[] = [];
for (const x of [-12, 12]) {
  for (let z = -67; z < 80; z += 24) {
    let lz = z;
    if (ROADS.some((line) => Math.abs(lz - line) < RACE_CLEARANCE)) lz += 14;
    LAMPS.push({ x, z: lz, r: 0.35, kind: 'prop', label: 'lamp' });
  }
}
/** Shared with Assets so visuals and colliders can never drift apart. */
export const BENCHES: readonly (readonly [number, number])[] = [[-36, 32], [-20, 32], [31, -56], [49, -56], [26, 26]];
export const TREES: readonly (readonly [number, number])[] = [[27, -39], [28, -60], [51, -62], [53, -38], [36, -63], [-42, 16], [-43, 31], [-15, 16], [20, 62], [56, 24]];
export const PROPS: Collider[] = [
  ...LAMPS,
  { x: -27, z: 23, r: 3.2, kind: 'prop', label: 'sculpture' },
  { x: 43, z: -48, r: 3.8, kind: 'prop', label: 'fountain' },
  ...BENCHES.map(([x, z]): Collider => ({ x, z, r: 1.2, kind: 'prop', label: 'bench' })),
  ...TREES.map(([x, z]): Collider => ({ x, z, r: 0.6, kind: 'prop', label: 'tree' })),
  { x: 30, z: 62, r: 0.5, kind: 'prop', label: 'canopy-pillar' },
  { x: 42, z: 62, r: 0.5, kind: 'prop', label: 'canopy-pillar' },
  { x: 54, z: 62, r: 0.5, kind: 'prop', label: 'canopy-pillar' },
];
/** Roomy paddock layout (slab 44x22): wide walk aisles between everything.
 *  The z=76 racing line runs through the slab, so the display sits just north
 *  of it, with generous gaps to traffic, tents, and the spectator rows. */
export const RACE_SLAB = { w: 44, d: 22 };
/** Paddock show-car display row: 6.4m spacing leaves ~4.4m walk aisles. */
export const RACE_SHOW_CARS: readonly { kind: VehicleKind; x: number; z: number; yaw: number }[] = [
  { kind: 'hyper', x: -61, z: 81.5, yaw: 0.15 },
  { kind: 'raptor', x: -54.6, z: 81.5, yaw: -0.1 },
  { kind: 'jeep', x: -48.2, z: 81.5, yaw: 0.1 },
  { kind: 'patrol', x: -41.8, z: 81.5, yaw: -0.15 },
  { kind: 'egt', x: -35.4, z: 81.5, yaw: 0.12 },
  { kind: 'track', x: -29, z: 81.5, yaw: -0.08 },
];
/** Static spectator rows flanking the display (clear of the racing line and tents). */
export interface CrowdSpot { x: number; z: number; yaw: number }
export const RACE_CROWD: CrowdSpot[] = (() => {
  const spots: CrowdSpot[] = [];
  const cx = RACE_ARENA.x, cz = RACE_ARENA.z;
  for (let i = 0; i < 9; i++) {
    const x = cx - 15 + i * 3.75;
    for (const z of [cz - 3.5, cz + 3]) {
      spots.push({ x, z, yaw: Math.atan2(cx - x, -(cz - z)) });
    }
  }
  return spots;
})();
export const TRAFFIC_ROUTE = [{ x: -76, z: -76 }, { x: 76, z: -76 }, { x: 76, z: 76 }, { x: -76, z: 76 }];
export function circleHit(ax: number, az: number, ar: number, bx: number, bz: number, br: number): boolean {
  const dx = ax - bx, dz = az - bz, r = ar + br;
  return dx * dx + dz * dz < r * r;
}

export function intersects(x: number, z: number, radius: number, boxes: readonly Box[] = SOLIDS): boolean {
  return boxes.some(box => {
    const cx = Math.max(box.x - box.w / 2, Math.min(x, box.x + box.w / 2));
    const cz = Math.max(box.z - box.d / 2, Math.min(z, box.z + box.d / 2));
    return (x - cx) ** 2 + (z - cz) ** 2 < radius ** 2;
  });
}
export function seeded(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}
