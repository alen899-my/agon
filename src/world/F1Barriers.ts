import { bodyContact, type Body, type Contact } from './Collision';
import { F1_HALF, F1_LENGTH, f1BarrierOffset, f1PathAt } from './F1Track';
import { f1AccessOpening } from './F1Access';

export interface CircuitWall extends Body {
  y: number; height: number; length: number; pitch: number;
  label: 'f1 barrier' | 'pit wall'; endCap: boolean;
}
/** One source for the visible wall and its physical footprint, including the access opening. */
export const F1_WALLS: CircuitWall[] = [];
function addWall(start: number, end: number, side: number, pit: boolean, endCap = false): void {
  const a = f1PathAt(start, pit ? F1_HALF + 2.1 : f1BarrierOffset(start, side));
  const b = f1PathAt(end, pit ? F1_HALF + 2.1 : f1BarrierOffset(end, side));
  const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
  if (!pit && (f1AccessOpening(x, z) || f1AccessOpening(a.x, a.z) || f1AccessOpening(b.x, b.z))) return;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const height = pit ? 1.1 : 0.9;
  F1_WALLS.push({ x, z, y: (a.y + b.y) / 2 + height / 2, height,
    yaw: Math.atan2(b.x - a.x, -(b.z - a.z)), pitch: Math.atan2(b.y - a.y, length),
    length: length + 0.04, halfLength: (length + 0.04) / 2, halfWidth: 0.3,
    label: pit ? 'pit wall' : 'f1 barrier', endCap });
}
const count = Math.ceil(F1_LENGTH / 2);
for (let i = 0; i < count; i++) for (const side of [-1, 1]) addWall(i / count * F1_LENGTH, (i + 1) / count * F1_LENGTH, side, false);
for (let d = -90; d < 90; d += 2) addWall(d, d + 2, 1, true, d === -90 || d === 88);

const CELL = 16;
const grid = new Map<string, CircuitWall[]>();
for (const wall of F1_WALLS) {
  const r = Math.hypot(wall.halfLength, wall.halfWidth);
  for (let x = Math.floor((wall.x - r) / CELL); x <= Math.floor((wall.x + r) / CELL); x++) {
    for (let z = Math.floor((wall.z - r) / CELL); z <= Math.floor((wall.z + r) / CELL); z++) {
      const key = x + ':' + z, cell = grid.get(key);
      if (cell) cell.push(wall); else grid.set(key, [wall]);
    }
  }
}
export function f1WallContact(body: Body): (Contact & { label: string }) | null {
  const radius = Math.hypot(body.halfLength, body.halfWidth);
  let best: (Contact & { label: string }) | null = null;
  for (let x = Math.floor((body.x - radius) / CELL); x <= Math.floor((body.x + radius) / CELL); x++) {
    for (let z = Math.floor((body.z - radius) / CELL); z <= Math.floor((body.z + radius) / CELL); z++) {
      const walls = grid.get(x + ':' + z);
      if (!walls) continue;
      for (const wall of walls) {
        const hit = bodyContact(body, wall);
        if (!hit) continue;
        const rx = Math.cos(wall.yaw), rz = Math.sin(wall.yaw);
        const distance = (body.x - wall.x) * rx + (body.z - wall.z) * rz;
        const angle = body.yaw - wall.yaw;
        const extent = Math.abs(Math.cos(angle)) * body.halfWidth + Math.abs(Math.sin(angle)) * body.halfLength;
        // Continuous side normals prevent tires catching the seams between adjacent blocks.
        const contact = wall.endCap ? hit : { nx: rx * (distance < 0 ? -1 : 1), nz: rz * (distance < 0 ? -1 : 1), depth: extent + wall.halfWidth - Math.abs(distance) };
        if (!best || contact.depth > best.depth) best = { ...contact, label: wall.label };
      }
    }
  }
  return best;
}
