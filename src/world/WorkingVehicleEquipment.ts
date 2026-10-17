import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { VehicleMeshBuilder } from './VehicleMeshBuilder';
import type { DetailedKind, VehicleDesign } from './VehicleDesigns';

interface Layout { L: number; W: number; cf: number; rf: number; rr: number; cr: number; ground: number; axles: number[]; wy: number; arch: number }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Equipment stays separate from cab panel construction: a tanker, ladder truck,
 * tractor and pickup have genuinely different rear assemblies and silhouettes. */
export function addWorkingVehicleEquipment(p: VehicleMeshBuilder, kind: DetailedKind, d: VehicleDesign, a: Layout): void {
  const { L, W, cr, rf, rr, ground } = a, half = L / 2;
  const rounded = (role: string, x: number, y: number, z: number, w: number, h: number, l: number, radius = 0.045) =>
    p.add(role, new RoundedBoxGeometry(w, h, l, 3, Math.min(radius, Math.min(w, h, l) * 0.45)), V(x, y, z));
  if (d.family === 'pickup') {
    const length = half - cr - 0.08, z = (half + cr) / 2;
    p.box('trim', 0, d.belt - 0.35, z, W - 0.25, 0.055, length);
    // A recessed load floor, inner walls and wheel tubs make an actual open bed.
    for (const side of [-1, 1]) {
      p.box('paint', side * (W / 2 - 0.12), d.belt - 0.15, z, 0.12, 0.40, length);
      p.box('trim', side * (W / 2 - 0.12), d.belt + 0.06, z, 0.15, 0.028, length);
      rounded('paint', side * (W / 2 - 0.25), d.belt - 0.25, a.axles[1], 0.30, 0.28, a.arch * 2.2, 0.10);
    }
    p.box('paint', 0, d.belt - 0.14, cr + 0.04, W - 0.20, 0.42, 0.07);
    p.box('paint', 0, d.belt - 0.13, half - 0.045, W - 0.18, 0.42, 0.08);
    p.box('trim', 0, d.belt - 0.07, half + 0.004, 0.18, 0.045, 0.012);
    for (let i = -6; i <= 6; i++) p.box('trim', i * 0.11, d.belt - 0.313, z, 0.015, 0.008, length - 0.10);
  }
  if (d.spare) {
    p.add('rubber', new THREE.TorusGeometry(d.wheel * 0.75, d.wheel * 0.25, 14, 48), V(0, d.belt, half + 0.16));
    p.add('alloy', new THREE.CylinderGeometry(d.wheel * d.rim, d.wheel * d.rim, 0.08, 32), V(0, d.belt, half + 0.19), new THREE.Euler(Math.PI / 2, 0, 0));
  }
  if (d.rack) {
    for (const side of [-1, 1]) p.tube('rack', [V(side * W * 0.33, d.roof + 0.025, rf + 0.10), V(side * W * 0.33, d.roof + 0.09, rf + 0.25), V(side * W * 0.33, d.roof + 0.09, rr - 0.18), V(side * W * 0.33, d.roof + 0.025, rr - 0.04)], 0.022);
    for (const z of [rf + 0.35, rr - 0.28]) p.box('rack', 0, d.roof + 0.08, z, W * 0.70, 0.035, 0.05);
  }
  if (kind === 'camper') rounded('white', 0, d.roof + 0.11, (rf + rr) / 2, W * 0.55, 0.20, 0.90);
  if (d.family === 'van' || d.family === 'bus') {
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 0.04);
      p.box('trim', x, ground + 0.15, 0, 0.04, 0.09, L * 0.80);
      // Sliding-door track and handle on vans; luggage hatches on coaches.
      const start = kind === 'coach' ? -L * 0.25 : a.cf + 0.8;
      p.box('alloy', x, d.belt - 0.12, (start + cr) / 2, 0.015, 0.015, Math.max(0.1, cr - start));
      if (d.family === 'bus') for (let z = -L * 0.22; z < L * 0.30; z += 0.95) {
        p.box('trim', x, d.belt * 0.61, z, 0.012, d.belt * 0.46, 0.008);
        p.box('alloy', x + side * 0.005, d.belt * 0.78, z + 0.30, 0.015, 0.022, 0.10);
      }
      p.box('trim', x + side * 0.01, d.belt - 0.15, start + 0.25, 0.02, 0.035, 0.17);
    }
    if (d.family === 'bus') {
      p.box('trim', W * 0.43, (d.roof + ground) / 2, -half + 0.55, 0.035, d.roof - ground - 0.2, 0.73);
      p.box('glass', W * 0.45, d.roof * 0.60, -half + 0.55, 0.018, d.roof * 0.56, 0.62);
      p.box('alloy', W * 0.46, d.roof * 0.58, -half + 0.55, 0.018, d.roof * 0.62, 0.025);
      rounded('white', 0, d.roof + 0.10, L * 0.12, W * 0.65, 0.18, L * 0.24);
      p.box('trim', 0, d.roof - 0.25, -half + 0.01, W * 0.68, 0.20, 0.018);
    }
    // Rear split-door seam, hinges and vertical lamps.
    p.box('trim', 0, (d.belt + d.roof) / 2, half + 0.008, 0.008, d.roof - d.belt, 0.015);
    for (const side of [-1, 1]) {
      p.box('brake', side * W * 0.42, d.belt - 0.20, half + 0.015, 0.09, 0.36, 0.02);
      p.box('alloy', side * W * 0.32, d.belt - 0.12, half + 0.02, 0.07, 0.025, 0.02);
    }
  }
  if (d.equipment) {
    const start = cr + 0.10, rear = half - 0.10, length = Math.max(0.7, rear - start), center = (start + rear) / 2;
    const deck = a.wy + a.arch * 0.70;
    for (const side of [-1, 1]) {
      p.box('trim', side * W * 0.28, ground + 0.10, center, 0.12, 0.20, length);
      p.box('trim', side * W * 0.45, a.wy - 0.18, a.axles[1] + a.arch + 0.10, 0.36, 0.33, 0.025);
      // Rear fender covers follow the wheel, not a full-height cargo block.
      p.surface('trim', (u, v) => {
        const angle = u * Math.PI;
        return V(side * (W * 0.31 + v * W * 0.18), a.wy + Math.sin(angle) * (a.arch + 0.06), a.axles[1] - Math.cos(angle) * (a.arch + 0.06));
      }, 32, 4, side > 0);
      p.box('brake', side * W * 0.37, ground + 0.25, half - 0.01, 0.18, 0.09, 0.025);
    }
    p.box('trim', 0, ground + 0.18, half - 0.05, W * 0.90, 0.12, 0.10);
    if (['box', 'rescue', 'pumper', 'ladder'].includes(d.equipment)) {
      const top = d.equipment === 'box' ? d.roof + 0.34 : d.equipment === 'rescue' ? d.roof + 0.18 : d.roof - 0.35;
      rounded(d.equipment === 'rescue' ? 'white' : 'paint', 0, (top + deck) / 2, center, W * 0.97, top - deck, length, 0.06);
      for (const side of [-1, 1]) {
        const x = side * W * 0.488;
        p.box('alloy', x, top - 0.03, center, 0.025, 0.025, length - 0.08);
        if (d.equipment === 'pumper' || d.equipment === 'ladder') {
          for (let z = start + 0.12; z < rear - 0.45; z += 0.67) {
            p.box('alloy', x, (top + deck) / 2, z + 0.27, 0.018, top - deck - 0.14, 0.54);
            for (let y = deck + 0.16; y < top - 0.10; y += 0.065) p.box('trim', x + side * 0.012, y, z + 0.27, 0.006, 0.006, 0.50);
            p.box('trim', x + side * 0.018, deck + 0.22, z + 0.27, 0.01, 0.022, 0.13);
          }
        }
        if (d.equipment === 'rescue') {
          p.box('red', x + side * 0.012, deck + (top - deck) * 0.42, center, 0.015, 0.16, length - 0.08);
          p.box('red', x + side * 0.02, top - 0.55, center, 0.02, 0.39, 0.12);
          p.box('red', x + side * 0.02, top - 0.55, center, 0.02, 0.12, 0.39);
        }
      }
      for (const side of [-1, 1]) {
        p.box('alloy', side * W * 0.23, (top + deck) / 2, rear + 0.035, W * 0.43, top - deck - 0.13, 0.014);
        p.box('trim', side * W * 0.05, (top + deck) / 2, rear + 0.05, 0.025, 0.24, 0.02);
      }
      if (d.equipment === 'ladder' || d.equipment === 'pumper') {
        const lStart = d.equipment === 'ladder' ? -half + 0.15 : start + 0.08;
        const y = d.roof + 0.20;
        for (const side of [-1, 1]) {
          p.box('alloy', side * 0.29, y, (lStart + rear) / 2, 0.055, 0.16, rear - lStart);
          p.box('alloy', side * 0.23, y + 0.12, (lStart + rear) / 2, 0.035, 0.10, rear - lStart - 0.15);
        }
        for (let z = lStart + 0.10; z < rear; z += 0.24) p.box('alloy', 0, y, z, 0.56, 0.035, 0.035);
        for (const z of [start + 0.25, rear - 0.25]) p.box('trim', 0, top + 0.12, z, W * 0.66, 0.20, 0.15);
      }
    } else if (d.equipment === 'tank') {
      const tank = new THREE.CapsuleGeometry(W * 0.39, Math.max(0.4, length - W * 0.78), 10, 32);
      p.add('alloy', tank, V(0, deck + W * 0.39, center), new THREE.Euler(Math.PI / 2, 0, 0));
      for (const z of [start + length * 0.25, start + length * 0.75]) {
        p.add('trim', new THREE.TorusGeometry(W * 0.395, 0.018, 8, 48), V(0, deck + W * 0.39, z));
        p.add('alloy', new THREE.CylinderGeometry(0.14, 0.14, 0.07, 24), V(0, deck + W * 0.80, z));
      }
    } else if (d.equipment === 'dump') {
      p.box('paint', 0, deck, center, W * 0.93, 0.10, length);
      for (const side of [-1, 1]) {
        p.quad('paint', V(side * W * 0.39, deck, start), V(side * W * 0.49, deck + 0.9, start), V(side * W * 0.49, deck + 0.9, rear), V(side * W * 0.39, deck, rear));
        for (let z = start + 0.15; z < rear; z += 0.55) p.tube('paint', [V(side * W * 0.40, deck + 0.05, z), V(side * W * 0.50, deck + 0.88, z)], 0.035);
      }
      p.box('paint', 0, deck + 0.45, rear, W * 0.92, 0.90, 0.07);
      p.box('paint', 0, deck + 0.60, start, W * 0.92, 1.20, 0.07);
    } else if (d.equipment === 'tractor') {
      p.add('trim', new THREE.CylinderGeometry(0.43, 0.43, 0.10, 32), V(0, deck + 0.06, center));
      for (const side of [-1, 1]) {
        p.add('alloy', new THREE.CylinderGeometry(0.21, 0.21, 0.70, 24), V(side * W * 0.35, ground + 0.28, start), new THREE.Euler(Math.PI / 2, 0, 0));
        p.tube('alloy', [V(side * W * 0.43, ground + 0.22, cr), V(side * W * 0.43, d.roof + 0.23, cr)], 0.045);
      }
    } else {
      p.box('alloy', 0, deck, center, W * 0.97, 0.10, length);
      for (const side of [-1, 1]) p.box('trim', side * W * 0.46, deck + 0.07, center, 0.065, 0.12, length);
      if (d.equipment === 'tow') {
        for (const side of [-1, 1]) p.tube('paint', [V(side * 0.34, deck, start + 0.20), V(side * 0.20, deck + 0.93, center), V(side * 0.16, deck + 0.52, rear - 0.20)], 0.075);
        p.tube('trim', [V(0, deck + 0.60, rear - 0.20), V(0, deck + 0.12, rear + 0.08)], 0.009);
      }
    }
  }
  if (kind === 'taxi') { rounded('white', 0, d.roof + 0.13, (rf + rr) / 2, 0.55, 0.19, 0.23); p.box('trim', 0, d.roof + 0.13, (rf + rr) / 2 - 0.121, 0.40, 0.075, 0.008); }
  const emergency = ['police', 'patrol', 'ambulance', 'fire', 'ladder'].includes(kind);
  if (emergency || kind === 'towtruck') {
    p.box('trim', 0, d.roof + 0.045, (rf + rr) / 2, W * 0.66, 0.06, 0.25);
    for (const side of [-1, 1]) rounded(kind === 'towtruck' ? 'amber' : side < 0 ? 'red' : 'blue', side * W * 0.22, d.roof + 0.12, (rf + rr) / 2, W * 0.22, 0.10, 0.23, 0.03);
  }
  if (kind === 'police' || kind === 'patrol') {
    for (const side of [-1, 1]) p.box('white', side * (W / 2 - 0.02), d.belt - 0.18, 0.1, 0.012, 0.14, L * 0.29);
    p.tube('trim', [V(-W * 0.30, ground + 0.13, -half - 0.12), V(-W * 0.30, d.nose + 0.02, -half - 0.12), V(W * 0.30, d.nose + 0.02, -half - 0.12), V(W * 0.30, ground + 0.13, -half - 0.12)], 0.025);
  }
}
