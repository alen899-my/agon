import * as THREE from 'three';
import type { KitLike, Model } from './VehicleFactory';
import { VehicleMeshBuilder } from './VehicleMeshBuilder';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const AXLES = [-1.40, 1.40];
const WR = 0.365, WY = WR + 0.08, ARCH = 0.405;

// Independent authoring coordinates, not a rescaled generic sedan.
// Stations: longitudinal position, half-width, shoulder height, centre deck height.
const STATIONS = [
  [-2.515, 0.86, 0.60, 0.60], [-2.35, 0.94, 0.73, 0.72],
  [-2.04, 0.985, 0.85, 0.79], [-1.40, 0.995, 0.91, 0.84],
  [-0.85, 0.96, 0.91, 0.91], [-0.30, 0.955, 0.92, 0.92],
  [0.55, 0.96, 0.94, 0.94], [1.12, 0.99, 0.95, 0.95],
  [1.40, 0.995, 0.96, 0.95], [1.95, 0.98, 0.95, 0.94],
  [2.35, 0.95, 0.91, 0.91], [2.515, 0.90, 0.84, 0.84],
];

/** Smooth cubic station interpolation avoids flat slabs and pointed fenders. */
function station(z: number, component: number): number {
  let i = 0;
  while (i < STATIONS.length - 2 && z > STATIONS[i + 1][0]) i++;
  const a = STATIONS[i], b = STATIONS[i + 1];
  const previous = STATIONS[Math.max(0, i - 1)], next = STATIONS[Math.min(STATIONS.length - 1, i + 2)];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1), t2 = t * t, t3 = t2 * t;
  const m0 = (b[component] - previous[component]) / (b[0] - previous[0]) * (b[0] - a[0]);
  const m1 = (next[component] - a[component]) / (next[0] - a[0]) * (b[0] - a[0]);
  return (2 * t3 - 3 * t2 + 1) * a[component] + (t3 - 2 * t2 + t) * m0
    + (-2 * t3 + 3 * t2) * b[component] + (t3 - t2) * m1;
}

function panelBottom(z: number): number {
  let y = 0.19;
  for (const axle of AXLES) {
    const d = Math.abs(z - axle);
    if (d <= ARCH) y = Math.max(y, WY + Math.sqrt(Math.max(0, ARCH * ARCH - d * d)));
  }
  return y;
}

function sidePoint(side: number, z: number, y: number, offset = 0): THREE.Vector3 {
  const t = THREE.MathUtils.clamp((y - 0.19) / (station(z, 2) - 0.19), 0, 1);
  const shoulderRoll = 0.028 * Math.pow(Math.max(0, (t - 0.82) / 0.18), 2);
  const rockerTuck = 0.045 * Math.pow(1 - t, 3);
  return V(side * (station(z, 1) - shoulderRoll - rockerTuck + offset), y, z);
}

function deckPoint(z: number, u: number, offset = 0): THREE.Vector3 {
  const cross = u * 2 - 1, edge = Math.abs(cross);
  const y = lerp(station(z, 3), station(z, 2), Math.pow(edge, 3)) + 0.018 * (1 - cross * cross);
  return V(cross * (station(z, 1) - 0.028), y + offset, z);
}

/** Authored stock-car body with its own materials, cockpit and wheel geometry.
 * Geometry is cached by VehicleFactory, shared by instances and disposed by the kit.
 * Other detailed cars can implement this same Model contract with their own panels.
 */
