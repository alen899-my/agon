import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VEHICLES, VEHICLE_WHEELS, pickVehiclePaint, type VehicleKind, type VehicleSpec, type WheelStyle } from './Vehicles';

/**
 * Procedural, low-poly-budget vehicle factory (no GLB / image files).
 *
 *  - Each KIND is modelled ONCE (side-profile body shell, sloped glass, pillars, bumpers, lights,
 *    kind details) and every box/curve is MERGED into ~10 geometries by material role.
 *  - Each car instance is then only: ~8 body meshes + 3 meshes per wheel + 2 doors + steering wheel.
 *    (the old version made 85-120 separate meshes per car.)
 *  - Variants: paint colour comes from pickVehiclePaint(kind, variant); wheel look from VEHICLE_WHEELS.
 *  - Sizes still come from VEHICLES (length / width / height / cab) so physics is untouched.
 */

type Mat = 'road' | 'pavement' | 'white' | 'ink' | 'glass' | 'metal' | 'wall0' | 'wall1' | 'wall2' | 'leaf';

/** The bits of AssetKit this file needs (AssetKit satisfies it once `extra` is public). */
export interface KitLike {
  geometry: { box: THREE.BufferGeometry; cylinder: THREE.BufferGeometry; sphere: THREE.BufferGeometry };
  materials: Record<Mat, THREE.MeshStandardMaterial>;
  extra: { dispose: () => void }[];
}

export interface VehicleParts {
  group: THREE.Group; body: THREE.Group; glazing: THREE.Mesh; steeringWheel: THREE.Group; eye: THREE.Vector3;
  spins: THREE.Object3D[]; frontSteer: THREE.Group[];
  doors: THREE.Group[];
  brakeMat: THREE.MeshStandardMaterial; headMat: THREE.MeshStandardMaterial;
  blinkerMat: THREE.MeshStandardMaterial;
  spin: number;
  update: (speed: number, steer: number, dt: number, braking: boolean, bodyTilt?: { pitch: number; roll: number }, blinker?: number, time?: number) => void;
}

// ------------------------------------------------------------------------------------------------
// Silhouettes: hood/cab = fractions of length; ws/rw = windshield/rear-window run (x glass height);
// belt = beltline height; hd/td = hood/deck below belt; sn = nose drop; sill = raised lower panel.
// ------------------------------------------------------------------------------------------------
interface Sil { hood: number; cab: number; ws: number; rw: number; belt: number; hd: number; td: number; sn: number; sill: number }
const SIL = {
  sedan:    { hood: 0.29, cab: 0.52, ws: 0.95, rw: 1.0,  belt: 1.10, hd: 0.03, td: 0.10, sn: 0.28, sill: 0 },
  coupe:    { hood: 0.34, cab: 0.45, ws: 1.15, rw: 1.3,  belt: 1.04, hd: 0.05, td: 0.12, sn: 0.30, sill: 0 },
  fast:     { hood: 0.36, cab: 0.42, ws: 1.3,  rw: 1.9,  belt: 1.00, hd: 0.08, td: 0.18, sn: 0.36, sill: 0 },
  mid:      { hood: 0.30, cab: 0.42, ws: 1.3,  rw: 1.2,  belt: 0.98, hd: 0.12, td: 0.05, sn: 0.40, sill: 0 },
  muscle:   { hood: 0.35, cab: 0.40, ws: 1.0,  rw: 1.1,  belt: 1.08, hd: 0.04, td: 0.06, sn: 0.20, sill: 0 },
  classic:  { hood: 0.40, cab: 0.34, ws: 1.0,  rw: 1.6,  belt: 1.00, hd: 0.06, td: 0.16, sn: 0.32, sill: 0 },
  roadster: { hood: 0.36, cab: 0.38, ws: 0.6,  rw: 0.0,  belt: 0.98, hd: 0.06, td: 0.12, sn: 0.30, sill: 0 },
  hatch:    { hood: 0.25, cab: 0.60, ws: 0.9,  rw: 0.45, belt: 1.08, hd: 0.04, td: 0.02, sn: 0.26, sill: 0 },
  wagon:    { hood: 0.27, cab: 0.66, ws: 0.95, rw: 0.3,  belt: 1.10, hd: 0.04, td: 0.0,  sn: 0.26, sill: 0 },
  suv:      { hood: 0.22, cab: 0.68, ws: 0.6,  rw: 0.2,  belt: 1.20, hd: 0.02, td: 0.0,  sn: 0.16, sill: 0.10 },
  boxy:     { hood: 0.20, cab: 0.70, ws: 0.15, rw: 0.06, belt: 1.20, hd: 0.0,  td: 0.0,  sn: 0.08, sill: 0.12 },
  pickup:   { hood: 0.26, cab: 0.38, ws: 0.7,  rw: 0.1,  belt: 1.22, hd: 0.02, td: 0.0,  sn: 0.16, sill: 0.10 },
  van:      { hood: 0.08, cab: 0.88, ws: 0.9,  rw: 0.04, belt: 1.15, hd: 0.25, td: 0.0,  sn: 0.30, sill: 0.30 },
  minivan:  { hood: 0.17, cab: 0.76, ws: 1.0,  rw: 0.35, belt: 1.12, hd: 0.08, td: 0.0,  sn: 0.30, sill: 0.15 },
  bus:      { hood: 0.0,  cab: 0.97, ws: 0.15, rw: 0.05, belt: 1.10, hd: 0.0,  td: 0.0,  sn: 0.10, sill: 0.28 },
  rig:      { hood: 0.04, cab: 0.30, ws: 0.2,  rw: 0.05, belt: 1.15, hd: 0.10, td: 0.10, sn: 0.14, sill: 0.30 },
  conv:     { hood: 0.0,  cab: 0.31, ws: 0.12, rw: 0.05, belt: 1.15, hd: 0.12, td: 0.10, sn: 0.22, sill: 0.30 },
} satisfies Record<string, Sil>;
type SilName = keyof typeof SIL;

