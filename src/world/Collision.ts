import { VEHICLES, type VehicleKind } from './Vehicles';

export interface Body { x: number; z: number; yaw: number; halfWidth: number; halfLength: number }
export interface Contact { nx: number; nz: number; depth: number }

export function vehicleBody(x: number, z: number, yaw: number, kind: VehicleKind): Body {
  // Includes the tire sidewalls and lamp housings of the rendered vehicle.
  // Width comes from the catalog so bikes/vans/buses all collide true to size.
  const halfWidth = VEHICLES[kind].width / 2 + 0.12;
  return { x, z, yaw, halfWidth, halfLength: VEHICLES[kind].length / 2 + 0.05 };
}
function axes(b: Body) {
  return [{ x: Math.cos(b.yaw), z: Math.sin(b.yaw) }, { x: Math.sin(b.yaw), z: -Math.cos(b.yaw) }];
}
function extent(b: Body, x: number, z: number): number {
  const [r, f] = axes(b);
  return Math.abs(r.x * x + r.z * z) * b.halfWidth + Math.abs(f.x * x + f.z * z) * b.halfLength;
}
/** Separating-axis contact, with the normal pointing out of obstacle b toward a. */
export function bodyContact(a: Body, b: Body): Contact | null {
  const dx = a.x - b.x, dz = a.z - b.z;
  // Cheap broad-phase before four SAT axes; no temporary arrays/vectors per query.
  const radius = Math.hypot(a.halfWidth, a.halfLength) + Math.hypot(b.halfWidth, b.halfLength);
  if (Math.abs(dx) > radius || Math.abs(dz) > radius) return null;
  const ac = Math.cos(a.yaw), sinA = Math.sin(a.yaw), bc = Math.cos(b.yaw), bs = Math.sin(b.yaw);
  let bestDepth = Infinity, nx = 0, nz = 0;
  for (let i = 0; i < 4; i++) {
    const ax = i === 0 ? ac : i === 1 ? sinA : i === 2 ? bc : bs;
    const az = i === 0 ? sinA : i === 1 ? -ac : i === 2 ? bs : -bc;
    const distance = dx * ax + dz * az;
    const extentA = Math.abs(ac * ax + sinA * az) * a.halfWidth + Math.abs(sinA * ax - ac * az) * a.halfLength;
    const extentB = Math.abs(bc * ax + bs * az) * b.halfWidth + Math.abs(bs * ax - bc * az) * b.halfLength;
    const depth = extentA + extentB - Math.abs(distance);
    if (depth <= 0) return null;
    if (depth < bestDepth) { bestDepth = depth; const side = distance < 0 ? -1 : 1; nx = ax * side; nz = az * side; }
  }
  return { nx, nz, depth: bestDepth };
}
export function circleContact(b: Body, x: number, z: number, radius: number): Contact | null {
  const [r, f] = axes(b), dx = x - b.x, dz = z - b.z;
  const localX = dx * r.x + dz * r.z, localZ = dx * f.x + dz * f.z;
  const cx = Math.max(-b.halfWidth, Math.min(b.halfWidth, localX));
  const cz = Math.max(-b.halfLength, Math.min(b.halfLength, localZ));
  const ax = cx - localX, az = cz - localZ, distance = Math.hypot(ax, az);
  if (distance >= radius) return null;
  if (distance > 1e-8) return { nx: (ax * r.x + az * f.x) / distance, nz: (ax * r.z + az * f.z) / distance, depth: radius - distance };
  const side = b.halfWidth - Math.abs(localX), end = b.halfLength - Math.abs(localZ);
  const axis = side < end ? r : f, value = side < end ? localX : localZ;
  const sign = value < 0 ? 1 : -1;
  return { nx: axis.x * sign, nz: axis.z * sign, depth: radius + Math.min(side, end) };
}
export function boundaryContact(b: Body, limit: number): Contact | null {
  const ex = extent(b, 1, 0), ez = extent(b, 0, 1);
  if (b.x + ex > limit) return { nx: -1, nz: 0, depth: b.x + ex - limit };
  if (b.x - ex < -limit) return { nx: 1, nz: 0, depth: -limit - b.x + ex };
  if (b.z + ez > limit) return { nx: 0, nz: -1, depth: b.z + ez - limit };
  if (b.z - ez < -limit) return { nx: 0, nz: 1, depth: -limit - b.z + ez };
  return null;
}