export function buildNascarModel(kit: KitLike): Model {
  const p = new VehicleMeshBuilder();
  const materials: Record<string, THREE.Material> = {};
  const owned: { dispose(): void }[] = [];
  const material = (role: string, value: THREE.Material) => { materials[role] = value; owned.push(value); };
  material('raceCarbon', new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.64, metalness: 0.12, side: THREE.DoubleSide }));
  material('raceRubber', new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.94 }));
  material('raceAlloy', new THREE.MeshStandardMaterial({ color: 0x51545b, metalness: 0.88, roughness: 0.29 }));
  material('raceSteel', new THREE.MeshStandardMaterial({ color: 0x969aa2, metalness: 0.9, roughness: 0.32 }));
  material('raceCage', new THREE.MeshStandardMaterial({ color: 0xdddddf, metalness: 0.45, roughness: 0.36 }));
  material('raceRed', new THREE.MeshStandardMaterial({ color: 0xc51e29, roughness: 0.5 }));
  material('glass', new THREE.MeshPhysicalMaterial({ color: 0x748d9c, roughness: 0.12, metalness: 0.05,
    transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 }));

  // Open side panels; no hidden solid block across the cockpit or wheel wells.
  for (const side of [-1, 1]) {
    // Split at each arch edge so its vertical return is exact, not a zigzag sample.
    const ranges = [-2.515, ...AXLES.flatMap(z => [z - ARCH, z + ARCH]), 2.515];
    for (let i = 0; i < ranges.length - 1; i++) {
      const start = ranges[i], end = ranges[i + 1];
      const isArch = i === 1 || i === 3;
      p.surface('paint', (u, v) => {
        const z = isArch ? lerp(start, end, (1 - Math.cos(u * Math.PI)) / 2) : lerp(start, end, u);
        // Non-arch sections use the sill even at the shared arch endpoint.
        const bottom = isArch ? panelBottom(z) : 0.19;
        return sidePoint(side, z, lerp(bottom, station(z, 2), v));
      }, isArch ? 64 : 24, 12, side < 0);
    }
    // Rolled fender lips and recessed inner liners follow the actual opening.
    for (const axle of AXLES) {
      p.surface('paint', (u, v) => {
        const angle = u * Math.PI, r = ARCH + v * 0.022;
        const z = axle - Math.cos(angle) * r;
        const point = sidePoint(side, z, WY + Math.sin(angle) * r);
        point.x += side * Math.sin(v * Math.PI) * 0.012; return point;
      }, 64, 5, side < 0);
      p.surface('raceCarbon', (u, v) => {
        const angle = Math.PI * u, z = axle - Math.cos(angle) * (ARCH + 0.012);
        return V(side * (station(z, 1) - 0.02 - v * 0.25), WY + Math.sin(angle) * (ARCH + 0.012), z);
      }, 64, 6, side > 0);
    }
    p.box('raceCarbon', side * 0.953, 0.19, 0, 0.065, 0.055, 1.97);
  }
  p.surface('paint', (u, v) => deckPoint(lerp(-2.515, -0.85, v), u), 40, 64);
  p.surface('paint', (u, v) => deckPoint(lerp(1.38, 2.515, v), u), 40, 40);
  // Narrow shoulder ledges beside the glasshouse.
  for (const side of [-1, 1]) p.surface('paint', (u, v) => {
    const z = lerp(-0.85, 1.38, v), outer = station(z, 1) - 0.028;
    return V(side * lerp(0.83, outer, u), station(z, 2), z);
  }, 10, 48, side < 0);

  // Rounded front and rear bumper skins taper in plan and elevation.
  for (const front of [true, false]) p.surface('paint', (u, v) => {
    const x = u * 2 - 1, edge = Math.abs(x), z = front ? -2.515 : 2.515;
    return V(x * lerp(station(z, 1) - 0.045, station(z, 1) - 0.028, v),
      lerp(0.20, station(z, 2), v), z + (front ? 1 : -1) * (0.10 * edge ** 4 + 0.025 * Math.sin(v * Math.PI)));
  }, 48, 16, !front);
  p.surface('raceCarbon', (u, v) => {
    const x = (u * 2 - 1) * 0.99;
    return V(x, 0.175 + 0.009 * v, lerp(-2.60 + 0.12 * (Math.abs(x) ** 6), -2.30, v));
  }, 48, 4);
  p.box('raceCarbon', 0, 0.19, 0, 1.43, 0.035, 4.5);
  // Diffuser and short stock-car spoiler (not a supercar pedestal wing).
  p.box('raceCarbon', 0, 0.23, 2.26, 1.72, 0.035, 0.49, -0.13);
  for (let i = -3; i <= 3; i++) p.box('raceCarbon', i * 0.23, 0.20, 2.28, 0.014, 0.12, 0.40);
  p.box('raceCarbon', 0, 1.00, 2.35, 1.85, 0.18, 0.025, -0.22);
  for (const side of [-1, 1]) p.box('raceSteel', side * 0.57, 0.96, 2.31, 0.012, 0.13, 0.07, -0.22);

  // Compound-curved roof, separate glazing and broad rear sail panels.
  const roof = (u: number, v: number, lift = 0) => {
    const cross = u * 2 - 1, z = lerp(-0.19, 0.70, v);
    return V(cross * lerp(0.665, 0.685, v), 1.355 + 0.055 * (1 - cross * cross) + 0.012 * Math.sin(Math.PI * v) + lift, z);
  };
  p.surface('paint', roof, 32, 32);
  p.quad('glass', V(-0.83, 0.923, -0.85), V(0.83, 0.923, -0.85), V(0.665, 1.355, -0.19), V(-0.665, 1.355, -0.19), 0.018);
  p.quad('glass', V(-0.685, 1.355, 0.70), V(0.685, 1.355, 0.70), V(0.83, 0.95, 1.38), V(-0.83, 0.95, 1.38), 0.015);
  for (const side of [-1, 1]) {
    const a = V(side * 0.83, 0.94, -0.82), b = V(side * 0.665, 1.355, -0.19);
    const c = V(side * 0.685, 1.355, 0.70), d = V(side * 0.83, 0.95, 1.38);
    p.tube('paint', [a, b], 0.034); p.tube('paint', [b, c], 0.027);
    p.quad('paint', c, d, V(side * 0.89, 0.945, 0.84), V(side * 0.70, 1.33, 0.52));
    p.tube('raceCarbon', [a, V(side * 0.85, 0.945, 0.88)], 0.017);
    p.tube('raceCarbon', [V(side * 0.70, 1.335, 0.48), V(side * 0.845, 0.945, 0.53)], 0.022);
    if (side > 0) p.quad('glass', a, b, V(side * 0.69, 1.335, 0.47), V(side * 0.84, 0.945, 0.52));
    // Quarter-window panel and visible window fasteners.
    p.quad('glass', V(side * 0.71, 1.31, 0.54), V(side * 0.73, 1.29, 0.66), V(side * 0.83, 0.97, 1.04), V(side * 0.83, 0.97, 0.57));
    for (let i = 0; i < 7; i++) {
      const z = lerp(-0.68, 0.80, i / 6);
      p.add('raceSteel', new THREE.SphereGeometry(0.009, 6, 4), V(side * 0.846, 0.951, z));
    }
  }
  // Driver's window is an opening with woven straps, not opaque black glass.
  const net = (u: number, v: number) => V(lerp(-0.825, -0.69, v), lerp(0.97, 1.30, v), lerp(lerp(-0.71, -0.22, v), 0.43, u));
  for (let i = 0; i <= 9; i++) p.tube('raceCarbon', [net(i / 9, 0), net(i / 9, 1)], 0.007);
  for (let i = 0; i <= 5; i++) p.tube('raceCarbon', [net(0, i / 5), net(1, i / 5)], 0.007);

  // Welded cage, door bars and harness remain visible through the windows.
  for (const z of [-0.28, 0.64]) p.tube('raceCage', [V(-0.72, 0.29, z), V(-0.70, 0.96, z), V(-0.60, 1.29, z), V(0.60, 1.29, z), V(0.70, 0.96, z), V(0.72, 0.29, z)], 0.025);
  for (const side of [-1, 1]) {
    p.tube('raceCage', [V(side * 0.60, 1.29, -0.28), V(side * 0.60, 1.29, 0.64), V(side * 0.68, 0.53, 1.43)], 0.025);
    p.tube('raceCage', [V(side * 0.71, 0.45, -0.30), V(side * 0.72, 0.80, 0.64)], 0.024);
    p.tube('raceCage', [V(side * 0.71, 0.80, -0.30), V(side * 0.72, 0.45, 0.64)], 0.024);
  }
  p.tube('raceCage', [V(-0.60, 1.29, 0.64), V(0.70, 0.37, 0.64)], 0.025);
  p.box('raceCarbon', -0.34, 0.44, 0.30, 0.43, 0.12, 0.49);
  p.box('raceCarbon', -0.34, 0.72, 0.52, 0.44, 0.61, 0.10, -0.10);
  for (const side of [-1, 1]) {
    p.box('raceCarbon', -0.34 + side * 0.20, 0.70, 0.33, 0.065, 0.37, 0.30);
    p.box('raceRed', -0.34 + side * 0.09, 0.76, 0.448, 0.052, 0.43, 0.018, -0.10);
  }
  p.box('raceCarbon', 0, 0.88, -0.56, 1.48, 0.15, 0.37);
  p.box('raceSteel', 0.13, 0.40, 0.16, 0.18, 0.24, 0.64);
  p.tube('raceSteel', [V(0.11, 0.49, 0.12), V(0.10, 0.72, 0.08)], 0.015);
  p.add('raceCarbon', new THREE.SphereGeometry(0.036, 12, 8), V(0.10, 0.72, 0.08));

  // Grilles, hood extractor vents, fasteners and side-exit exhaust.
  p.box('raceCarbon', 0, 0.35, -2.523, 1.13, 0.20, 0.015);
  for (let i = -12; i <= 12; i++) p.box('raceAlloy', i * 0.043, 0.35, -2.534, 0.007, 0.17, 0.008);
  for (let i = 0; i < 4; i++) p.box('raceAlloy', 0, 0.28 + i * 0.045, -2.539, 1.10, 0.005, 0.006);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) p.box('raceCarbon', side * 0.47, 0.881 + i * 0.005, -1.16 + i * 0.045, 0.28, 0.012, 0.016);
    for (const z of [-1.97, -0.94]) {
      const point = deckPoint(z, (side * 0.70 + 1) / 2, 0.009);
      p.add('raceSteel', new THREE.CylinderGeometry(0.025, 0.025, 0.008, 16), point);
      p.tube('raceCarbon', [point.clone().add(V(-0.025, 0.008, 0)), point.clone().add(V(0.025, 0.008, 0))], 0.003);
    }
    p.box('raceSteel', side * 0.963, 0.28, 0.87, 0.035, 0.10, 0.26);
    p.box('raceCarbon', side * 0.985, 0.28, 0.87, 0.012, 0.065, 0.20);
    p.tube('raceCarbon', [V(side * 0.81, 1.01, -0.63), V(side * 0.99, 1.02, -0.67)], 0.012);
    p.box('paint', side * 1.01, 1.025, -0.67, 0.12, 0.065, 0.16);
    p.box('raceSteel', side * 1.01, 1.025, -0.583, 0.10, 0.045, 0.006);
  }
  p.tube('raceCarbon', [V(0.15, 1.415, 0.43), V(0.15, 1.61, 0.44)], 0.004);
  // Flush hood shut-lines, roof safety flaps and a recessed fuel filler.
  for (const side of [-1, 1]) {
    p.tube('raceCarbon', Array.from({ length: 24 }, (_, i) =>
      deckPoint(lerp(-2.08, -0.87, i / 23), side < 0 ? 0.145 : 0.855, 0.002)), 0.002);
    const flapX = side * 0.29;
    p.tube('raceCarbon', [V(flapX - 0.12, 1.409, 0.14), V(flapX + 0.12, 1.409, 0.14),
      V(flapX + 0.12, 1.409, 0.43), V(flapX - 0.12, 1.409, 0.43), V(flapX - 0.12, 1.409, 0.14)], 0.002);
  }
  p.add('raceCarbon', new THREE.CylinderGeometry(0.073, 0.073, 0.012, 32), V(-0.971, 0.77, 2.06), new THREE.Euler(0, 0, Math.PI / 2));
  p.add('raceSteel', new THREE.CylinderGeometry(0.047, 0.047, 0.016, 24), V(-0.982, 0.77, 2.06), new THREE.Euler(0, 0, Math.PI / 2));

  // Paint graphics are mapped onto the curved panels rather than floating boxes.
  // Fictional team livery keeps the geometry independent of a particular sponsor.
  const decal = (role: string, draw: (ctx: CanvasRenderingContext2D) => void, w = 1024, h = 512) => {
    if (typeof document === 'undefined') { material(role, new THREE.MeshStandardMaterial({ color: 0xffffff })); return; }
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { material(role, new THREE.MeshStandardMaterial({ color: 0xffffff })); return; }
    draw(ctx);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8; owned.push(texture);
    material(role, new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false,
      roughness: 0.34, metalness: 0.06, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  };
  decal('raceNumber', ctx => {
    ctx.font = 'italic 900 440px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 28; ctx.strokeStyle = '#101820'; ctx.strokeText('24', 512, 264);
    ctx.fillStyle = '#f9fafb'; ctx.fillText('24', 512, 264);
  });
  decal('raceSponsor', ctx => {
    ctx.textAlign = 'center'; ctx.fillStyle = '#f7f8fc'; ctx.font = '900 italic 205px Arial'; ctx.fillText('AGON', 512, 258);
    ctx.font = '600 60px Arial'; ctx.fillText('M O T O R S P O R T', 512, 353);
  });
  decal('raceBadges', ctx => {
    const names = ['RACING', 'APEX', 'V8', 'TRACK', 'RACE FUEL', 'PERFORMANCE'];
    names.forEach((name, i) => {
      const x = (i % 2) * 500 + 12, y = Math.floor(i / 2) * 165 + 12;
      ctx.fillStyle = i % 2 ? '#f2f3f5' : '#f7cd35'; ctx.fillRect(x, y, 475, 142);
      ctx.fillStyle = '#152134'; ctx.font = '900 45px Arial'; ctx.textAlign = 'center'; ctx.fillText(name, x + 237, y + 88);
    });
  });
  decal('raceLamp', ctx => {
    ctx.fillStyle = '#111a24'; ctx.beginPath(); ctx.moveTo(20, 50); ctx.lineTo(1000, 130); ctx.lineTo(930, 460); ctx.lineTo(90, 380); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#cbdbe7'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(85, 105); ctx.lineTo(940, 175); ctx.lineTo(880, 285); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#788b9b'; ctx.fillRect(180 + i * 235, 215, 160, 110); }
  });
  decal('raceTail', ctx => {
    ctx.fillStyle = '#12141b'; ctx.fillRect(0, 40, 1024, 420);
    ctx.fillStyle = '#c22632'; for (let i = 0; i < 3; i++) ctx.fillRect(70 + i * 320, 90, 230, 315);
  });
  decal('raceTyreLettering', ctx => {
    ctx.fillStyle = '#e9c844'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 43px Arial';
    for (const [word, centre] of [['EAGLE', -Math.PI / 2], ['RACING', Math.PI / 2]] as const) {
      [...word].forEach((letter, i) => {
        const angle = centre + (i - (word.length - 1) / 2) * 0.12;
        ctx.save(); ctx.translate(512 + Math.cos(angle) * 452, 512 + Math.sin(angle) * 452);
        ctx.rotate(angle + Math.PI / 2); ctx.fillText(letter, 0, 0); ctx.restore();
      });
    }
  }, 1024, 1024);
  for (const side of [-1, 1]) {
    p.surface('raceNumber', (u, v) => sidePoint(side, lerp(side < 0 ? -0.60 : 0.52, side < 0 ? 0.52 : -0.60, u), lerp(0.88, 0.34, v), 0.004), 24, 16);
    p.surface('raceBadges', (u, v) => sidePoint(side, lerp(side < 0 ? -1.02 : -0.68, side < 0 ? -0.68 : -1.02, u), lerp(0.76, 0.45, v), 0.005), 12, 12);
    p.quad('raceLamp', V(side * 0.36, 0.58, -2.527), V(side * 0.82, 0.57, -2.457), V(side * 0.82, 0.43, -2.457), V(side * 0.36, 0.44, -2.527));
    p.quad('raceTail', V(side * 0.37, 0.78, 2.526), V(side * 0.80, 0.77, 2.475), V(side * 0.80, 0.65, 2.475), V(side * 0.37, 0.66, 2.526));
    // Contrast lower sweep follows the flank and stays between the arches.
    p.surface('raceCarbon', (u, v) => {
      const z = lerp(-0.97, 0.98, u);
      return sidePoint(side, z, 0.23 + v * (0.055 + u * 0.06), 0.003);
    }, 32, 4, side < 0);
  }
  p.surface('raceSponsor', (u, v) => deckPoint(lerp(-2.01, -1.28, v), lerp(0.20, 0.80, u), 0.005), 32, 24);
  p.surface('raceNumber', (u, v) => roof(lerp(0.14, 0.86, u), lerp(0.08, 0.92, v), 0.005), 24, 24);

  // Lathed tyre carcass has round shoulders and a real open centre.
  const wheels = {} as Model['wheels'];
  for (const side of [-1, 1] as const) {
    const w = new VehicleMeshBuilder();
    const profile = [V(0.235, -0.146, 0), V(0.29, -0.158, 0), V(0.342, -0.154, 0),
      V(0.361, -0.126, 0), V(WR, -0.09, 0), V(WR, 0.09, 0), V(0.361, 0.126, 0),
      V(0.342, 0.154, 0), V(0.29, 0.158, 0), V(0.235, 0.146, 0), V(0.235, -0.146, 0)];
    w.add('raceRubber', new THREE.LatheGeometry(profile.map(v => new THREE.Vector2(v.x, v.y)), 64), V(0, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    const face = side * 0.149;
    for (const r of [0.238, 0.223]) w.add('raceAlloy', new THREE.TorusGeometry(r, 0.012, 10, 64), V(face, 0, 0), new THREE.Euler(0, Math.PI / 2, 0));
    w.add('raceSteel', new THREE.CylinderGeometry(0.193, 0.193, 0.018, 64), V(side * 0.10, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      w.tube('raceAlloy', [V(face, Math.cos(a) * 0.055, Math.sin(a) * 0.055), V(face - side * 0.018, Math.cos(a + 0.08) * 0.218, Math.sin(a + 0.08) * 0.218)], 0.014);
    }
    w.add('raceAlloy', new THREE.CylinderGeometry(0.067, 0.067, 0.04, 32), V(face, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    w.add('raceSteel', new THREE.CylinderGeometry(0.033, 0.033, 0.024, 6), V(face + side * 0.023, 0, 0), new THREE.Euler(0, 0, Math.PI / 2));
    // Sidewall moulding rings remain subtle instead of toy-like tread lumps.
    for (const r of [0.28, 0.325]) w.add('raceRubber', new THREE.TorusGeometry(r, 0.002, 4, 64), V(side * 0.157, 0, 0), new THREE.Euler(0, Math.PI / 2, 0));
    w.add('raceTyreLettering', new THREE.RingGeometry(0.27, 0.345, 64), V(side * 0.160, 0, 0), new THREE.Euler(0, side * Math.PI / 2, 0));
    wheels[side === -1 ? '-1' : '1'] = w.finish();
  }
  const parts = p.finish();
  // Resource ownership stays with the factory cache; instances only own transforms.
  return { parts, materials, wheels, WR, style: 'sport',
    wheelPos: AXLES.flatMap(z => [-1, 1].map(side => ({ x: side * 0.825, z, front: z < 0 }))),
    eye: V(-0.34, 1.14, 0.12), steerPos: V(-0.34, 0.85, -0.28), steerTilt: -0.28,
    doors: [], wiperAnchors: [],
    garageLayout: { hoodY: 0.86, hoodZ: -1.54, hoodLength: 1.25, roofY: 1.42, roofZ: 0.25, roofLength: 0.89 },
    dispose: () => { parts.forEach(g => g.dispose()); Object.values(wheels).forEach(map => map.forEach(g => g.dispose())); owned.forEach(o => o.dispose()); },
  };
}