const STYLE: Record<VehicleKind, SilName> = {
  car: 'sedan', hatch: 'hatch', taxi: 'sedan', police: 'sedan', sport: 'fast', muscle: 'muscle', super: 'mid', convertible: 'roadster',
  suv: 'suv', pickup: 'pickup', van: 'van', minivan: 'minivan', ambulance: 'rig', fire: 'rig', boxTruck: 'rig', bus: 'bus',
  hyper: 'mid', track: 'fast', rally: 'sedan', drift: 'fast', classic: 'classic', egt: 'fast', coupe: 'coupe', wagon: 'wagon',
  limo: 'sedan', compact: 'hatch', esedan: 'sedan', jeep: 'boxy', gwagen: 'boxy', crossover: 'suv', hummer: 'boxy', cruiser: 'suv',
  buggy: 'roadster', semi: 'conv', flatbed: 'conv', towtruck: 'conv', dump: 'conv', tanker: 'conv', raptor: 'pickup', camper: 'van',
  shuttle: 'van', stepvan: 'rig', patrol: 'suv', ladder: 'rig', coach: 'bus', minibus: 'van',
};

interface Trim {
  wing?: number; bigWing?: boolean; lip?: boolean; scoop?: boolean;
  stripe?: 'center' | 'dual' | 'side'; contrastRoof?: boolean;
  spare?: boolean; bullbar?: boolean; roofRack?: boolean; roofBox?: boolean;
  snorkel?: boolean; roofLights?: boolean; mudflaps?: boolean; chromeBumpers?: boolean;
  rollbar?: boolean; flatbed?: boolean; wrecker?: boolean; dumpBed?: boolean; tank?: boolean;
  fifthWheel?: boolean; stacks?: boolean; ladderTop?: boolean; outriggers?: boolean;
  lightbar?: 'police' | 'amber'; pushbar?: boolean;
}
const TRIM: Partial<Record<VehicleKind, Trim>> = {
  sport: { lip: true }, muscle: { stripe: 'dual', scoop: true }, super: { wing: 0.9 }, taxi: { stripe: 'side' },
  hyper: { wing: 1.1, lip: true, scoop: true },
  track: { bigWing: true, stripe: 'dual', mudflaps: true },
  rally: { scoop: true, stripe: 'dual', mudflaps: true, lip: true },
  drift: { wing: 1, stripe: 'side' },
  classic: { chromeBumpers: true, stripe: 'center' },
  egt: { lip: true }, coupe: { lip: true },
  wagon: { roofRack: true, lip: true },
  limo: { stripe: 'side' },
  compact: { contrastRoof: true, stripe: 'dual' },
  esedan: { lip: true },
  jeep: { spare: true, bullbar: true, mudflaps: true },
  gwagen: { roofRack: true, spare: true },
  crossover: { roofRack: true },
  hummer: { roofLights: true, bullbar: true },
  cruiser: { roofRack: true, snorkel: true },
  buggy: { rollbar: true, stripe: 'center' },
  semi: { fifthWheel: true, stacks: true },
  flatbed: { flatbed: true },
  towtruck: { wrecker: true, lightbar: 'amber' },
  dump: { dumpBed: true },
  tanker: { tank: true },
  raptor: { stripe: 'side', roofLights: true, mudflaps: true },
  camper: { roofBox: true, stripe: 'side' },
  shuttle: { stripe: 'side' },
  patrol: { lightbar: 'police', pushbar: true },
  ladder: { ladderTop: true, outriggers: true, stripe: 'side' },
  coach: { stripe: 'side' },
  minibus: { stripe: 'side' },
};

// ------------------------------------------------------------------------------------------------
// Geometry collector: add transformed primitives per material role, then merge each role to 1 mesh.
// ------------------------------------------------------------------------------------------------
class Parts {
  private lists = new Map<string, THREE.BufferGeometry[]>();
  private tmp = new THREE.Object3D();
  add(role: string, geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): void {
    const t = this.tmp; t.position.set(x, y, z); t.scale.set(sx, sy, sz); t.rotation.set(rx, ry, rz); t.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(t.matrix);
    if (!this.lists.has(role)) this.lists.set(role, []);
    this.lists.get(role)!.push(g);
  }
  build(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [role, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (merged) out.set(role, merged);
    }
    this.lists.clear();
    return out;
  }
}

/** Extrude a side profile (x = length axis, y = height) across the width; low segment counts. */
function extrudeProfile(shape: THREE.Shape, depth: number, bevel: number): THREE.BufferGeometry {
  const inner = Math.max(0.05, depth - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: inner, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4, steps: 1,
  });
  geo.translate(0, 0, -inner / 2);
  geo.rotateY(-Math.PI / 2); // profile x -> world z, extrusion -> world x
  return geo;
}

function wheelRadius(kind: VehicleKind, spec: VehicleSpec): number {
  if (spec.length > 6.5 || kind === 'bus' || kind === 'coach' || kind === 'semi' || kind === 'dump') return 0.5;
  if (kind === 'buggy' || kind === 'compact') return 0.36;
  if (spec.category === 'suv') return kind === 'crossover' ? 0.42 : 0.46;
  if (spec.category === 'truck' || spec.category === 'van' || spec.category === 'service') return 0.44;
  if (spec.category === 'sport') return 0.38;
  return 0.4;
}

