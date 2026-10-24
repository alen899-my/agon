import { FOREST } from './ForestIsland';
type Point = { x: number; z: number };
type Segment = { x: number; z: number; dx: number; dz: number; start: number; end: number; yaw: number };
const routes = new WeakMap<readonly Point[], { segments: Segment[]; length: number }>();
function compiled(points: readonly Point[]) {
  let route = routes.get(points);
  if (route) return route;
  const segments: Segment[] = []; let length = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dz = b.z - a.z, size = Math.hypot(dx, dz);
    if (size < 1e-6) continue;
    segments.push({ x: a.x, z: a.z, dx, dz, start: length, end: length + size, yaw: Math.atan2(dx, -dz) });
    length += size;
  }
  route = { segments, length }; routes.set(points, route); return route;
}
export const routeLength = (points: readonly Point[]): number => compiled(points).length;
/** Cached segment lengths and binary lookup: no full-route scan or arrays per car/tick. */
export function routePoint(points: readonly Point[], distance: number): Point & { yaw: number } {
  const route = compiled(points);
  if (!route.length) return { x: points[0]?.x ?? 0, z: points[0]?.z ?? 0, yaw: 0 };
  const offset = ((distance % route.length) + route.length) % route.length;
  let lo = 0, hi = route.segments.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (route.segments[mid].end < offset) lo = mid + 1; else hi = mid; }
  const s = route.segments[lo], t = (offset - s.start) / (s.end - s.start);
  return { x: s.x + s.dx * t, z: s.z + s.dz * t, yaw: s.yaw };
}
// Westbound and eastbound bridge lanes are 6m apart. The trip continues through
// the west district, so cars actually enter town before returning to the island.
const trip: Point[] = [{ x: -143, z: -3 }, { x: -320, z: -3 }, { x: -338, z: -3 }];
for (let i = 0; i <= 192; i++) {
  const angle = -0.08 - i / 192 * (Math.PI * 2 - 0.16);
  trip.push({ x: FOREST.x + Math.cos(angle) * 163, z: Math.sin(angle) * 111 });
}
trip.push({ x: -338, z: 3 }, { x: -150, z: 3 }, { x: -85, z: 3 });
// Rounded junction turns stay on the existing west-district asphalt.
function corner(ax: number, az: number, bx: number, bz: number, cx: number, cz: number) {
  for (let i = 1; i <= 8; i++) {
    const t = i / 8, u = 1 - t;
    trip.push({ x: u * u * ax + 2 * u * t * bx + t * t * cx, z: u * u * az + 2 * u * t * bz + t * t * cz });
  }
}
corner(-85, 3, -77, 3, -77, -5);
trip.push({ x: -77, z: -69 }); corner(-77, -69, -77, -77, -85, -77);
trip.push({ x: -129, z: -77 }); corner(-129, -77, -137, -77, -137, -69);
trip.push({ x: -137, z: -9 }); corner(-137, -9, -137, -3, -143, -3);
export const FOREST_TRAFFIC_ROUTE: readonly Point[] = trip;
