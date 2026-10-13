import { CatmullRomCurve3, Vector3 } from 'three';
import { F1_ORIGIN, F1_PORTAL_CITY, f1PathAt, f1Progress } from './F1Track';

export const F1_ACCESS_HALF = 8.5;
const join = f1PathAt(f1Progress(F1_ORIGIN.x - 253, 15).dist);
const curve = new CatmullRomCurve3([
  new Vector3(140, 0, 80), new Vector3(220, 0, 80),
  new Vector3(280, 0.5, 80),
  new Vector3(F1_PORTAL_CITY.x, 0.9, F1_PORTAL_CITY.z), new Vector3(F1_ORIGIN.x - 290, 1, 60),
  new Vector3(join.x, join.y, join.z),
], false, 'centripetal');

export const F1_ACCESS_LENGTH = curve.getLength();
const sampleCount = Math.ceil(F1_ACCESS_LENGTH / 3);
export const F1_ACCESS_SAMPLES = curve.getSpacedPoints(sampleCount).map((p, i) => {
  const tangent = curve.getTangentAt(i / sampleCount);
  return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(tangent.x, -tangent.z), dist: i / sampleCount * F1_ACCESS_LENGTH };
});

export const F1_ACCESS_RAIL_START = 36;
export const F1_ACCESS_RAIL_END = F1_ACCESS_LENGTH - 36;

/** Closest road segment; shared by the access surface, edge collision and gate. */
export function f1AccessProgress(x: number, z: number) {
  let distance = Infinity, signed = 0, height = 0, yaw = 0, along = 0;
  if (x < 125 || x > join.x + 20 || z < -10 || z > 105) return { distance, signed, height, yaw, along };
  for (let i = 1; i < F1_ACCESS_SAMPLES.length; i++) {
    const a = F1_ACCESS_SAMPLES[i - 1], b = F1_ACCESS_SAMPLES[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t;
    const d = Math.hypot(ex, ez);
    if (d >= distance) continue;
    distance = d;
    yaw = Math.atan2(dx, -dz);
    signed = ex * Math.cos(yaw) + ez * Math.sin(yaw);
    height = a.y + (b.y - a.y) * t;
    along = a.dist + (b.dist - a.dist) * t;
  }
  return { distance, signed, height, yaw, along };
}

export function onF1Access(x: number, z: number, half = F1_ACCESS_HALF): boolean {
  return f1AccessProgress(x, z).distance <= half;
}

/** Clear the outer circuit wall only where the access road actually meets it. */
export function f1AccessOpening(x: number, z: number): boolean {
  return x > join.x - 42 && onF1Access(x, z, F1_ACCESS_HALF + 3);
}