interface Model {
  parts: Map<string, THREE.BufferGeometry>;
  wheels: Record<'-1' | '1', Map<string, THREE.BufferGeometry>>;
  wheelPos: { x: number; z: number; front: boolean }[];
  WR: number; style: WheelStyle;
  eye: THREE.Vector3; steerPos: THREE.Vector3;
  doors: { x: number; y: number; z: number; dl: number; dh: number }[];
  dispose: () => void;
}

const caches = new WeakMap<KitLike, Map<string, { dispose: () => void }>>();
function cached<T extends { dispose: () => void }>(kit: KitLike, key: string, make: () => T): T {
  let map = caches.get(kit);
  if (!map) { map = new Map(); caches.set(kit, map); }
  let item = map.get(key);
  if (!item) { item = make(); map.set(key, item); kit.extra.push(item); }
  return item as T;
}

// ------------------------------------------------------------------------------------------------
// Build the shared model for one kind (runs once per kind per kit).
// ------------------------------------------------------------------------------------------------
function buildModel(kit: KitLike, kind: VehicleKind): Model {
  const spec = VEHICLES[kind] as VehicleSpec;
  const sil = SIL[STYLE[kind]] as Sil;
  const L = spec.length, W = spec.width, H = spec.height, hl = L / 2;
  const openTop = kind === 'convertible' || kind === 'buggy';
  const B = kit.geometry.box, C = kit.geometry.cylinder;
  const P = new Parts();

  // layout numbers
  const G = 0.3;
  const belt = sil.belt, hoodY = belt - sil.hd, deckY = belt - sil.td, sill = sil.sill * H, roofY = belt + H;
  const gl = spec.cab ?? sil.cab * L;
  const zf = Math.max(-hl + 0.15, spec.cab !== undefined ? 0.1 - gl / 2 : -hl + sil.hood * L);
  const zr = Math.min(zf + gl, hl - 0.12);
  const glen = zr - zf;
  const cowlF = hoodY + sill, cowlR = deckY + sill;
  const Hg = roofY - Math.max(cowlF, cowlR);
  let a = openTop ? 0.5 : sil.ws * Hg, b = sil.rw * Hg;
  if (a + b > glen * 0.8) { const k = (glen * 0.8) / (a + b); a *= k; b *= k; }
  const topF = zf + a, topR = zr - b;
  const roofMid = (topF + topR) / 2, roofLen = Math.max(0.2, topR - topF);
  const t: Trim = TRIM[kind] ?? {};

  const bx = (role: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => P.add(role, B, x, y, z, sx, sy, sz);
  const paint = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => bx('paint', x, y, z, sx, sy, sz);
  const ink = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => bx('ink', x, y, z, sx, sy, sz);
  const metal = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => bx('metal', x, y, z, sx, sy, sz);
  const white = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => bx('white', x, y, z, sx, sy, sz);
  const stripe = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => bx('accent', x, y, z, sx, sy, sz);
  const disc = (role: string, x: number, y: number, z: number, r: number, thick: number) => P.add(role, C, x, y, z, r, thick, r, Math.PI / 2);
  const bar = (role: string, x: number, z0: number, y0: number, z1: number, y1: number, tx: number, ty = tx) => {
    const dz = z1 - z0, dy = y1 - y0;
    P.add(role, B, x, (y0 + y1) / 2, (z0 + z1) / 2, tx, ty, Math.hypot(dy, dz), Math.atan2(-dy, dz));
  };

  // ---- body shell ----
  {
    const sh = new THREE.Shape();
    const hoodLen = zf + hl;
    const hoodStart = -hl + Math.min(0.8, hoodLen * 0.6);
    const ctrl = -hl + Math.min(0.15, hoodLen * 0.2);
    sh.moveTo(-hl + 0.3, G); sh.lineTo(hl - 0.3, G);
    sh.quadraticCurveTo(hl, G, hl, G + 0.25);
    sh.lineTo(hl, deckY - 0.14);
    sh.quadraticCurveTo(hl, deckY, hl - 0.28, deckY);
    sh.lineTo(zr, deckY);
    if (sill > 0) sh.lineTo(zr, cowlR);
    sh.lineTo(zf, cowlF);
    if (sill > 0) sh.lineTo(zf, hoodY);
    sh.lineTo(hoodStart, hoodY);
    sh.quadraticCurveTo(ctrl, hoodY - 0.02, -hl, hoodY - sil.sn);
    sh.lineTo(-hl, G + 0.25);
    sh.quadraticCurveTo(-hl, G, -hl + 0.3, G);
    const g = extrudeProfile(sh, W, 0.05);
    P.add('paint', g, 0, 0, 0, 1, 1, 1); g.dispose();
  }
  ink(0, G + 0.02, 0, W - 0.25, 0.1, L - 0.5); // underbody

  // ---- glass + pillars ----
  if (!openTop) {
    const gs = new THREE.Shape();
    gs.moveTo(zf, cowlF - 0.02); gs.lineTo(topF, roofY - 0.03); gs.lineTo(topR, roofY - 0.03); gs.lineTo(zr, cowlR - 0.02);
    const gg = extrudeProfile(gs, W * 0.88, 0);
    P.add('glass', gg, 0, 0, 0, 1, 1, 1); gg.dispose();
    bx(t.contrastRoof ? 'white' : 'paint', 0, roofY - 0.025, roofMid, W * 0.9, 0.09, roofLen + 0.14);
    const topSill = Math.max(cowlF, cowlR);
    for (const s of [-1, 1]) {
      const px = s * (W * 0.44 + 0.015);
      bar('paint', px, zf, cowlF, topF, roofY - 0.03, 0.09);
      bar('paint', px, zr, cowlR, topR, roofY - 0.03, 0.1);
      if (spec.category !== 'bus' && glen > 1.9 && sil.sill < 0.25) bx('ink', px, (topSill + roofY) / 2, zf + glen * 0.5, 0.07, roofY - topSill, 0.09);
    }
    if (spec.category === 'bus' || kind === 'van' || kind === 'minibus' || kind === 'shuttle' || kind === 'camper') {
      for (let z = zf + 1.1; z < zr - 0.6; z += 1.0) for (const s of [-1, 1]) bx('ink', s * (W * 0.44 + 0.015), (cowlF + roofY) / 2, z, 0.07, roofY - cowlF, 0.07);
    }
  } else {
    bar('glass', 0, zf, cowlF, zf + 0.42, cowlF + 0.3, W * 0.84, 0.03);
    for (const s of [-1, 1]) bar('metal', s * (W * 0.42), zf, cowlF, zf + 0.42, cowlF + 0.3, 0.05);
    ink(0, (cowlF + cowlR) / 2 + 0.02, (zf + zr) / 2 + 0.1, W - 0.45, 0.04, glen - 0.3);
    for (const s of [-1, 1]) {
      bx('seat', s * 0.4, (cowlF + cowlR) / 2 + 0.1, (zf + zr) / 2 + 0.25, 0.5, 0.12, 0.5);
      bx('seat', s * 0.4, (cowlF + cowlR) / 2 + 0.38, zr - 0.2, 0.5, 0.5, 0.12);
    }
  }

  // ---- cockpit ----
  const tallCab = H > 1.6 || kind === 'bus' || kind === 'fire' || kind === 'boxTruck';
  const eye = new THREE.Vector3(-0.36, belt + H * 0.65 + (tallCab ? 0.5 : 0), zf + 0.7);
  for (const s of [-1, 1]) {
    ink(s * 0.44, belt + 0.04, eye.z + 0.15, 0.62, 0.14, 0.65);
    const bh = Math.min(0.55, H * 0.7);
    ink(s * 0.44, belt + 0.1 + bh / 2, eye.z + 0.55, 0.55, bh, 0.12);
  }
  ink(0, Math.max(belt - 0.02, eye.y - 0.55), zf + 0.1, W - 0.3, 0.12, 0.3);
  const steerPos = new THREE.Vector3(-0.36, eye.y - 0.25, eye.z - 0.45);

  // ---- fascia ----
  const faceTop = hoodY - sil.sn;
  const lampX = W / 2 - 0.36;
  ink(0, G + 0.24, -hl - 0.01, W - 0.24, 0.22, 0.14);
  ink(0, G + 0.24, hl + 0.01, W - 0.24, 0.22, 0.14);
  ink(0, Math.max(G + 0.45, faceTop - 0.12), -hl - 0.02, W * 0.46, 0.15, 0.06);
  metal(0, Math.max(G + 0.55, faceTop - 0.02), -hl - 0.025, W * 0.46, 0.025, 0.06);
  white(0, G + 0.3, -hl - 0.085, 0.52, 0.14, 0.02);
  white(0, G + 0.3, hl + 0.085, 0.52, 0.14, 0.02);
  metal(-0.32, G + 0.14, hl + 0.06, 0.09, 0.09, 0.14); metal(0.32, G + 0.14, hl + 0.06, 0.09, 0.09, 0.14);
  for (const s of [-1, 1]) {
    ink(s * (W / 2 - 0.01), G + 0.12, 0, 0.05, 0.1, L - 1.4);
    ink(s * (W / 2 + 0.01), cowlF + 0.1, zf + 0.12, 0.22, 0.03, 0.03);
    paint(s * (W / 2 + 0.12), cowlF + 0.13, zf + 0.12, 0.12, 0.11, 0.2);
    bx('head', s * lampX, Math.max(G + 0.5, faceTop - 0.07), -hl - 0.012, 0.36, 0.13, 0.06);
    bx('brake', s * lampX, deckY - 0.2, hl + 0.012, 0.34, 0.12, 0.06);
    bx('blink', s * (W / 2 - 0.02), hoodY - 0.28, -hl + 0.35, 0.06, 0.1, 0.22);
    bx('blink', s * (W / 2 - 0.02), deckY - 0.28, hl - 0.35, 0.06, 0.1, 0.22);
  }

  // ---- wheels (positions + arches) ----
  const WR = wheelRadius(kind, spec);
  const trackX = W / 2 - 0.05;
  const wheelZ = L * 0.32;
  const wheelPos: Model['wheelPos'] = [];
  for (const s of [-1, 1]) for (const z of [-wheelZ, wheelZ]) {
    wheelPos.push({ x: s * trackX, z, front: z < 0 });
    P.add('ink', C, s * (W / 2 + 0.005), WR + 0.08, z, WR + 0.1, 0.035, WR + 0.1, 0, 0, Math.PI / 2); // arch shadow
  }

  // ---- doors ----
  const dl = Math.min(1.25, glen * 0.48), dh = Math.max(0.3, cowlF - G - 0.14);
  const doors = [-1, 1].map(s => ({ x: s * (W / 2), y: G + 0.07 + dh / 2, z: zf + 0.15, dl, dh }));

  // ---- kind-specific bodywork ----
  const rearLen = hl - zr, hoodMid = (zf - hl) / 2 - 0.1;
  if (kind === 'pickup' || kind === 'raptor') {
    const bl = rearLen - 0.1;
    ink(0, deckY + 0.03, zr + 0.05 + bl / 2, W - 0.3, 0.04, bl);
    for (const s of [-1, 1]) paint(s * (W / 2 - 0.08), deckY + 0.2, zr + 0.05 + bl / 2, 0.12, 0.4, rearLen);
    paint(0, deckY + 0.2, zr + 0.08, W - 0.2, 0.4, 0.1);
    paint(0, deckY + 0.2, hl - 0.05, W - 0.2, 0.4, 0.1);
  }
  if (kind === 'taxi') { white(0, roofY + 0.12, roofMid, 0.7, 0.2, 0.42); ink(0, roofY + 0.12, roofMid - 0.215, 0.72, 0.1, 0.02); }
  if (kind === 'police') {
    ink(0, hoodY + 0.012, hoodMid - 0.25, W - 0.4, 0.015, Math.max(0.3, zf + hl - 0.9));
    ink(0, deckY + 0.012, (zr + hl) / 2, W - 0.4, 0.015, Math.max(0.3, rearLen - 0.5));
    for (const s of [-1, 1]) ink(s * (W / 2 + 0.012), G + 0.45, (zf + zr) / 2, 0.02, 0.4, glen - 0.2);
    ink(0, roofY + 0.09, roofMid, W - 0.45, 0.08, 0.5);
    bx('red', -0.32, roofY + 0.17, roofMid, 0.5, 0.14, 0.3); bx('blue', 0.32, roofY + 0.17, roofMid, 0.5, 0.14, 0.3);
  }
  if (kind === 'ambulance' || kind === 'boxTruck' || kind === 'stepvan') {
    const z0 = zr + 0.06, len = hl - z0 - 0.01;
    const top = roofY + (kind === 'boxTruck' ? 0.15 : kind === 'stepvan' ? 0.05 : -0.05);
    const hgt = top - (belt - 0.1);
    bx(kind === 'boxTruck' ? 'white' : 'paint', 0, belt - 0.1 + hgt / 2, z0 + len / 2, W - 0.04, hgt, len);
    ink(0, belt - 0.1 + hgt / 2, hl + 0.005, W - 0.3, hgt - 0.3, 0.04);
    if (kind === 'ambulance') {
      for (const s of [-1, 1]) {
        bx('cross', s * (W / 2 + 0.01), belt + 0.3, z0 + len / 2, 0.02, 0.22, len - 0.1);
        bx('cross', s * (W / 2 + 0.012), belt + 0.9, z0 + len / 2, 0.02, 0.5, 0.14);
        bx('cross', s * (W / 2 + 0.012), belt + 0.9, z0 + len / 2, 0.02, 0.14, 0.5);
      }
      bx('red', -0.35, roofY + 0.12, roofMid, 0.5, 0.14, 0.28); bx('blue', 0.35, roofY + 0.12, roofMid, 0.5, 0.14, 0.28);
    }
    if (kind === 'stepvan') stripe(0, belt + 0.3, z0 + len / 2, W + 0.01, 0.2, len - 0.05);
  }
  if (kind === 'fire' || kind === 'ladder') {
    const z0 = zr + 0.05, len = hl - z0 - 0.05;
    paint(0, belt + 0.45, z0 + len / 2, W - 0.04, 0.95, len);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) ink(s * (W / 2 + 0.005), belt + 0.4, z0 + len * (0.2 + 0.3 * k), 0.02, 0.7, 0.03);
      stripe(s * (W / 2 + 0.012), belt + 0.8, z0 + len / 2, 0.02, 0.1, len);
      metal(s * (W / 2 - 0.12), belt + 0.96, z0 + len / 2, 0.05, 0.04, len);
    }
    bx('red', -0.35, roofY + 0.1, roofMid, 0.5, 0.14, 0.28); bx('blue', 0.35, roofY + 0.1, roofMid, 0.5, 0.14, 0.28);
    if (kind === 'fire') {
      for (const s of [-1, 1]) metal(s * 0.28, belt + 1.13, z0 + len / 2, 0.08, 0.1, len + 0.3);
      for (let i = 0; i < 6; i++) metal(0, belt + 1.13, z0 + 0.3 + i * (len / 6.3), 0.56, 0.05, 0.05);
    }
  }
  if (spec.category === 'bus') {
    ink(W / 2 - 0.01, belt + 0.55, zf + 0.9, 0.06, 1.2, 1.0);
    white(0, roofY + 0.09, roofMid, W - 0.7, 0.16, 1.4);
    bx('amber', 0, roofY - 0.3, zf + a + 0.01, W - 0.9, 0.16, 0.04);
    for (const s of [-1, 1]) stripe(s * (W / 2 + 0.01), cowlF - 0.14, 0, 0.02, 0.12, L - 0.4);
  }
  if (kind === 'minibus') ink(W / 2 - 0.01, belt + 0.5, zf + 0.7, 0.06, 1.0, 0.8);

  // ---- trim ----
  if (t.wing) { paint(0, deckY + 0.3, hl - 0.3, W * t.wing - 0.1, 0.07, 0.38); for (const s of [-1, 1]) paint(s * (W * 0.28), deckY + 0.14, hl - 0.3, 0.07, 0.3, 0.12); }
  if (t.bigWing) { for (const s of [-1, 1]) paint(s * (W / 2 - 0.2), deckY + 0.35, hl - 0.4, 0.07, 0.7, 0.4); paint(0, deckY + 0.7, hl - 0.4, W + 0.05, 0.07, 0.42); }
  if (t.lip) paint(0, deckY + 0.04, hl - 0.18, W - 0.4, 0.07, 0.34);
  if (t.scoop) {
    const sl = Math.min(1.1, (zf + hl) * 0.45);
    paint(0, hoodY + 0.045, zf - sl / 2 - 0.2, 0.55, 0.09, sl);
    ink(0, hoodY + 0.06, zf - sl - 0.19, 0.4, 0.05, 0.05);
  }
  const hoodRun = zf + hl - 0.5, hoodC = -hl + 0.5 + hoodRun / 2, trunkRun = hl - zr - 0.4, trunkC = zr + 0.05 + trunkRun / 2;
  const stripeXs = t.stripe === 'center' ? [0] : t.stripe === 'dual' ? [-0.35, 0.35] : [];
  const sw = t.stripe === 'center' ? 0.5 : 0.2;
  for (const x of stripeXs) {
    if (hoodRun > 0.2) stripe(x, hoodY + 0.012, hoodC, sw, 0.012, hoodRun);
    if (trunkRun > 0.2) stripe(x, deckY + 0.012, trunkC, sw, 0.012, trunkRun);
    if (!openTop) stripe(x, roofY + 0.03, roofMid, sw, 0.012, roofLen);
  }
  if (t.stripe === 'side') for (const s of [-1, 1]) stripe(s * (W / 2 + 0.012), G + 0.4, 0, 0.02, 0.16, L - 1.4);
  if (t.spare) { disc('ink', 0, belt - 0.05, hl + 0.14, 0.36, 0.22); disc('metal', 0, belt - 0.05, hl + 0.26, 0.16, 0.03); }
  if (t.bullbar || t.pushbar) {
    const z = -hl - 0.16;
    for (const s of [-1, 1]) metal(s * 0.5, 0.75, z, 0.07, 0.5, 0.07);
    metal(0, 0.9, z, 1.1, 0.07, 0.07); metal(0, 0.55, z, 1.1, 0.07, 0.07);
  }
  if (t.roofRack) {
    const y = roofY + 0.1, rl = Math.max(0.8, roofLen - 0.2);
    for (const s of [-1, 1]) metal(s * (W / 2 - 0.3), y, roofMid, 0.06, 0.06, rl);
    for (const f of [-0.4, 0, 0.4]) metal(0, y, roofMid + f * rl, W - 0.5, 0.05, 0.06);
  }
  if (t.roofBox) paint(0, roofY + 0.2, roofMid, W - 0.5, 0.35, Math.min(2.4, Math.max(0.8, roofLen - 0.2)));
  if (t.snorkel) ink(W / 2 - 0.08, belt + H * 0.55, zf - 0.02, 0.08, H * 0.9, 0.08);
  if (t.roofLights) for (const x of [-0.5, 0, 0.5]) white(x, roofY + 0.1, topF + 0.12, 0.18, 0.1, 0.06);
  if (t.mudflaps) for (const s of [-1, 1]) ink(s * (W / 2 - 0.05), 0.35, wheelZ + WR + 0.1, 0.3, 0.3, 0.06);
  if (t.chromeBumpers) { metal(0, 0.55, -hl - 0.1, W - 0.2, 0.16, 0.08); metal(0, 0.55, hl + 0.1, W - 0.2, 0.16, 0.08); }
  if (t.rollbar) { for (const s of [-1, 1]) ink(s * (W / 2 - 0.3), belt + 0.4, zr - 0.2, 0.09, 0.9, 0.09); ink(0, belt + 0.84, zr - 0.2, W - 0.5, 0.09, 0.09); }
  if (t.flatbed) {
    paint(0, 1.05, 1.7, W - 0.2, 0.12, 2.6);
    for (const s of [-1, 1]) metal(s * (W / 2 - 0.15), 1.5, 0.45, 0.08, 0.9, 0.08);
    metal(0, 1.85, 0.45, W - 0.3, 0.08, 0.08);
  }
  if (t.wrecker) {
    paint(0, 1.3, 1.2, 0.5, 0.25, 1.2); paint(0, 1.6, 1.9, 0.4, 0.25, 1.0); paint(0, 1.9, 2.5, 0.3, 0.25, 0.8);
    metal(0, 1.7, 2.85, 0.06, 0.5, 0.06); ink(0, 1.0, hl - 0.2, W - 0.4, 0.15, 0.5);
  }
  if (t.dumpBed) {
    ink(0, 1.0, 1.7, W - 0.2, 0.12, 2.6);
    for (const s of [-1, 1]) paint(s * (W / 2 - 0.1), 1.45, 1.7, 0.12, 0.8, 2.6);
    paint(0, 1.45, 0.45, W - 0.2, 0.8, 0.12); paint(0, 1.35, 2.95, W - 0.2, 0.6, 0.12);
  }
  if (t.tank) {
    P.add('white', C, 0, 1.6, 1.3, 0.85, 3.2, 0.85, Math.PI / 2);
    metal(0, 2.5, 1.3, 0.3, 0.06, 3.0);
    for (const z of [-0.2, 1.3, 2.8]) P.add('metal', C, 0, 1.6, z, 0.87, 0.06, 0.87, Math.PI / 2);
  }
  if (t.fifthWheel) { ink(0, 1.15, 1.2, 1.6, 0.1, 1.6); for (const s of [-1, 1]) metal(s * (W / 2 - 0.2), 0.9, 1.4, 0.3, 0.5, 1.2); }
  if (t.stacks) for (const s of [-1, 1]) P.add('metal', C, s * (W / 2 - 0.15), belt + 0.9, zr + 0.2, 0.09, 1.7, 0.09);
  if (t.ladderTop) {
    const y = roofY + 0.25, z0 = zf + 0.3, len = hl - 0.3 - z0;
    for (const s of [-1, 1]) metal(s * 0.28, y, z0 + len / 2, 0.08, 0.12, len);
    for (let z = z0 + 0.2; z < z0 + len; z += 0.55) metal(0, y, z, 0.5, 0.05, 0.06);
    metal(0, belt + 1.1, zr + 1.0, 1.2, 0.18, 1.0);
  }
  if (t.outriggers) for (const z of [zr + 0.5, hl - 0.7]) {
    metal(0, 0.62, z, W + 1.2, 0.12, 0.14);
    for (const s of [-1, 1]) metal(s * (W / 2 + 0.55), 0.35, z, 0.12, 0.6, 0.12);
  }
  if (t.lightbar === 'police') {
    ink(0, roofY + 0.09, roofMid, W - 0.45, 0.08, 0.5);
    bx('red', -0.32, roofY + 0.17, roofMid, 0.5, 0.14, 0.3); bx('blue', 0.32, roofY + 0.17, roofMid, 0.5, 0.14, 0.3);
  }
  if (t.lightbar === 'amber') bx('amber', 0, roofY + 0.17, roofMid, 1.0, 0.16, 0.3);

  // ---- wheel geometry (per side: outer face points outward) ----
  // Rounded primitives only (cylinders + spheres) — no boxes, so nothing reads as spiked.
  const style = VEHICLE_WHEELS[kind];
  const SPH = kit.geometry.sphere;
  const tireW = style === 'sport' ? 0.3 : style === 'offroad' ? 0.34 : style === 'dually' ? 0.3 : 0.24;
  const rimR = WR * (style === 'sport' ? 0.62 : style === 'offroad' ? 0.5 : 0.46);
  const wheels = {} as Model['wheels'];
  for (const s of [-1, 1] as const) {
    const WP = new Parts();
    // tyre barrel (rolling surface is already round)
    WP.add('tyre', C, 0, 0, 0, WR, tireW, WR, 0, 0, Math.PI / 2);
    // rounded shoulders: slightly smaller short barrels on each sidewall soften the edge
    for (const ss of [-1, 1]) WP.add('tyre', C, ss * tireW * 0.42, 0, 0, WR * 0.97, tireW * 0.22, WR * 0.97, 0, 0, Math.PI / 2);
    if (style === 'offroad') {
      // rounded tread knobs: squashed spheres in two staggered rows (no sharp lugs)
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        for (const ss of [-1, 1]) {
          const a2 = ang + (ss > 0 ? Math.PI / 12 : 0);
          WP.add('tyre', SPH, ss * tireW * 0.42, Math.cos(a2) * WR * 0.99, Math.sin(a2) * WR * 0.99, tireW * 0.28, 0.055, 0.11);
        }
      }
    }
    // rim disc
    WP.add('rim', C, s * 0.01, 0, 0, rimR, tireW + 0.02, rimR, 0, 0, Math.PI / 2);
    const fx = s * (tireW / 2 + 0.012);
    // round spokes: small cylinders pointing radially (axis Y rotated about X by ang)
    const roundSpokes = (n: number, r: number, len: number) => {
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2;
        WP.add('metal', C, fx, Math.cos(ang) * rimR * 0.52, Math.sin(ang) * rimR * 0.52, r, len, r, ang, 0, 0);
        // rounded spoke tip
        WP.add('metal', SPH, fx, Math.cos(ang) * rimR * 0.9, Math.sin(ang) * rimR * 0.9, r * 1.15, r * 1.15, r * 1.15);
      }
    };
    if (style === 'sport') roundSpokes(5, 0.05, rimR * 0.85);
    else if (style === 'touring') roundSpokes(7, 0.032, rimR * 0.85);
    else if (style === 'offroad') {
      roundSpokes(5, 0.055, rimR * 0.85);
      // beadlock ring around the rim lip
      WP.add('metal', C, fx - s * 0.01, 0, 0, rimR * 0.92, 0.035, rimR * 0.92, 0, 0, Math.PI / 2);
    } else if (style === 'steel') {
      // full steel disc: 5 round vent dimples (dark, inset) instead of spokes
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI * 2;
        WP.add('tyre', C, fx + s * 0.005, Math.cos(ang) * rimR * 0.58, Math.sin(ang) * rimR * 0.58, 0.075, 0.025, 0.075, 0, 0, Math.PI / 2);
      }
    } else { // dually: steel disc + 6 round lug cylinders around a big hub
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        WP.add('metal', C, fx, Math.cos(ang) * rimR * 0.62, Math.sin(ang) * rimR * 0.62, 0.035, 0.05, 0.035, 0, 0, Math.PI / 2);
      }
    }
    // hub barrel + domed cap (sphere = rounded, no flat spike)
    WP.add('metal', C, fx, 0, 0, rimR * 0.3, 0.04, rimR * 0.3, 0, 0, Math.PI / 2);
    WP.add('metal', SPH, fx + s * 0.02, 0, 0, rimR * 0.22, rimR * 0.14, rimR * 0.22);
    wheels[String(s) as '-1' | '1'] = WP.build();
  }

  const parts = P.build();
  const model: Model = {
    parts, wheels, wheelPos, WR, style, eye, steerPos, doors,
    dispose: () => {
      parts.forEach(g => g.dispose());
      (['-1', '1'] as const).forEach(k => wheels[k].forEach(g => g.dispose()));
    },
  };
  return model;
}

