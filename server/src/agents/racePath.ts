/** Rounded road circuit, sampled by travelled metres rather than waypoint index. */
const corners = [
  [-66, 76], [76, 76], [76, -76], [136, -76],
  [136, -136], [-136, -136], [-136, 76],
];
const radius = 7;
interface Sample { x: number; z: number; yaw: number; distance: number }
const paths = new Map<number, { samples: Sample[]; length: number; start: number }>();
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
function path(lane: number) {
  const cached = paths.get(lane);
  if (cached) return cached;
  const samples: Sample[] = [];
  for (let i = 0; i < corners.length; i++) {
    const [x, z] = corners[i], prev = corners[(i + corners.length - 1) % corners.length], next = corners[(i + 1) % corners.length];
    const incoming = Math.hypot(x - prev[0], z - prev[1]), outgoing = Math.hypot(next[0] - x, next[1] - z);
    const ax = x - (x - prev[0]) / incoming * radius, az = z - (z - prev[1]) / incoming * radius;
    const bx = x + (next[0] - x) / outgoing * radius, bz = z + (next[1] - z) / outgoing * radius;
    for (let j = 0; j <= 32; j++) {
      const t = j / 32, u = 1 - t;
      const dx = 2 * (u * (x - ax) + t * (bx - x)), dz = 2 * (u * (z - az) + t * (bz - z));
      const yaw = Math.atan2(dx, -dz);
      const p = { x: u * u * ax + 2 * u * t * x + t * t * bx + Math.cos(yaw) * lane,
        z: u * u * az + 2 * u * t * z + t * t * bz + Math.sin(yaw) * lane, yaw, distance: 0 };
      const last = samples.at(-1);
      p.distance = last ? last.distance + Math.hypot(p.x - last.x, p.z - last.z) : 0;
      samples.push(p);
    }
  }
  const first = samples[0], last = samples.at(-1)!;
  const length = last.distance + Math.hypot(first.x - last.x, first.z - last.z);
  samples.push({ ...first, distance: length });
  // The countdown grid and racing origin are the same point, x=-66.
  const result = { samples, length, start: 7 };
  paths.set(lane, result); return result;
}
export function racePathLength(lane: number): number { return path(lane).length; }
/** Project a grid slot onto its lane without changing its world position. */
export function raceDistanceAt(x: number, z: number, lane: number): number {
  const { samples, length, start } = path(lane);
  let best = Infinity, distance = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const error = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (error < best) { best = error; distance = a.distance + (b.distance - a.distance) * t; }
  }
  return ((distance - start) % length + length) % length;
}
export function racePathAt(distance: number, lane: number): { x: number; z: number; yaw: number; curvature: number } {
  const { samples, length, start } = path(lane);
  const d = ((distance + start) % length + length) % length;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].distance <= d) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], span = b.distance - a.distance;
  const t = span > 0 ? (d - a.distance) / span : 0;
  const turn = angle(b.yaw - a.yaw);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: a.yaw + turn * t, curvature: span > 0 ? turn / span : 0 };
}
