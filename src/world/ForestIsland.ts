/** One deterministic source for road rendering, traction, navigation and tree clearance. */
export const FOREST = { x: -510, z: 0, rx: 230, rz: 170, roadHalf: 6, start: -670, end: -150 };
export const FOREST_LOOP_POINTS = Array.from({ length: 193 }, (_, i) => {
  const angle = i / 192 * Math.PI * 2;
  return { x: FOREST.x + Math.cos(angle) * 160, z: Math.sin(angle) * 108 };
});
export const FOREST_ROAD_POINTS = Array.from({ length: 51 }, (_, i) => ({ x: -350 + i * 4, z: 0 }));
export const FOREST_ROAD_PATHS = [FOREST_LOOP_POINTS, FOREST_ROAD_POINTS];
type Segment = { x: number; z: number; dx: number; dz: number; length2: number };
const roadCells = new Map<string, Segment[]>();
for (const path of FOREST_ROAD_PATHS) for (let i = 1; i < path.length; i++) {
  const a = path[i - 1], b = path[i];
  const segment = { x: a.x, z: a.z, dx: b.x - a.x, dz: b.z - a.z, length2: (b.x - a.x) ** 2 + (b.z - a.z) ** 2 };
  for (let x = Math.floor((Math.min(a.x, b.x) - 24) / 24); x <= Math.floor((Math.max(a.x, b.x) + 24) / 24); x++) {
    for (let z = Math.floor((Math.min(a.z, b.z) - 24) / 24); z <= Math.floor((Math.max(a.z, b.z) + 24) / 24); z++) {
      const key = `${x}:${z}`, bucket = roadCells.get(key) ?? [];
      bucket.push(segment); roadCells.set(key, bucket);
    }
  }
}
export function forestDistance(x: number, z: number): number {
  const island = (1 - Math.hypot((x - FOREST.x) / FOREST.rx, z / FOREST.rz)) * 170;
  return Math.max(island, Math.min(x + 350, -135 - x, 8 - Math.abs(z)));
}
export function onForestRoad(x: number, z: number, half = FOREST.roadHalf): boolean {
  const segments = roadCells.get(`${Math.floor(x / 24)}:${Math.floor(z / 24)}`);
  if (!segments) return false;
  for (const s of segments) {
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / s.length2));
    if ((x - s.x - s.dx * t) ** 2 + (z - s.z - s.dz * t) ** 2 < half * half) return true;
  }
  return false;
}
// A flat forest floor keeps the loop and bridge seamlessly drivable.
export function forestHeight(_x: number, _z: number): number { return 0; }
let seed = 7391;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
export const FOREST_TREES: { x: number; z: number; height: number; radius: number }[] = [];
const cells = new Map<string, typeof FOREST_TREES>();
for (let x = -732; x < -285; x += 5.5) for (let z = -164; z < 164; z += 5.5) {
  const tx = x + random() * 3.5, tz = z + random() * 3.5;
  if (forestDistance(tx, tz) < 7 || onForestRoad(tx, tz, 8.5)) continue;
  const tree = { x: tx, z: tz, height: 14 + random() * 13, radius: 0.35 + random() * 0.25 };
  FOREST_TREES.push(tree);
  const key = `${Math.floor(tx / 16)}:${Math.floor(tz / 16)}`;
  const bucket = cells.get(key) ?? []; bucket.push(tree); cells.set(key, bucket);
}
// Cache neighborhoods: swept car contacts query these many times per fixed step.
const neighborhoods = new Map<string, typeof FOREST_TREES>();
const empty: typeof FOREST_TREES = [];
for (let cx = -48; cx <= -16; cx++) for (let cz = -12; cz <= 12; cz++) {
  const bucket: typeof FOREST_TREES = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) bucket.push(...(cells.get(`${cx + dx}:${cz + dz}`) ?? empty));
  neighborhoods.set(`${cx}:${cz}`, bucket);
}
export function nearbyForestTrees(x: number, z: number): readonly (typeof FOREST_TREES)[number][] {
  return neighborhoods.get(`${Math.floor(x / 16)}:${Math.floor(z / 16)}`) ?? empty;
}
