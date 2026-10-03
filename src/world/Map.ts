import type { VehicleKind } from './Vehicles';

export interface Point { x: number; z: number }
export interface Box extends Point { w: number; d: number; h: number }
export interface Building extends Box { kind: 'apartment' | 'shop' | 'warehouse' | 'station'; shade: number; name?: string }
export interface Place extends Point { id: string; name: string; category: string; description: string }
export const LIMIT = 160;
export const ROADS = [-140, -80, 0, 80, 140];
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
  { id: 'harbor', name: 'East Harbor', category: 'DOCKS', x: 108, z: -95, description: 'Warehouses and piers at the edge of the district.' },
  { id: 'heights', name: 'North Heights', category: 'NEIGHBORHOOD', x: -48, z: 105, description: 'New shops and homes above the old blocks.' },
  { id: 'falls', name: 'Harbor Falls', category: 'LANDMARK', x: 104, z: -122, description: 'A roaring cascade where the docks meet the rocks.' },
  { id: 'garden', name: 'Heights Garden', category: 'PARK', x: 30, z: 99, description: 'A quiet statue garden between the new shops.' },
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
  // East Harbor docks (outer band x in [91,129], clear of the x=80/140 roads and the x=101 strip).
  // Wide low warehouses: big floor plates, low height = few window rows = cheap instancing.
  add(115, -108, 24, 16, 9, 'warehouse', 1, 'PIER 1');
  add(118, -62, 18, 10, 8, 'warehouse', 2, 'PIER 2');
  add(114, 108, 26, 18, 10, 'warehouse', 0, 'DEPOT');
  add(116, 122, 18, 8, 9, 'warehouse', 1);
  // North Heights suburbs (outer band z in [91,129], clear of z=80/140 roads and the z=101 row).
  add(-115, 112, 18, 16, 13, 'apartment', 0, '07');
  add(-60, 118, 14, 14, 11, 'apartment', 1);
  add(-30, 118, 20, 15, 12, 'shop', 2, 'MART');
  add(38, 118, 20, 15, 10, 'shop', 0, 'BAZAAR');
  add(60, 118, 12, 14, 14, 'apartment', 2, '08');
  // South Gate low shops (mirror band z in [-129,-91], clear of the z=-101 row).
  add(-40, -120, 20, 14, 8, 'shop', 1, 'GATE');
  add(40, -120, 20, 14, 9, 'shop', 0, 'YARD');
  // Harbor cold store: long low box deep in the east band.
  add(118, -125, 18, 8, 8, 'warehouse', 2, 'COLD STORE');
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
  { x: 100, z: -95, r: 2.2, kind: 'vehicle', label: 'parked-car' },
  { x: -48, z: 100, r: 2.2, kind: 'vehicle', label: 'parked-car' },
  // New-district fleet: one of each flavor so stealing feels different per area.
  { x: 97, z: -122, r: 2.2, kind: 'vehicle', label: 'parked-muscle' },
  { x: 122, z: -45, r: 2.4, kind: 'vehicle', label: 'parked-van' },
  { x: -20, z: 98, r: 2.2, kind: 'vehicle', label: 'parked-taxi' },
  { x: 100, z: 93, r: 2.2, kind: 'vehicle', label: 'parked-car' },
  { x: -64, z: -115, r: 2.2, kind: 'vehicle', label: 'parked-pickup' },
  { x: 64, z: -115, r: 2.2, kind: 'vehicle', label: 'parked-coupe' },
];
/** Lamp posts line the x=0 avenue and the inner sidewalks of the ±140 belt;
 *  any lamp falling inside a cross-road band is pushed along the sidewalk
 *  so no post ever stands on driving asphalt. */
export const LAMPS: Collider[] = [];
for (const x of [-12, 12, -128, 128]) {
  for (let z = -140; z <= 150; z += 24) {
    let lz = z, nudges = 0;
    // Step along the sidewalk until clear (a +14 hop can land in the next
    // road band when avenues are 60m apart). Capped so it always terminates.
    while (ROADS.some((line) => Math.abs(lz - line) < RACE_CLEARANCE) && nudges < 6) { lz += 14; nudges++; }
    LAMPS.push({ x, z: lz, r: 0.35, kind: 'prop', label: 'lamp' });
  }
}
/** Shared with Assets so visuals and colliders can never drift apart. */
export const BENCHES: readonly (readonly [number, number])[] = [[-36, 32], [-20, 32], [31, -56], [49, -56], [26, 26], [104, -92], [-48, 122], [48, 122], [100, -98], [30, 104]];
export const TREES: readonly (readonly [number, number])[] = [[27, -39], [28, -60], [51, -62], [53, -38], [36, -63], [-42, 16], [-43, 31], [-15, 16], [20, 62], [56, 24], [125, -95], [-20, 105], [20, 105], [-64, 122], [64, 104], [95, -115], [95, -128], [100, -64], [-64, 100], [66, 100], [14, 99], [46, 99]];
export const PROPS: Collider[] = [
  ...LAMPS,
  { x: -27, z: 23, r: 3.2, kind: 'prop', label: 'sculpture' },
  { x: 43, z: -48, r: 3.8, kind: 'prop', label: 'fountain' },
  ...BENCHES.map(([x, z]): Collider => ({ x, z, r: 1.2, kind: 'prop', label: 'bench' })),
  ...TREES.map(([x, z]): Collider => ({ x, z, r: 0.6, kind: 'prop', label: 'tree' })),
  { x: 30, z: 62, r: 0.5, kind: 'prop', label: 'canopy-pillar' },
  { x: 42, z: 62, r: 0.5, kind: 'prop', label: 'canopy-pillar' },
  { x: 54, z: 62, r: 0.5, kind: 'prop', label: 'canopy-pillar' },
  // New-district landmarks (visuals in Assets buildHarbor/buildGarden share these anchors).
  { x: 95, z: -98, r: 1.4, kind: 'prop', label: 'statue' },
  { x: 104, z: -122, r: 3.4, kind: 'prop', label: 'fountain' },
  { x: 30, z: 99, r: 1.4, kind: 'prop', label: 'statue' },
];
/** Harbor Falls anchor (basin center) + Heights Garden statue anchor. */
export const FALLS = { x: 104, z: -122 };
export const HARBOR_STATUE = { x: 95, z: -98 };
export const GARDEN_STATUE = { x: 30, z: 99 };
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
/** Grand Circuit: shared race + traffic loop. One clean flowing direction —
 *  no out-and-back spurs or opposing legs. Every leg rides a road centerline
 *  (4m offset, well inside the 8.5m asphalt): a 168m south straight, chicane
 *  jog onto the x=76 line, S-curves through the middle, a sweeper past the
 *  arena, and a 272m west outer straight home. Checkpoints stay evenly spaced. */
export const TRAFFIC_ROUTE = [
  { x: -32, z: -136 },
  { x: 136, z: -136 },
  { x: 136, z: -84 },
  { x: 84, z: -84 },
  { x: 84, z: -8 },
  { x: 76, z: -4 },
  { x: 76, z: 76 },
  { x: -4, z: 76 },
  { x: -4, z: 136 },
  { x: -136, z: 136 },
  { x: -136, z: -136 },
];
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