// ------------------------------------------------------------------------------------------------
// Public: one vehicle instance. Cheap — only meshes + materials, geometry is shared per kind.
// ------------------------------------------------------------------------------------------------
export function buildVehicle(kit: KitLike, kind: VehicleKind = 'car', variant = 0): VehicleParts {
  const model = cached(kit, `model:${kind}`, () => buildModel(kit, kind));
  const M = kit.materials;
  const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);

  const color = pickVehiclePaint(kind, variant);
  const paintMat = cached(kit, `paint:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
  const glassMat = cached(kit, 'glass', () => new THREE.MeshStandardMaterial({ color: 0x14202b, roughness: 0.06, metalness: 0.7 }));
  const lamp = (k: string, color: number, emissive: number) => cached(kit, `lamp:${k}`, () => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.2 }));
  const crossMat = cached(kit, 'cross', () => new THREE.MeshStandardMaterial({ color: 0xd00f0f, roughness: 0.5 }));
  const rimMat = (dark: boolean) => cached(kit, `rim:${dark}`, () => new THREE.MeshStandardMaterial({ color: dark ? 0x1e2126 : 0xb9bec6, roughness: 0.35, metalness: 0.8 }));
  const lum = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l;

  // per-vehicle lamp materials (so brake glow doesn't leak across cars)
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.4, emissive: 0xff1a1a, emissiveIntensity: 0.25 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf5f2df, roughness: 0.3, emissive: 0xfff6c9, emissiveIntensity: 0.35 });
  const blinkerMat = new THREE.MeshStandardMaterial({ color: 0x7a4a00, roughness: 0.4, emissive: 0xffa500, emissiveIntensity: 0.2 });
  kit.extra.push(brakeMat, headMat, blinkerMat);

  const roleMat: Record<string, THREE.Material> = {
    paint: paintMat, ink: M.ink, metal: M.metal, white: M.white, glass: glassMat, seat: M.wall2,
    accent: lum > 0.55 ? M.ink : M.white,
    red: lamp('red', 0xff2020, 0xff0000), blue: lamp('blue', 0x2040ff, 0x0022ff), amber: lamp('amber', 0xffa500, 0xff8800),
    cross: crossMat, head: headMat, brake: brakeMat, blink: blinkerMat,
  };
  let glazing!: THREE.Mesh;
  model.parts.forEach((geo, role) => {
    const mesh = new THREE.Mesh(geo, roleMat[role] ?? M.ink);
    mesh.castShadow = role !== 'glass'; mesh.receiveShadow = true;
    body.add(mesh);
    if (role === 'glass') glazing = mesh;
  });
  if (!glazing) { glazing = new THREE.Mesh(new THREE.BufferGeometry(), glassMat); glazing.visible = false; body.add(glazing); }

  // steering wheel
  const steeringWheel = new THREE.Group(); steeringWheel.position.copy(model.steerPos); steeringWheel.scale.setScalar(0.65); body.add(steeringWheel);
  const rimGeometry = cached(kit, 'steer-rim', () => new THREE.TorusGeometry(0.22, 0.027, 6, 16));
  steeringWheel.add(new THREE.Mesh(rimGeometry, M.ink));
  for (const [x, y, sx, sy] of [[0, 0, 0.4, 0.035], [0, -0.1, 0.035, 0.2]] as const) {
    const m = new THREE.Mesh(kit.geometry.box, M.metal); m.position.set(x, y, 0); m.scale.set(sx, sy, 0.035); steeringWheel.add(m);
  }

  // doors (WorldEngine swings these on enter / exit)
  const doors: THREE.Group[] = [];
  for (const d of model.doors) {
    const pivot = new THREE.Group(); pivot.position.set(d.x, d.y, d.z); body.add(pivot);
    const slab = new THREE.Mesh(kit.geometry.box, paintMat);
    slab.position.set(0, 0, d.dl / 2); slab.scale.set(0.07, d.dh, d.dl); slab.castShadow = true; pivot.add(slab);
    doors.push(pivot);
  }

  // wheels
  const spins: THREE.Object3D[] = []; const frontSteer: THREE.Group[] = [];
  const dark = model.style === 'sport' || model.style === 'offroad';
  for (const w of model.wheelPos) {
    const side = w.x < 0 ? '-1' : '1';
    const geos = model.wheels[side];
    const steer = new THREE.Group(); steer.position.set(w.x, model.WR + 0.08, w.z); group.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    geos.forEach((geo, role) => {
      const mesh = new THREE.Mesh(geo, role === 'tyre' ? M.ink : role === 'rim' ? rimMat(dark) : M.metal);
      mesh.castShadow = role === 'tyre'; spin.add(mesh);
    });
    spins.push(spin);
    if (w.front) frontSteer.push(steer);
  }

  const WR = model.WR;
  const vehicle: VehicleParts = { group, body, glazing, steeringWheel, eye: model.eye.clone(), spins, frontSteer, doors, brakeMat, headMat, blinkerMat, spin: 0,
    update: (speed, steer, dt, braking, bodyTilt, blinker = 0, time = 0) => {
      vehicle.spin += (speed * dt) / WR;
      for (const s of spins) s.rotation.x = vehicle.spin;
      for (const f of frontSteer) f.rotation.y = -steer * 0.55 / (1 + Math.abs(speed) / 24);
      steeringWheel.rotation.z = -steer * 2.4;
      brakeMat.emissiveIntensity = braking ? 2.2 : 0.25;
      const on = blinker !== 0 && (time % 0.62) < 0.31; // 0 off, 1 left, 2 right, 3 hazard
      blinkerMat.emissiveIntensity = on ? 2.4 : 0.15;
      if (bodyTilt) { body.rotation.x = bodyTilt.pitch; body.rotation.z = bodyTilt.roll; body.position.y = 0; }
    } };
  return vehicle;
}
