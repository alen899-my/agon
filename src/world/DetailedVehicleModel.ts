import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { KitLike, Model } from './VehicleFactory';
import { VEHICLES, VEHICLE_WHEELS } from './Vehicles';
import { VEHICLE_DESIGNS, type DetailedKind } from './VehicleDesigns';
import { VehicleMeshBuilder } from './VehicleMeshBuilder';
import { addWorkingVehicleEquipment } from './WorkingVehicleEquipment';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mix = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

/** Continuous, individually proportioned road-car panels. Heavy vehicles share the
 * panel/wheel tooling but receive separate cab and load-body assemblies.
 */
export function buildDetailedVehicleModel(_kit: KitLike, kind: DetailedKind): Model {
  const spec = VEHICLES[kind], d = VEHICLE_DESIGNS[kind];
  const L = spec.length, W = spec.width, half = L / 2, hw = W / 2;
  const baseHW = hw * Math.min(0.985, Math.max(0.83, d.roofWidth + 0.035));
  const zAt = (t: number) => (t - 0.5) * L;
  const cf = zAt(d.cowl), rf = zAt(d.roofFront), rr = zAt(d.roofRear), cr = zAt(d.rearGlass);
  const axles = [zAt(d.axleFront), zAt(d.axleRear)];
  const WR = d.wheel, wy = WR + 0.08, arch = WR + 0.055;
  const open = d.family === 'roadster', work = d.family === 'truck';
  const upright = ['boxy', 'van', 'bus', 'truck'].includes(d.family);
  const p = new VehicleMeshBuilder(), materials: Record<string, THREE.Material> = {};
  const material = (role: string, m: THREE.Material) => { materials[role] = m; };
  material('trim', new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: 0.58, side: THREE.DoubleSide }));
  material('rubber', new THREE.MeshStandardMaterial({ color: 0x191b1d, roughness: 0.93 }));
  material('alloy', new THREE.MeshStandardMaterial({ color: d.chrome ? 0xc4c9cf : 0x727983, metalness: 0.88, roughness: 0.25 }));
  material('rotor', new THREE.MeshStandardMaterial({ color: 0x94989e, metalness: 0.85, roughness: 0.42 }));
  material('caliper', new THREE.MeshStandardMaterial({ color: spec.category === 'sport' ? 0xb62621 : 0x35383e, roughness: 0.38 }));
  material('interior', new THREE.MeshStandardMaterial({ color: d.chrome ? 0x593c2c : 0x20242b, roughness: 0.85, side: THREE.DoubleSide }));
  material('stitch', new THREE.MeshStandardMaterial({ color: d.chrome ? 0xb28c66 : 0x626975, roughness: 0.92 }));
  material('display', new THREE.MeshStandardMaterial({ color: 0x0a1820, emissive: 0x173746, emissiveIntensity: 0.35, roughness: 0.32 }));
  material('glass', new THREE.MeshPhysicalMaterial({ color: 0x526774, metalness: 0.08, roughness: 0.10,
    clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  const rounded = (role: string, x: number, y: number, z: number, w: number, h: number, l: number, radius = 0.035, rx = 0) => {
    p.add(role, new RoundedBoxGeometry(w, h, l, 3, Math.min(radius, Math.min(w, h, l) * 0.4)), V(x, y, z), new THREE.Euler(rx, 0, 0));
  };

  const shoulder = (z: number) => {
    const front = smooth(z, -half, cf), rear = smooth(z, cr, half);
    const base = mix(d.nose, d.belt, front) * (1 - rear) + d.tail * rear;
    const fenders = Math.max(...axles.map(a => Math.exp(-(((z - a) / (arch * 1.5)) ** 2))));
    return Math.max(base + 0.025 * fenders, ...axles.map(a => Math.abs(z - a) < arch
      ? wy + Math.sqrt(Math.max(0, arch * arch - (z - a) ** 2)) + 0.035 : ground));
  };
  const width = (z: number) => {
    const front = smooth(z, -half, axles[0]), rear = smooth(z, axles[1], half);
    const waist = Math.sin(smooth(z, axles[0], axles[1]) * Math.PI);
    return hw * (1 - (upright ? 0.045 : d.family === 'wedge' ? 0.18 : 0.12) * (1 - front)
      - (upright ? 0.025 : 0.08) * rear - (1 - d.waist) * waist);
  };
  const ground = Math.max(0.18, d.wheel * (upright ? 0.63 : 0.48));
  const sidePoint = (side: number, z: number, y: number, offset = 0) => {
    const t = THREE.MathUtils.clamp((y - ground) / (shoulder(z) - ground), 0, 1);
    const tuck = (upright ? 0.018 : 0.035) * Math.pow(1 - t, 3);
    const roll = (upright ? 0.012 : 0.03) * Math.pow(Math.max(0, (t - 0.8) / 0.2), 2);
    return V(side * (width(z) - tuck - roll + offset), y, z);
  };
  const deck = (z: number, u: number, offset = 0) => {
    const x = u * 2 - 1;
    const center = mix(d.nose, d.belt, smooth(z, -half, cf)) * (1 - smooth(z, cr, half)) + d.tail * smooth(z, cr, half);
    return V(x * (width(z) - (upright ? 0.012 : 0.03)), mix(center, shoulder(z), Math.pow(Math.abs(x), 3))
      + (upright ? 0.006 : 0.02) * (1 - x * x) + offset, z);
  };
  // Each side has physical openings. Door meshes use exactly the same surface.
  const doorStart = Math.max(cf + 0.04, axles[0] + arch + 0.025);
  const doorEnd = Math.min(doorStart + (d.fourDoor ? L * 0.22 : L * 0.28), cr - 0.08, axles[1] - arch - 0.025);
  const hasDoor = doorEnd - doorStart > 0.30 && kind !== 'buggy';
  const authoredDoors: NonNullable<Model['authoredDoors']> = [];
  for (const side of [-1, 1]) {
    const cuts = [-half, ...axles.flatMap(a => [a - arch, a + arch]), half];
    if (hasDoor) cuts.push(doorStart, doorEnd);
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i], end = cuts[i + 1], mid = (start + end) / 2;
      const axle = axles.find(a => mid > a - arch && mid < a + arch);
      const door = hasDoor && mid > doorStart && mid < doorEnd;
      if (work && mid > cr) continue;
      p.surface('paint', (u, v) => {
        const z = mix(start, end, axle === undefined ? u : (1 - Math.cos(u * Math.PI)) / 2);
        const bottom = axle === undefined ? ground : wy + Math.sqrt(Math.max(0, arch * arch - (z - axle) ** 2));
        const top = door ? ground + 0.07 : shoulder(z);
        return sidePoint(side, z, mix(bottom, top, v));
      }, axle === undefined ? 20 : 48, 10, side < 0);
    }
    if (hasDoor) {
      const pivot = sidePoint(side, doorStart, ground + 0.07);
      const panel = new VehicleMeshBuilder();
      panel.surface('paint', (u, v) => {
        const z = mix(doorStart + 0.003, doorEnd - 0.003, u);
        return sidePoint(side, z, mix(ground + 0.073, shoulder(z) - 0.003, v)).sub(pivot);
      }, 24, 12, side < 0);
      // Inner door card and edge returns close the paper-thin outer shell.
      const doorPoint = (u: number, v: number, inner = false) => {
        const z = mix(doorStart + 0.003, doorEnd - 0.003, u);
        const point = sidePoint(side, z, mix(ground + 0.073, shoulder(z) - 0.003, v));
        if (inner) point.x -= side * 0.045;
        return point.sub(pivot);
      };
      panel.surface('interior', (u, v) => doorPoint(u, v, true), 24, 12, side > 0);
      for (const edge of [0, 1]) {
        panel.surface('paint', (u, v) => doorPoint(edge, u).lerp(doorPoint(edge, u, true), v), 12, 2);
        panel.surface('paint', (u, v) => doorPoint(u, edge).lerp(doorPoint(u, edge, true), v), 24, 2);
      }
      const armrest = doorPoint(0.55, 0.57, true); armrest.x -= side * 0.025;
      panel.add('interior', new RoundedBoxGeometry(0.085, 0.055, Math.min(0.42, (doorEnd - doorStart) * 0.6), 3, 0.018), armrest);
      const latch = doorPoint(0.22, 0.75, true); latch.x -= side * 0.012;
      panel.box('alloy', latch.x, latch.y, latch.z, 0.018, 0.025, 0.075);
      const handle = sidePoint(side, doorEnd - 0.13, shoulder(doorEnd) - 0.10, 0.012).sub(pivot);
      panel.box(d.chrome ? 'alloy' : 'trim', handle.x, handle.y, handle.z, 0.024, 0.025, 0.13);
      authoredDoors.push({ position: pivot, parts: panel.finish() });
    }
    // Smooth rolled wheel lips with recessed liners; no painted-on fake arches.
    for (const axle of axles) {
      if (work && axle > cr) continue;
      p.surface('paint', (u, v) => {
        const a = Math.PI * u, r = arch + v * 0.026, z = axle - Math.cos(a) * r;
        return sidePoint(side, z, wy + Math.sin(a) * r, Math.sin(v * Math.PI) * 0.01);
      }, 48, 5, side < 0);
      p.surface('trim', (u, v) => {
        const a = Math.PI * u, z = axle - Math.cos(a) * (arch + 0.012);
        return V(side * (width(z) - 0.025 - v * d.tire), wy + Math.sin(a) * (arch + 0.012), z);
      }, 48, 5, side > 0);
    }
    if (!work) p.box('trim', side * (hw * d.waist - 0.015), ground + 0.02, (axles[0] + axles[1]) / 2, 0.04, 0.04, axles[1] - axles[0] - arch * 2);
  }
  p.surface('paint', (u, v) => deck(mix(-half, cf, v), u), 32, 48);
  if (!work && d.family !== 'pickup') p.surface('paint', (u, v) => deck(mix(cr, half, v), u), 32, 32);
  p.box('trim', 0, ground, 0, W - d.tire * 2 - 0.15, 0.035, L - 0.35);
  for (const side of [-1, 1]) p.surface('paint', (u, v) => {
    const z = mix(cf, cr, v);
    return V(side * mix(baseHW, width(z) - 0.025, u), shoulder(z), z);
  }, 6, 32, side < 0);

  const roofHW = hw * d.roofWidth;
  const roofY = d.roof - 0.035, frontY = shoulder(cf), rearY = shoulder(cr);
  const roofPoint = (u: number, v: number) => {
    const x = u * 2 - 1;
    return V(x * roofHW, roofY + (0.035 + (upright ? 0.004 : 0.014) * Math.sin(Math.PI * v)) * (1 - x * x), mix(rf, rr, v));
  };
  const glassBase = (z: number, u: number) => deck(z, 0.5 + (u - 0.5) * baseHW / (width(z) - (upright ? 0.012 : 0.03)));
  p.surface('glass', (u, v) => {
    const point = glassBase(cf, u).lerp(roofPoint(u, 0), v);
    point.z -= 0.012 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v); return point;
  }, 28, 20);
  for (const upper of [false, true]) p.tube('trim', Array.from({ length: 20 }, (_, i) => upper ? roofPoint(i / 19, 0) : glassBase(cf, i / 19)), 0.010);
  if (!open) {
    p.surface('paint', roofPoint, 28, 32);
    p.surface('interior', (u, v) => roofPoint(u, v).add(V(0, -0.026, 0)), 24, 24, true);
    p.surface('glass', (u, v) => roofPoint(u, 1).lerp(glassBase(cr, u), v), 28, 20);
    for (const upper of [false, true]) p.tube('trim', Array.from({ length: 20 }, (_, i) => upper ? roofPoint(i / 19, 1) : glassBase(cr, i / 19)), 0.010);
  }
  for (const side of [-1, 1]) {
    const a = V(side * baseHW, frontY, cf), b = V(side * roofHW, roofY, rf);
    const c = V(side * roofHW, roofY, rr), e = V(side * baseHW, rearY, cr);
    p.tube('paint', [a, b], upright ? 0.038 : 0.029);
    p.tube(d.chrome ? 'alloy' : 'trim', [a, b], 0.009);
    if (!open) {
      p.tube('paint', [b, c], 0.025);
      const sailZ = mix(rr, cr, d.family === 'fastback' ? 0.43 : 0.65);
      p.quad('paint', c, e, V(side * baseHW, shoulder(sailZ), sailZ), V(side * roofHW, roofY - 0.008, rr - 0.10));
      if (kind === 'van' || kind === 'stepvan') {
        const split = Math.min(rr - 0.1, rf + 0.85);
        p.quad('glass', a, b, V(side * roofHW, roofY, split), V(side * baseHW, frontY, split));
        p.quad('paint', V(side * baseHW, frontY, split), V(side * roofHW, roofY, split), c, e);
      } else {
        p.surface('glass', (u, v) => {
          const bottomZ = mix(cf, sailZ, u), topZ = mix(rf, rr - 0.10, u);
          return V(side * mix(baseHW, roofHW, v), mix(shoulder(bottomZ) - 0.004, roofY - 0.008 * u, v), mix(bottomZ, topZ, v));
        }, 32, 16, side < 0);
        const count = d.family === 'bus' ? Math.max(4, Math.floor((rr - rf) / 0.9)) : d.fourDoor ? 2 : 1;
        for (let i = 1; i <= count; i++) {
          const t = i / (count + 1), topZ = mix(rf, rr - 0.10, t), bottomZ = mix(cf, sailZ, t);
          p.tube('trim', [V(side * baseHW, shoulder(bottomZ), bottomZ), V(side * roofHW, roofY, topZ)], 0.023);
        }
      }
      p.tube(d.chrome ? 'alloy' : 'trim', [a, V(side * baseHW, rearY, cr)], 0.009);
    } else {
      p.tube('alloy', [V(side * 0.48, d.belt + 0.04, cr - 0.27), V(side * 0.48, d.belt + 0.29, cr - 0.23), V(side * 0.20, d.belt + 0.29, cr - 0.23), V(side * 0.20, d.belt + 0.04, cr - 0.27)], 0.024);
    }
    const mirrorZ = cf + 0.12;
    p.tube('trim', [V(side * baseHW, frontY + 0.07, mirrorZ), V(side * (hw + 0.03), frontY + 0.11, mirrorZ - 0.05)], 0.015);
    const mirror = new THREE.SphereGeometry(1, 16, 10); mirror.scale(0.12, 0.055, 0.095);
    p.add('paint', mirror, V(side * (hw + 0.08), frontY + 0.11, mirrorZ - 0.05));
    p.box('alloy', side * (hw + 0.08), frontY + 0.11, mirrorZ + 0.04, 0.16, 0.065, 0.006);
  }

  // Real cabin volume: dashboard, seats, headrests and centre tunnel.
  p.box('interior', 0, ground + 0.12, (cf + cr) / 2, W * 0.72, 0.05, cr - cf);
  rounded('interior', 0, frontY - 0.055, cf + 0.21, W * 0.75, 0.15, 0.37, 0.055);
  const seatZ = Math.min(cr - 0.35, rf + 0.42), seatY = Math.max(ground + 0.22, d.belt - 0.36);
  for (const side of [-1, 1]) {
    rounded('interior', side * W * 0.19, seatY, seatZ, W * 0.23, 0.12, 0.48, 0.045);
    rounded('interior', side * W * 0.19, seatY + 0.28, seatZ + 0.20, W * 0.23, 0.53, 0.12, 0.045, -0.12);
    for (const edge of [-1, 1]) {
      const sx = side * W * 0.19 + edge * W * 0.09;
      rounded('interior', sx, seatY + 0.08, seatZ, 0.065, 0.10, 0.41, 0.025);
      p.tube('stitch', [V(sx, seatY + 0.12, seatZ - 0.16), V(sx, seatY + 0.14, seatZ + 0.12), V(sx, seatY + 0.49, seatZ + 0.18)], 0.0025);
    }
    const head = new THREE.SphereGeometry(1, 16, 10); head.scale(0.14, 0.12, 0.065);
    p.add('interior', head, V(side * W * 0.19, seatY + 0.61, seatZ + 0.23));
  }
  rounded('interior', 0, seatY + 0.04, seatZ - 0.15, 0.22, 0.20, 0.75, 0.035);
  // Driver-facing instruments, vents and centre controls use actual depth.
  rounded('trim', -W * 0.19, frontY + 0.025, cf + 0.27, 0.41, 0.18, 0.17, 0.035);
  for (const side of [-1, 1]) {
    const gx = -W * 0.19 + side * 0.095, gy = frontY + 0.035, gz = cf + 0.36;
    p.add('display', new THREE.CircleGeometry(0.062, 28), V(gx, gy, gz));
    p.add('alloy', new THREE.TorusGeometry(0.063, 0.004, 6, 28), V(gx, gy, gz + 0.002));
    for (let i = 0; i < 9; i++) {
      const angle = (-0.8 + i * 0.32) * Math.PI;
      p.add('white', new THREE.BoxGeometry(0.004, 0.010, 0.002), V(gx + Math.sin(angle) * 0.050, gy + Math.cos(angle) * 0.050, gz + 0.003), new THREE.Euler(0, 0, -angle));
    }
    p.add('white', new THREE.BoxGeometry(0.003, 0.043, 0.002), V(gx - 0.009, gy + 0.016, gz + 0.005), new THREE.Euler(0, 0, 0.55));
  }
  rounded('trim', W * 0.08, frontY - 0.02, cf + 0.39, 0.27, 0.17, 0.025, 0.01);
  p.box('display', W * 0.08, frontY - 0.02, cf + 0.407, 0.23, 0.13, 0.004);
  for (let i = 0; i < 3; i++) p.box('alloy', W * 0.08 - 0.07 + i * 0.07, frontY - 0.14, cf + 0.40, 0.025, 0.025, 0.018);
  for (const x of [-W * 0.32, W * 0.30]) {
    p.box('trim', x, frontY - 0.02, cf + 0.397, 0.14, 0.055, 0.012);
    for (let i = 0; i < 4; i++) p.box('alloy', x - 0.045 + i * 0.03, frontY - 0.02, cf + 0.406, 0.006, 0.043, 0.005);
  }
  p.tube('alloy', [V(0, seatY + 0.13, seatZ - 0.22), V(0, seatY + 0.27, seatZ - 0.25)], 0.012);
  rounded('trim', 0, seatY + 0.28, seatZ - 0.25, 0.045, 0.045, 0.06, 0.016);
  p.box('trim', 0, roofY - 0.16, rf + 0.13, 0.24, 0.065, 0.025);
  p.box('alloy', 0, roofY - 0.16, rf + 0.148, 0.215, 0.045, 0.004);
  if (d.fourDoor && cr - seatZ > 1.2) p.box('interior', 0, seatY + 0.18, cr - 0.36, W * 0.68, 0.38, 0.42);

  // Fascias and signature lamp clusters are fitted to the individual nose profile.
  for (const front of [true, false]) {
    if (work && !front) continue;
    const z = front ? -half : half;
    p.surface('paint', (u, v) => {
      const x = u * 2 - 1;
      const y = mix(ground, deck(z, u).y, v);
      return V(x * Math.abs(sidePoint(1, z, y).x), y,
        z + (front ? -1 : 1) * 0.018 * (1 - x * x) * Math.sin(Math.PI * v));
    }, 36, 16, !front);
    p.box('trim', 0, ground + 0.035, z, W * 0.85, 0.045, 0.11);
  }
  const lightY = Math.max(ground + 0.31, d.nose - 0.13), lampX = hw * 0.66;
  for (const side of [-1, 1]) {
    const x = side * lampX, front = -half - 0.026;
    if (d.lights === 'round' || d.lights === 'quad' || d.lights === 'oval') {
      const n = d.lights === 'quad' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const xx = x - side * i * 0.18;
        const tilt = d.lights === 'oval' && !upright ? -0.48 : 0;
        const glass = new THREE.SphereGeometry(1, 24, 16); glass.scale(0.115, d.lights === 'oval' ? 0.15 : 0.10, 0.035);
        p.add('head', glass, V(xx, lightY + (d.lights === 'oval' ? 0.08 : 0), front), new THREE.Euler(tilt, 0, 0));
        const ring = new THREE.TorusGeometry(0.115, 0.012, 8, 32); if (d.lights === 'oval') ring.scale(1, 1.3, 1);
        p.add(d.chrome ? 'alloy' : 'trim', ring, V(xx, lightY + (d.lights === 'oval' ? 0.08 : 0), front - 0.015), new THREE.Euler(tilt, 0, 0));
      }
    } else {
      const lampH = d.lights === 'rect' ? 0.15 : 0.07;
      p.quad('trim', V(x - 0.20, lightY + lampH, front), V(x + 0.20, lightY + lampH * 0.8, front), V(x + 0.18, lightY - lampH, front), V(x - 0.17, lightY - lampH, front));
      p.tube('head', [V(x - 0.17, lightY + lampH * 0.5, front - 0.012), V(x + 0.15, lightY + lampH * 0.4, front - 0.012), V(x + (d.lights === 'angular' ? 0.07 : 0.15), lightY - lampH * 0.5, front - 0.012)], 0.016);
    }
    if (!work) {
      if (kind === 'muscle') for (let i = 0; i < 3; i++) p.box('brake', side * (hw * 0.50 + i * 0.11), d.tail - 0.14, half + 0.005, 0.065, 0.15, 0.025);
      else p.box('brake', side * hw * 0.64, d.tail - 0.12, half + 0.005, W * 0.24, upright ? 0.17 : 0.065, 0.025);
      if (d.grille !== 'closed') {
        p.add('alloy', new THREE.CylinderGeometry(0.047, 0.047, 0.13, 24), V(side * hw * 0.64, ground + 0.08, half + 0.01), new THREE.Euler(Math.PI / 2, 0, 0));
        p.add('trim', new THREE.CircleGeometry(0.035, 24), V(side * hw * 0.64, ground + 0.08, half + 0.08));
      }
    }
    p.box('blink', side * (hw + 0.004), frontY - 0.11, cf - 0.15, 0.015, 0.035, 0.09);
  }
  const grilleY = ground + (d.nose - ground) * 0.38;
  if (d.grille === 'oval') {
    const grille = new THREE.SphereGeometry(1, 32, 16); grille.scale(W * 0.26, 0.12, 0.018);
    p.add('trim', grille, V(0, grilleY, -half - 0.012));
  } else if (d.grille === 'split' || d.grille === 'slots') {
    const count = d.grille === 'split' ? 2 : 7;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * (d.grille === 'split' ? 0.23 : 0.12);
      p.box('alloy', x, lightY - 0.02, -half - 0.015, d.grille === 'split' ? 0.20 : 0.075, 0.24, 0.025);
      p.box('trim', x, lightY - 0.02, -half - 0.030, d.grille === 'split' ? 0.16 : 0.048, 0.20, 0.01);
    }
  } else if (d.grille !== 'closed') p.box('trim', 0, grilleY, -half - 0.012, W * 0.48, 0.15, 0.018);
  if (d.grille !== 'closed') for (let i = 0; i < 4; i++) p.box(d.chrome ? 'alloy' : 'trim', 0, grilleY - 0.054 + i * 0.036, -half - 0.024, W * 0.42, 0.008, 0.012);
  if (kind === 'egt' || kind === 'esedan' || kind === 'sport') p.box('brake', 0, d.tail - 0.10, half + 0.01, W * 0.72, 0.022, 0.014);

  if (d.scoop) {
    p.quad('paint', V(-0.25, d.belt + 0.015, cf - 0.6), V(0.25, d.belt + 0.015, cf - 0.6), V(0.22, d.belt + 0.06, cf - 0.16), V(-0.22, d.belt + 0.06, cf - 0.16));
    p.box('trim', 0, d.belt + 0.025, cf - 0.60, 0.41, 0.045, 0.018);
  }
  if (d.midEngine) for (const side of [-1, 1]) {
    const z = axles[1] - arch - 0.22;
    p.quad('trim', sidePoint(side, z - 0.21, d.belt - 0.08, 0.006), sidePoint(side, z + 0.18, d.belt - 0.03, 0.006), sidePoint(side, z + 0.12, ground + 0.18, 0.006), sidePoint(side, z - 0.13, ground + 0.25, 0.006));
    for (let j = 0; j < 6; j++) p.box('trim', side * W * 0.20, d.belt + 0.015, cr + 0.06 + j * 0.07, W * 0.20, 0.012, 0.025);
  }
  const wingHeight = d.wing;
  if (wingHeight !== undefined && wingHeight > 0) {
    for (const side of [-1, 1]) p.box('trim', side * W * 0.27, d.tail + wingHeight / 2, half - 0.35, 0.035, wingHeight, 0.16);
    p.surface('paint', (u, v) => V((u * 2 - 1) * W * 0.47, d.tail + wingHeight + 0.022 * Math.sin(Math.PI * v), mix(half - 0.52, half - 0.23, v)), 32, 10);
    for (const side of [-1, 1]) p.box('trim', side * W * 0.47, d.tail + wingHeight, half - 0.37, 0.016, 0.13, 0.34);
  }
  // Fine shut-lines and flush handles carry the proportions at close camera range.
  for (const side of [-1, 1]) {
    p.tube('trim', Array.from({ length: 20 }, (_, i) => deck(mix(-half + 0.22, cf - 0.025, i / 19), side < 0 ? 0.16 : 0.84, 0.002)), 0.0018);
    if (d.fourDoor && !work && d.family !== 'bus' && d.family !== 'van') {
      const z = Math.min(axles[1] - arch - 0.06, cr - 0.15);
      if (z > doorEnd + 0.10) {
        p.tube('trim', [sidePoint(side, z, ground + 0.09, 0.002), sidePoint(side, z + 0.04, shoulder(z) - 0.04, 0.002)], 0.002);
        const handle = sidePoint(side, z - 0.09, shoulder(z) - 0.11, 0.012);
        p.box(d.chrome ? 'alloy' : 'trim', handle.x, handle.y, handle.z, 0.023, 0.023, 0.12);
      }
    }
    if (!upright && d.family !== 'pickup') {
      p.tube('paint', Array.from({ length: 24 }, (_, i) => {
        const z = mix(axles[0] + arch + 0.015, axles[1] - arch - 0.015, i / 23);
        return sidePoint(side, z, shoulder(z) - 0.14, 0.003);
      }), 0.003);
    }
  }
  if (kind === 'sport' || kind === 'track') {
    for (let i = 0; i < 10; i++) {
      const z = mix(cr + 0.035, half - 0.14, i / 9);
      p.tube('trim', Array.from({ length: 12 }, (_, j) => deck(z, mix(0.28, 0.72, j / 11), 0.004)), 0.007);
    }
  }
  if (kind === 'track') for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = axles[0] - 0.16 + i * 0.065;
      p.tube('trim', Array.from({ length: 8 }, (_, j) => deck(z, mix(side < 0 ? 0.05 : 0.79, side < 0 ? 0.21 : 0.95, j / 7), 0.004)), 0.009);
    }
    p.quad('trim', V(side * W * 0.45, ground + 0.09, -half + 0.10), V(side * W * 0.49, ground + 0.13, -half + 0.14), V(side * W * 0.48, ground + 0.21, -half + 0.47), V(side * W * 0.44, ground + 0.18, -half + 0.47));
  }
  if (kind === 'muscle') for (const side of [-1, 1]) {
    p.surface('accent', (u, v) => deck(mix(-half + 0.15, cf - 0.02, v), 0.5 + side * 0.095 + (u - 0.5) * 0.055, 0.003), 8, 32);
    if (!open) p.surface('accent', (u, v) => {
      const point = roofPoint(0.5 + side * 0.11 + (u - 0.5) * 0.07, v); point.y += 0.003; return point;
    }, 8, 24);
  }
  if (!work) {
    p.box('trim', 0, d.tail - 0.24, half + 0.02, 0.46, 0.13, 0.02);
    p.box('white', 0, d.tail - 0.24, half + 0.033, 0.40, 0.095, 0.006);
    for (const side of [-1, 1]) p.box('alloy', side * 0.17, d.tail - 0.20, half + 0.039, 0.012, 0.012, 0.004);
  }
  if (kind === 'classic') for (const front of [true, false]) p.tube('alloy', [V(-W * 0.39, ground + 0.19, front ? -half : half), V(0, ground + 0.16, front ? -half - 0.04 : half + 0.04), V(W * 0.39, ground + 0.19, front ? -half : half)], 0.022);

  addWorkingVehicleEquipment(p, kind, d, { L, W, cf, rf, rr, cr, ground, axles, wy, arch });

  const wheels = {} as Model['wheels'];
  for (const side of [-1, 1] as const) {
    const b = new VehicleMeshBuilder(), rim = WR * d.rim, tw = d.tire;
    const profile = [[rim, -tw * 0.46], [WR * 0.88, -tw * 0.5], [WR * 0.97, -tw * 0.44], [WR, -tw * 0.30],
      [WR, tw * 0.30], [WR * 0.97, tw * 0.44], [WR * 0.88, tw * 0.5], [rim, tw * 0.46], [rim, -tw * 0.46]];
    b.add('rubber', new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48), V(0, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    const fx = side * tw * 0.46;
    b.add('alloy', new THREE.TorusGeometry(rim, 0.012, 8, 48), V(fx, 0, 0), new THREE.Euler(0, Math.PI / 2, 0));
    b.add('rotor', new THREE.CylinderGeometry(rim * 0.80, rim * 0.80, 0.012, 40), V(fx - side * 0.035, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    for (let i = 0; i < d.spokes; i++) {
      const a = i / d.spokes * Math.PI * 2, radius = d.spokes > 15 ? 0.004 : 0.014;
      b.tube('alloy', [V(fx + side * 0.006, Math.cos(a) * rim * 0.20, Math.sin(a) * rim * 0.20), V(fx - side * 0.015, Math.cos(a + 0.10) * rim * 0.94, Math.sin(a + 0.10) * rim * 0.94)], radius);
    }
    b.add('alloy', new THREE.CylinderGeometry(rim * 0.23, rim * 0.23, 0.028, 24), V(fx, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      b.add('rotor', new THREE.SphereGeometry(0.009, 6, 4), V(fx + side * 0.018, Math.cos(a) * rim * 0.15, Math.sin(a) * rim * 0.15));
    }
    if (d.rim < 0.60) for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      b.add('rubber', new THREE.BoxGeometry(tw * 0.75, 0.018, 0.042), V(0, Math.cos(a) * WR, Math.sin(a) * WR), new THREE.Euler(a, 0, 0));
    }
    wheels[side === -1 ? '-1' : '1'] = b.finish();
  }
  const wheelPos = axles.flatMap(z => [-1, 1].map(side => ({ x: side * (width(z) - d.tire * 0.5 - 0.025), z, front: z === axles[0] })));
  if (work && ['tractor', 'tank', 'dump', 'ladder'].includes(d.equipment ?? '')) {
    for (const side of [-1, 1]) wheelPos.push({ x: side * (hw - d.tire * 0.5 - 0.025), z: axles[1] - WR * 2.25, front: false });
  }
  // Calipers belong to the body, not the spinning rim.
  for (const w of wheelPos) p.box('caliper', w.x, wy + WR * 0.10, w.z + WR * 0.48, d.tire * 0.42, WR * 0.40, 0.07);
  const parts = p.finish();
  return { parts, materials, wheels, wheelPos, WR, style: VEHICLE_WHEELS[kind], authoredDoors,
    eye: V(-W * 0.19, Math.min(d.roof - 0.20, frontY + 0.24), seatZ - 0.08),
    steerPos: V(-W * 0.19, frontY - 0.06, cf + 0.38), steerTilt: -0.28,
    doors: [], wiperAnchors: [-1, 1].map(side => ({ x: side * W * 0.18, y: frontY + 0.025, z: cf + 0.08,
      tilt: -Math.atan2(roofY - frontY, rf - cf) * 0.8, rest: Math.PI + 0.12, dir: 1 })),
    garageLayout: { hoodY: d.belt + 0.02, hoodZ: (-half + cf) / 2, hoodLength: cf + half - 0.15,
      roofY: d.roof + 0.015, roofZ: (rf + rr) / 2, roofLength: rr - rf },
    dispose: () => { parts.forEach(g => g.dispose()); Object.values(wheels).forEach(m => m.forEach(g => g.dispose()));
      authoredDoors.forEach(door => door.parts.forEach(g => g.dispose())); Object.values(materials).forEach(m => m.dispose()); },
  };
}
