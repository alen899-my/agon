import { type VehicleKind } from './Vehicles';
import { buildVehicle } from './VehicleFactory';
import * as THREE from 'three';
import { BENCHES, BUILDINGS, FALLS, FREE_THROW_DIST, GAME_CENTER, GARDEN_STATUE, HARBOR_STATUE, HOOP, LAMPS, RACE_ARENA, RACE_SHOW_CARS, RACE_SLAB, RIM, ROADS, TABLE, TREES, seeded } from './Map';

type Shape = 'box' | 'sphere' | 'cylinder';
export type MaterialName = 'road' | 'pavement' | 'white' | 'ink' | 'glass' | 'metal' | 'wall0' | 'wall1' | 'wall2' | 'leaf' | 'lampGlow' | 'windowLit';

export interface GaitState { phase: number; intensity: number; airborne: boolean; dip: number; idle: number; cheer?: number }
export interface Stickman {
  group: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group;
  arms: THREE.Group[]; elbows: THREE.Group[]; legs: THREE.Group[]; knees: THREE.Group[]; feet: THREE.Mesh[];
  animate: (s: GaitState) => void;
}
export interface Vehicle {
  group: THREE.Group; body: THREE.Group; glazing: THREE.Mesh; steeringWheel: THREE.Group; eye: THREE.Vector3;
  spins: THREE.Object3D[]; frontSteer: THREE.Group[];
  doors: THREE.Group[];
  wipers: THREE.Group[];
  brakeMat: THREE.MeshStandardMaterial; headMat: THREE.MeshStandardMaterial;
  blinkerMat: THREE.MeshStandardMaterial;
  spin: number;
  update: (speed: number, steer: number, dt: number, braking: boolean, bodyTilt?: { pitch: number; roll: number }, blinker?: number, time?: number, wiper?: number | null) => void;
}

/** One asset kit. All copies share geometry/materials; static copies are GPU-instanced. */
export class AssetKit {
  readonly geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
  };
  readonly materials: Record<MaterialName, THREE.MeshStandardMaterial> = {
    road: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 }),
    pavement: new THREE.MeshStandardMaterial({ color: 0x9b9b9b, roughness: 1 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.7 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x414141, roughness: 0.25, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6, metalness: 0.3 }),
    wall0: new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.95 }),
    wall1: new THREE.MeshStandardMaterial({ color: 0xababab, roughness: 0.95 }),
    wall2: new THREE.MeshStandardMaterial({ color: 0x737373, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x626262, roughness: 1, flatShading: true }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff2d8, roughness: 0.5, emissive: 0xffb45e, emissiveIntensity: 0 }),
    windowLit: new THREE.MeshStandardMaterial({ color: 0x414141, roughness: 0.25, metalness: 0.35, emissive: 0xffc86e, emissiveIntensity: 0 }),
  };
  private batches = new Map<string, THREE.Matrix4[]>();
  private transform = new THREE.Object3D();
  readonly extra: { dispose: () => void }[] = [];

  stamp(shape: Shape, material: MaterialName, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): void {
    this.transform.position.set(x, y, z); this.transform.scale.set(sx, sy, sz); this.transform.rotation.set(0, yaw, 0);
    this.transform.updateMatrix();
    const key = `${shape}:${material}`;
    if (!this.batches.has(key)) this.batches.set(key, []);
    this.batches.get(key)!.push(this.transform.matrix.clone());
  }
  flush(scene: THREE.Scene): void {
    for (const [key, matrices] of this.batches) {
      const [shape, material] = key.split(':') as [Shape, MaterialName];
      const mesh = new THREE.InstancedMesh(this.geometry[shape], this.materials[material], matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = !['road', 'pavement', 'glass'].includes(material); mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); scene.add(mesh);
    }
    this.batches.clear();
  }
  mesh(parent: THREE.Object3D, shape: Shape, material: MaterialName, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry[shape], this.materials[material]);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  sign(scene: THREE.Scene, text: string, x: number, y: number, z: number, width: number, yaw = 0): void {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = '#ffffff'; ctx.font = '600 84px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 100, 960);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture }); const geometry = new THREE.PlaneGeometry(width, width * 96 / 512);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = yaw; scene.add(mesh);
    this.extra.push(texture, material, geometry);
  }
  stickman(player = false, variation = 0): Stickman {
    const group = new THREE.Group(); const material: MaterialName = player ? 'ink' : variation % 3 === 0 ? 'wall2' : variation % 3 === 1 ? 'ink' : 'wall1';
    // Hips root -> pelvis, torso chain, jointed arms/legs with knees + elbows.
    const hips = new THREE.Group(); hips.position.set(0, 0.95, 0); group.add(hips);
    this.mesh(hips, 'cylinder', material, 0, 0.02, 0, 0.16, 0.22, 0.13);
    const torso = new THREE.Group(); torso.position.set(0, 0.08, 0); hips.add(torso);
    this.mesh(torso, 'cylinder', material, 0, 0.32, 0, 0.17, 0.6, 0.13);
    const head = new THREE.Group(); head.position.set(0, 0.62, 0); torso.add(head);
    this.mesh(head, 'cylinder', material, 0, 0.04, 0, 0.06, 0.12, 0.06);
    this.mesh(head, 'sphere', material, 0, 0.24, 0, 0.23, 0.26, 0.23);
    const arms: THREE.Group[] = [], elbows: THREE.Group[] = [], legs: THREE.Group[] = [], knees: THREE.Group[] = [], feet: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.235, 0.52, 0); torso.add(shoulder); arms.push(shoulder);
      this.mesh(shoulder, 'cylinder', material, 0, -0.15, 0, 0.06, 0.3, 0.06);
      const elbow = new THREE.Group(); elbow.position.set(0, -0.3, 0); shoulder.add(elbow); elbows.push(elbow);
      this.mesh(elbow, 'cylinder', material, 0, -0.14, 0, 0.055, 0.28, 0.055);
      this.mesh(elbow, 'sphere', material, 0, -0.3, 0, 0.07, 0.09, 0.07);
      const hip = new THREE.Group(); hip.position.set(side * 0.11, -0.02, 0); hips.add(hip); legs.push(hip);
      this.mesh(hip, 'cylinder', material, 0, -0.21, 0, 0.075, 0.42, 0.075);
      const knee = new THREE.Group(); knee.position.set(0, -0.44, 0); hip.add(knee); knees.push(knee);
      this.mesh(knee, 'cylinder', material, 0, -0.2, 0, 0.065, 0.4, 0.065);
      const foot = this.mesh(knee, 'box', material, 0, -0.42, -0.06, 0.14, 0.09, 0.28); feet.push(foot);
    }
    if (player) {
      this.mesh(torso, 'box', 'white', 0, 0.35, -0.075, 0.2, 0.3, 0.02);
      this.mesh(head, 'box', 'white', 0, 0.38, -0.08, 0.26, 0.05, 0.18);
    }
    return { group, hips, torso, head, arms, elbows, legs, knees, feet, animate: s => {
      const I = Math.max(0, Math.min(1.2, s.intensity));
      hips.position.y = 0.95 - s.dip * 0.09;
      if (s.airborne) {
        // Jump pose: front knee up, back leg trails, arms out for balance.
        legs[0].rotation.x = -0.55; knees[0].rotation.x = 0.95; feet[0].rotation.x = 0.3;
        legs[1].rotation.x = 0.38; knees[1].rotation.x = 0.5; feet[1].rotation.x = -0.2;
        arms[0].rotation.set(0.15, 0, -0.6); arms[1].rotation.set(0.15, 0, 0.6);
        elbows[0].rotation.x = -0.45; elbows[1].rotation.x = -0.45;
        torso.rotation.set(0.12, 0, 0); head.rotation.set(-0.1, 0, 0);
        return;
      }
      if (s.cheer && s.cheer > 0) {
        const C = Math.min(1.2, s.cheer);
        // Cheering crowd: excited vertical bounce / jump, raised arms waving overhead, head looking up!
        const hop = Math.abs(Math.sin(s.phase * 2.4));
        hips.position.y = 0.95 + hop * 0.14 * C;
        legs[0].rotation.set(-0.18 * hop * C, 0, 0);
        legs[1].rotation.set(-0.18 * hop * C, 0, 0);
        knees[0].rotation.set(0.38 * hop * C, 0, 0);
        knees[1].rotation.set(0.38 * hop * C, 0, 0);
        feet[0].rotation.set(-0.18 * hop * C, 0, 0);
        feet[1].rotation.set(-0.18 * hop * C, 0, 0);
        const w0 = Math.sin(s.phase * 3.4);
        const w1 = Math.cos(s.phase * 3.4 + 0.5);
        arms[0].rotation.set(-2.45 - w0 * 0.32 * C, 0, -0.42 - w1 * 0.22 * C);
        arms[1].rotation.set(-2.45 + w1 * 0.32 * C, 0, 0.42 + w0 * 0.22 * C);
        elbows[0].rotation.set(0.55 + w0 * 0.25 * C, 0, 0);
        elbows[1].rotation.set(0.55 - w1 * 0.25 * C, 0, 0);
        torso.rotation.set(-0.12 + w0 * 0.06 * C, w1 * 0.08 * C, 0);
        head.rotation.set(-0.3 + w0 * 0.08 * C, w1 * 0.1 * C, 0);
        torso.scale.y = 1; hips.rotation.y = 0;
        return;
      }
      const sw0 = Math.sin(s.phase), sw1 = Math.sin(s.phase + Math.PI);
      const moving = I > 0.03;
      // Thigh swing + knee flexion on the passing leg + foot compensation.
      legs[0].rotation.x = sw0 * 0.6 * I; legs[1].rotation.x = sw1 * 0.6 * I;
      const k0 = (0.08 + Math.max(0, Math.sin(s.phase + Math.PI / 2)) * 0.85) * I + s.dip * 0.6;
      const k1 = (0.08 + Math.max(0, Math.sin(s.phase + Math.PI * 1.5)) * 0.85) * I + s.dip * 0.6;
      knees[0].rotation.x = k0; knees[1].rotation.x = k1;
      feet[0].rotation.x = -(legs[0].rotation.x + k0) * 0.55; feet[1].rotation.x = -(legs[1].rotation.x + k1) * 0.55;
      // Counter-swing arms with soft elbows.
      arms[0].rotation.set(sw1 * 0.45 * I, 0, -0.04); arms[1].rotation.set(sw0 * 0.45 * I, 0, 0.04);
      elbows[0].rotation.x = -(0.25 + 0.3 * I); elbows[1].rotation.x = -(0.25 + 0.3 * I);
      // Torso lean + counter-rotation, head stabilizes the gaze.
      torso.rotation.set(0.05 + 0.09 * I + s.dip * 0.12, sw0 * 0.07 * I, 0);
      head.rotation.set(-(0.05 + 0.09 * I) * 0.8, -sw0 * 0.04 * I, 0);
      if (!moving) {
        // Idle: breathing, weight sway, relaxed arms.
        const breath = Math.sin(s.idle * 2.2) * 0.5 + 0.5;
        torso.scale.y = 1 + breath * 0.008;
        hips.rotation.y = Math.sin(s.idle * 0.6) * 0.03;
        arms[0].rotation.x = Math.sin(s.idle * 1.7) * 0.03; arms[1].rotation.x = Math.sin(s.idle * 1.7 + 1) * 0.03;
      } else { torso.scale.y = 1; hips.rotation.y = 0; }
    } };
  }
  car(kind: VehicleKind = 'car', _dark = false, variant = 0): Vehicle {
    return buildVehicle(this, kind, variant);
  }
  dispose(): void {
    Object.values(this.geometry).forEach(g => g.dispose()); Object.values(this.materials).forEach(m => m.dispose()); this.extra.forEach(item => item.dispose());
  }
}

export function buildMap(scene: THREE.Scene, kit: AssetKit): void {
  const box = (material: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => kit.stamp('box', material, x, y, z, w, h, d);
  box('pavement', 0, -0.3, 0, 350, 0.5, 350);
  for (const road of ROADS) {
    box('road', road, -0.025, 0, 17, 0.08, 342); box('road', 0, -0.025, road, 342, 0.08, 17);
    for (let v = -164; v <= 164; v += 7) {
      if (ROADS.every(r => Math.abs(r - v) > 12)) {
        box('white', road, 0.025, v, 0.12, 0.015, 2.6); box('white', v, 0.025, road, 2.6, 0.015, 0.12);
      }
    }
    for (const cross of ROADS) for (const side of [-1, 1]) for (let i = -3; i <= 3; i++) {
      box('white', road + i * 1.8, 0.035, cross + side * 11, 1, 0.02, 3.4);
      box('white', road + side * 11, 0.035, cross + i * 1.8, 3.4, 0.02, 1);
    }
    for (const side of [-1, 1]) {
      box('white', road + side * 9, 0.035, 0, 0.25, 0.18, 340);
      box('white', 0, 0.035, road + side * 9, 340, 0.18, 0.25);
    }
  }
  for (const b of BUILDINGS) {
    const material = `wall${b.shade}` as MaterialName;
    box(material, b.x, b.h / 2, b.z, b.w, b.h, b.d);
    box('white', b.x, b.h + 0.15, b.z, b.w + 0.5, 0.3, b.d + 0.5);
    box('ink', b.x, 0.45, b.z, b.w + 0.2, 0.9, b.d + 0.2);
    box('metal', b.x - b.w * 0.22, b.h + 0.65, b.z, 2.8, 1, 2.3);
    for (const side of [-1, 1]) {
      let row = 0;
      for (let y = 3.6; y < b.h - 1; y += 3.7, row++) {
        let col = 0;
        for (let x = -b.w / 2 + 2.5; x < b.w / 2 - 1.5; x += 3.8, col++) {
          // Sample ~1/3 of windows into the lit-window material so nights glow.
          const lit = (col + row + (side > 0 ? 1 : 0)) % 3 === 0;
          box(lit ? 'windowLit' : 'glass', b.x + x, y, b.z + side * (b.d / 2 + 0.035), 1.7, 2, 0.08);
          box('white', b.x + x, y - 1.05, b.z + side * (b.d / 2 + 0.15), 1.95, 0.12, 0.35);
        }
        let col2 = 0;
        for (let z = -b.d / 2 + 2.5; z < b.d / 2 - 1.5; z += 3.8, col2++) {
          const lit = (col2 + row) % 3 === 0;
          box(lit ? 'windowLit' : 'glass', b.x + side * (b.w / 2 + 0.035), y, b.z + z, 0.08, 2, 1.7);
        }
      }
    }
    box('glass', b.x, 1.5, b.z + b.d / 2 + 0.08, 2.4, 3, 0.12);
    if (b.name) {
      kit.sign(scene, b.name, b.x, b.kind === 'shop' ? 5.5 : b.h - 1.5, b.z + b.d / 2 + 0.2, Math.min(b.w - 2, 11));
      if (b.kind === 'shop') box('ink', b.x, 4, b.z + b.d / 2 + 1, b.w + 0.8, 0.22, 2);
    }
  }
  // Plaza: pavers, a sculptural landmark, benches, and lamps.
  box('white', -27, 0.025, 23, 38, 0.1, 25);
  kit.stamp('cylinder', 'metal', -27, 0.5, 23, 2.8, 1, 2.8);
  kit.stamp('box', 'ink', -27, 3.5, 23, 1.4, 5, 1.4, Math.PI / 4);
  kit.stamp('sphere', 'white', -27, 6.4, 23, 1.4, 1.4, 1.4);
  // Park paths and a dry fountain use the same geometry library.
  box('leaf', 41, 0.025, -49, 32, 0.06, 31);
  box('pavement', 41, 0.075, -49, 4, 0.05, 31); box('pavement', 41, 0.075, -49, 32, 0.05, 4);
  kit.stamp('cylinder', 'white', 43, 0.4, -48, 3.5, 0.8, 3.5);
  kit.stamp('cylinder', 'glass', 43, 0.81, -48, 2.8, 0.03, 2.8);
  const rng = seeded(42);
  // Trees, benches, lamps render from Map data so visuals match colliders.
  for (const [x, z] of TREES) {
    kit.stamp('cylinder', 'ink', x, 1.6, z, 0.22, 3.2, 0.22);
    kit.stamp('sphere', 'leaf', x, 4 + rng(), z, 2, 2.5, 2);
  }
  for (const [x, z] of BENCHES) {
    box('ink', x, 0.55, z, 3, 0.18, 0.8); box('metal', x, 1.05, z + 0.35, 3, 0.85, 0.12);
    for (const offset of [-1, 1]) box('metal', x + offset, 0.25, z, 0.12, 0.5, 0.6);
  }
  for (const lamp of LAMPS) {
    const x = lamp.x, z = lamp.z;
    kit.stamp('cylinder', 'ink', x, 3.1, z, 0.1, 6.2, 0.1);
    box('ink', x + (x < 0 ? 0.7 : -0.7), 6.2, z, 1.6, 0.15, 0.15);
    box('lampGlow', x + (x < 0 ? 1.4 : -1.4), 6.1, z, 0.6, 0.12, 0.4);
  }
  // Station canopy and visible parallel rail tracks.
  box('metal', 42, 4.3, 62, 28, 0.35, 7);
  for (const x of [30, 42, 54]) box('ink', x, 2.1, 62, 0.22, 4.2, 0.22);
  for (const z of [68, 70]) box('ink', 40, 0.03, z, 53, 0.08, 0.15);
  for (let x = 15; x < 67; x += 1.6) box('metal', x, 0.01, 69, 0.2, 0.08, 3.4);
  for (const [x, z] of [[-30, 68], [-44, 68], [-60, 68]]) {
    box('wall1', x, 1.5, z, 10, 3, 4); box('white', x, 3.05, z, 10.1, 0.1, 4.1);
  }
  for (const x of [-166, 166]) box('metal', x, 0.55, 0, 0.3, 1.1, 332);
  for (const z of [-166, 166]) box('metal', 0, 0.55, z, 332, 1.1, 0.3);
  buildGameCenter(scene, kit, box);
  buildBasketballCourt(scene, kit, box);
  buildRaceArena(scene, kit, box);
  buildHarbor(scene, kit, box);
  buildGarden(scene, kit, box);
  kit.flush(scene);
}

/** Movie Street Racing Arena: Tokyo-drift underground meetup.
 *  Heavy overhead steel truss gantry with LED countdown tree and neon signs,
 *  8-car painted staging grid with tire burnout skid marks, concrete Jersey barriers
 *  with hazard chevrons, spectator tubular safety rails, tire walls, mobile stadium
 *  floodlights, and tuned underglow for showcase cars. (Tables completely removed). */
export function buildRaceArena(scene: THREE.Scene, kit: AssetKit, box?: (m: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => void): void {
  const ax = RACE_ARENA.x;
  const az = RACE_ARENA.z;
  const put = box ?? ((m, x, y, z, w, h, d) => kit.stamp('box', m, x, y, z, w, h, d));

  // 1. Foundation & Fresh Asphalt Pad (matches RACE_SLAB in Map)
  put('wall2', ax, 0.03, az, RACE_SLAB.w, 0.08, RACE_SLAB.d);
  put('road', ax, 0.065, az, RACE_SLAB.w - 1.6, 0.065, RACE_SLAB.d - 1.6);

  // 2. Checkered Start / Finish Line spanning the south entrance (az - 9.8)
  for (let i = -6; i <= 6; i += 1.0) {
    const isWhite = Math.abs(Math.round(i)) % 2 === 0;
    put(isWhite ? 'white' : 'ink', ax + i, 0.09, az - 9.8, 0.96, 0.008, 0.96);
  }

  // 3. Staging Grid Boxes for 8 cars (2 columns of 4 slots) with white/yellow borders
  for (let row = 0; row < 4; row++) {
    const rz = az - 6.2 + row * 4.2;
    for (const col of [-1, 1]) {
      const rx = ax + col * 5.4;
      // Longitudinal boundary lines
      put('white', rx - 1.45, 0.085, rz, 0.1, 0.008, 3.4);
      put('white', rx + 1.45, 0.085, rz, 0.1, 0.008, 3.4);
      // Lateral boundary lines
      put('white', rx, 0.085, rz - 1.7, 3.0, 0.008, 0.1);
      put('white', rx, 0.085, rz + 1.7, 3.0, 0.008, 0.1);
      // Staging stop bar
      put('white', rx, 0.09, rz - 1.3, 1.8, 0.01, 0.22);
    }
  }

  // 4. Burnout rubber skid marks & drift arcs stamped into the asphalt
  for (const col of [-1, 1]) {
    // Hard acceleration dual skid marks launching from the grid
    put('ink', ax + col * 4.8, 0.08, az + 1, 0.28, 0.005, 14);
    put('ink', ax + col * 6.0, 0.08, az + 1, 0.28, 0.005, 14);
  }
  // Drift arc skid marks on the turn entry
  kit.stamp('box', 'ink', ax - 8, 0.08, az + 4, 0.45, 0.005, 7.5, 0.45);
  kit.stamp('box', 'ink', ax + 8, 0.08, az + 4, 0.45, 0.005, 7.5, -0.45);
  // Donut burnout circle in the drift zone
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    kit.stamp('box', 'ink', ax + Math.cos(ang) * 4.2, 0.08, az + Math.sin(ang) * 4.2, 0.35, 0.005, 3.2, ang + Math.PI / 2);
  }

  // 5. Entrance Gantry (West entrance across road at x = ax - 16, spanning across z = 80 road)
  const ex = ax - 16;
  // South & North sidewalk support pillars (positioned off-road on sidewalks z=69.8 and z=90.2)
  for (const pz of [69.8, 90.2]) {
    put('ink', ex, 3.4, pz, 0.6, 6.8, 0.6);
    put('metal', ex, 1.8, pz, 0.8, 3.6, 0.8);
  }
  // Overhead steel truss chords spanning ACROSS the road (6.7m clear height)
  put('ink', ex, 6.7, 80, 0.45, 0.4, 20.8);
  put('ink', ex, 5.6, 80, 0.35, 0.3, 20.4);
  for (let tz = -8; tz <= 8; tz += 2) put('metal', ex, 6.15, 80 + tz, 0.12, 0.95, 0.12);

  // Suspended LED Countdown Light Tree over the road centerline (z = 80)
  put('ink', ex, 4.85, 80, 0.4, 1.4, 0.55);
  for (const fx of [ex - 0.22, ex + 0.22]) {
    put('wall1', fx, 5.3, 80, 0.05, 0.22, 0.22); // Stage 1 Red
    put('wall1', fx, 5.0, 80, 0.05, 0.22, 0.22); // Stage 2 Red
    put('wall0', fx, 4.7, 80, 0.05, 0.22, 0.22); // Stage 3 Amber
    put('white', fx, 4.4, 80, 0.05, 0.26, 0.26); // Launch Green
  }

  // Overhead Entrance Neon Signs spanning across the road
  // Facing eastbound traffic entering the speed arena
  kit.sign(scene, '★ TOKYO SPEED ARENA · UNDERGROUND ★', ex - 0.26, 6.35, 80, 14, -Math.PI / 2);
  // Facing westbound traffic looking back
  kit.sign(scene, '★ TOKYO SPEED ARENA · ENTRANCE ★', ex + 0.26, 6.35, 80, 14, Math.PI / 2);

  // Checkered Start Line stamped across the road underneath the entrance gantry
  for (let z = 73.0; z <= 87.0; z += 1.0) {
    const isWhite = Math.abs(Math.round(z)) % 2 === 0;
    put(isWhite ? 'white' : 'ink', ex + 1.2, 0.085, z, 0.96, 0.008, 0.96);
  }

  // 6. Exit Gantry (East exit across road at x = ax + 16, spanning across z = 80 road)
  const ox = ax + 16;
  // South & North sidewalk support pillars (positioned off-road on sidewalks z=69.8 and z=90.2)
  for (const pz of [69.8, 90.2]) {
    put('ink', ox, 3.4, pz, 0.6, 6.8, 0.6);
    put('metal', ox, 1.8, pz, 0.8, 3.6, 0.8);
  }
  // Overhead steel truss chords spanning ACROSS the road (6.7m clear height)
  put('ink', ox, 6.7, 80, 0.45, 0.4, 20.8);
  put('ink', ox, 5.6, 80, 0.35, 0.3, 20.4);
  for (let tz = -8; tz <= 8; tz += 2) put('metal', ox, 6.15, 80 + tz, 0.12, 0.95, 0.12);

  // Overhead Exit Neon Signs spanning across the road
  // Facing eastbound traffic approaching the exit
  kit.sign(scene, '★ STREET KINGS MEET · SPEED ARENA ★', ox - 0.26, 6.35, 80, 14, -Math.PI / 2);
  // Facing westbound traffic entering from east
  kit.sign(scene, '★ STREET KINGS MEET · ENTRANCE ★', ox + 0.26, 6.35, 80, 14, Math.PI / 2);

  // Checkered Finish Line stamped across the road underneath the exit gantry
  for (let z = 73.0; z <= 87.0; z += 1.0) {
    const isWhite = Math.abs(Math.round(z)) % 2 === 0;
    put(isWhite ? 'white' : 'ink', ox - 1.2, 0.085, z, 0.96, 0.008, 0.96);
  }

  // 7. Mobile Stadium Floodlight Towers (Set back at northern corners, fully clear of roads)
  for (const [fx, fz] of [[-20.5, 9.2], [20.5, 9.2]] as const) {
    put('metal', ax + fx, 0.4, az + fz, 1.6, 0.8, 1.2);
    put('metal', ax + fx, 4.2, az + fz, 0.2, 7.4, 0.2);
    put('ink', ax + fx, 7.8, az + fz, 1.8, 0.8, 0.35);
    put('lampGlow', ax + fx, 7.8, az + fz - 0.15, 1.6, 0.6, 0.08);
  }

  // 8. Multi-Tiered Corner Tire Stacks tucked safely at the northern back corners
  const rng = seeded(999);
  for (const [cx, cz] of [[-19.5, 8.8], [19.5, 8.8]] as const) {
    const tx = ax + cx + rng() * 0.3, tz = az + cz + rng() * 0.3;
    for (let s = 0; s < 3; s++) kit.stamp('cylinder', 'ink', tx, 0.22 + s * 0.44, tz, 0.55, 0.42, 0.55);
    for (let s = 0; s < 3; s++) kit.stamp('cylinder', 'ink', tx + 0.85, 0.22 + s * 0.44, tz, 0.55, 0.42, 0.55);
  }

  // 9. Tuned Neon Underglow Lighting Mats beneath Showcase Cars
  const underglowColors = [0x00f5d4, 0xff007f, 0x70e000, 0xffbe0b, 0x3a86ff, 0xff5400];
  RACE_SHOW_CARS.forEach((car, i) => {
    const glowGeo = new THREE.PlaneGeometry(2.3, 4.4);
    const glowMat = new THREE.MeshBasicMaterial({
      color: underglowColors[i % underglowColors.length],
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.set(car.x, 0.082, car.z);
    glowMesh.rotation.z = car.yaw;
    scene.add(glowMesh);
  });
}

/** Basketball side court north of the table hall. Rim at HOOP, shooter ~4.2m south. */
export function buildBasketballCourt(scene: THREE.Scene, kit: AssetKit, box?: (m: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => void): void {
  const hx = HOOP.x, hz = HOOP.z;
  const put = box ?? ((m, x, y, z, w, h, d) => kit.stamp('box', m, x, y, z, w, h, d));
  const cx = hx, cz = hz - 5.2; // court center
  // Asphalt slab + border.
  put('white', cx, 0.03, cz, 11, 0.08, 13);
  put('road', cx, 0.06, cz, 10.2, 0.06, 12.2);
  const ly = 0.1;
  const line = (x: number, z: number, w: number, d: number) => put('white', x, ly, z, w, 0.012, d);
  // Border rect (10.2 x 12.2).
  line(cx, cz - 6.1 + 0.05, 10.2, 0.1); line(cx, cz + 6.1 - 0.05, 10.2, 0.1);
  line(cx - 5.1 + 0.05, cz, 0.1, 12.2); line(cx + 5.1 - 0.05, cz, 0.1, 12.2);
  // Painted key: 4.9 wide from baseline (hz+1) to free-throw line (hz-4.2).
  const base = hz + 1, ft = hz - FREE_THROW_DIST;
  line(cx - 2.45, (base + ft) / 2, 0.1, base - ft); line(cx + 2.45, (base + ft) / 2, 0.1, base - ft);
  line(cx, base - 0.05, 5.0, 0.1);
  // Free-throw line + shooter mark.
  line(cx, ft, 5.0, 0.12);
  line(cx, ft - 0.5, 0.3, 0.3);
  // Three-point arc (radius 6.25 from rim) approximated with segments.
  const R = 6.25;
  let prevA = -1.1;
  for (let i = 1; i <= 10; i++) {
    const a = -1.1 + (2.2 * i) / 10;
    const x1 = hx + Math.sin(prevA) * R, z1 = hz - Math.cos(prevA) * R;
    const x2 = hx + Math.sin(a) * R, z2 = hz - Math.cos(a) * R;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    kit.stamp('box', 'white', mx, ly, mz, 0.1, 0.012, len, yaw);
    prevA = a;
  }
  // Stanchion pole + arm + backboard (rim itself is dynamic in WorldEngine for shake).
  put('ink', hx, 1.95, hz + 0.9, 0.35, 3.9, 0.35);
  put('metal', hx, 3.6, hz + 0.62, 0.18, 0.18, 0.6);
  put('white', hx, (RIM.boardBottom + RIM.boardBottom + RIM.boardH) / 2, hz + RIM.boardZ, RIM.boardW, RIM.boardH, 0.08);
  // Board inner square.
  line(hx, hz + RIM.boardZ - 0.06, 0.7, 0.05);
  kit.sign(scene, 'HOOPS · FREE THROW', hx + 4.2, 2.2, hz + 2.5, 7, -Math.PI / 2);
}

/** East Harbor: cascade waterfall + anchor-plaza statue. All static instanced
 *  geometry sharing the global palette — zero per-frame cost. */
export function buildHarbor(scene: THREE.Scene, kit: AssetKit, box?: (m: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => void): void {
  const put = box ?? ((m, x, y, z, w, h, d) => kit.stamp('box', m, x, y, z, w, h, d));
  const fx = FALLS.x, fz = FALLS.z;
  // Rock cliff the water pours over (north face of the basin).
  put('wall2', fx, 1.5, fz - 4.2, 9, 3, 1.6);
  put('wall2', fx, 3.4, fz - 4.4, 7, 2.4, 1.3);
  put('wall1', fx, 5.0, fz - 4.5, 5, 1.8, 1.1);
  for (const [rx, rw] of [[-5.2, 2.2], [5.2, 2.2]] as const) put('wall2', fx + rx, 1.0, fz - 4.0, rw, 2.0, 1.8);
  // Falling sheet + foam streaks + lip.
  put('glass', fx, 2.7, fz - 3.35, 4.6, 4.6, 0.22);
  for (const sx of [-1.5, 0, 1.5]) put('white', fx + sx, 1.6, fz - 3.2, 0.7, 2.6, 0.26);
  put('white', fx, 0.75, fz - 2.6, 5.2, 0.3, 1.4);
  // Basin ring + still water.
  kit.stamp('cylinder', 'white', fx, 0.25, fz, 3.7, 0.5, 3.7);
  kit.stamp('cylinder', 'glass', fx, 0.52, fz, 3.15, 0.28, 3.15);
  for (const [ox, oz] of [[-2.4, 1.8], [2.4, 1.8], [-2.4, -1.8], [2.4, -1.8]] as const) {
    put('white', fx + ox, 0.62, fz + oz, 1.1, 0.12, 1.1);
  }
  kit.sign(scene, 'HARBOR FALLS', fx - 6.5, 2.4, fz + 1.5, 8, Math.PI / 2);
  // Anchor plaza: slab + pedestal + column + orb, west of the piers.
  const sx = HARBOR_STATUE.x, sz = HARBOR_STATUE.z;
  put('white', sx, 0.03, sz, 8, 0.08, 8);
  put('pavement', sx, 0.075, sz, 6.4, 0.05, 6.4);
  put('white', sx, 0.7, sz, 2.2, 1.2, 2.2);
  kit.stamp('cylinder', 'ink', sx, 2.7, sz, 0.55, 3.0, 0.55);
  kit.stamp('sphere', 'metal', sx, 4.9, sz, 1.0, 1.0, 1.0);
  kit.sign(scene, 'ANCHOR PLAZA', sx, 3.1, sz + 4.3, 7, Math.PI);
}

/** Heights Garden: statue circle with lawn, saplings, and night lamps. */
export function buildGarden(scene: THREE.Scene, kit: AssetKit, box?: (m: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => void): void {
  const put = box ?? ((m, x, y, z, w, h, d) => kit.stamp('box', m, x, y, z, w, h, d));
  const gx = GARDEN_STATUE.x, gz = GARDEN_STATUE.z;
  put('white', gx, 0.03, gz, 12, 0.08, 12);
  put('leaf', gx, 0.07, gz, 8.4, 0.05, 8.4);
  put('pavement', gx, 0.09, gz, 3.2, 0.04, 3.2);
  put('wall1', gx, 0.7, gz, 2.0, 1.2, 2.0);
  kit.stamp('cylinder', 'white', gx, 2.6, gz, 0.5, 2.8, 0.5);
  kit.stamp('sphere', 'ink', gx, 4.7, gz, 0.95, 0.95, 0.95);
  // Saplings ring the lawn (visual only; colliders live in Map TREES).
  const rng = seeded(2024);
  for (const [ox, oz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]] as const) {
    kit.stamp('cylinder', 'ink', gx + ox, 0.9, gz + oz, 0.12, 1.8, 0.12);
    kit.stamp('sphere', 'leaf', gx + ox, 2.2 + rng() * 0.4, gz + oz, 1.1, 1.3, 1.1);
  }
  // Twin lamps so the garden glows at night.
  for (const ox of [-6, 6]) {
    kit.stamp('cylinder', 'ink', gx + ox, 2.2, gz, 0.09, 4.4, 0.09);
    put('lampGlow', gx + ox, 4.35, gz, 0.55, 0.16, 0.4);
  }
  kit.sign(scene, 'HEIGHTS GARDEN', gx, 3.0, gz + 6.3, 8, Math.PI);
}export function buildGameCenter(scene: THREE.Scene, kit: AssetKit, box?: (m: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => void): void {
  const gx = GAME_CENTER.x, gz = GAME_CENTER.z;
  const put = box ?? ((m, x, y, z, w, h, d) => kit.stamp('box', m, x, y, z, w, h, d));
  // Court apron + surrounding pad.
  put('white', gx, 0.03, gz, 11, 0.08, 9);
  put('glass', gx, 0.06, gz, 8.4, 0.06, 6.6);
  // Table top: length (2.74) runs along play axis Z, width (1.525) across X.
  // NOTE: TABLE.w = width (X), TABLE.d = length (Z) — matches the physics in TableTennis.ts.
  put('wall2', gx, TABLE.h - 0.03, gz, TABLE.w, 0.06, TABLE.d);
  // White edge lines + center line (along play axis Z).
  const ly = TABLE.h + 0.005;
  put('white', gx - TABLE.w / 2 + 0.02, ly, gz, 0.04, 0.012, TABLE.d);
  put('white', gx + TABLE.w / 2 - 0.02, ly, gz, 0.04, 0.012, TABLE.d);
  put('white', gx, ly, gz - TABLE.d / 2 + 0.02, TABLE.w, 0.012, 0.04);
  put('white', gx, ly, gz + TABLE.d / 2 - 0.02, TABLE.w, 0.012, 0.04);
  put('white', gx, ly, gz, 0.025, 0.012, TABLE.d);
  // Legs + undercarriage.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put('ink', gx + sx * (TABLE.w / 2 - 0.2), TABLE.h / 2 - 0.05, gz + sz * (TABLE.d / 2 - 0.3), 0.09, TABLE.h - 0.1, 0.09);
  }
  put('metal', gx, TABLE.h - 0.12, gz, TABLE.w - 0.3, 0.06, TABLE.d - 0.4);
  // Net: spans 1.83m across X at z=gz, 15.25cm above table.
  const netTop = TABLE.h + TABLE.netH;
  put('ink', gx, TABLE.h + TABLE.netH / 2, gz, 1.83, TABLE.netH, 0.02);
  put('white', gx, netTop + 0.008, gz, 1.83, 0.016, 0.03);
  for (const sx of [-1, 1]) put('metal', gx + sx * 0.915, TABLE.h + TABLE.netH / 2, gz, 0.03, TABLE.netH + 0.06, 0.03);
  // Low barriers around court (visual only, walk-through).
  for (const [bx, bz, w, d] of [[gx, gz - 4.2, 9, 0.15], [gx, gz + 4.2, 9, 0.15], [gx - 5, gz, 0.15, 8.4], [gx + 5, gz, 0.15, 8.4]] as const) {
    put('wall1', bx, 0.45, bz, w, 0.9, d);
  }
  // Corner floodlight poles + hall sign.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    kit.stamp('cylinder', 'ink', gx + sx * 5.4, 2.6, gz + sz * 4.6, 0.09, 5.2, 0.09);
    put('lampGlow', gx + sx * 5.4, 5.1, gz + sz * 4.6, 0.7, 0.18, 0.5);
  }
  // Back wall with signage.
  put('wall0', gx, 1.75, gz + 5.6, 12, 3.5, 0.4);
  kit.sign(scene, 'GAME CENTER · TABLE TENNIS', gx, 2.9, gz + 5.35, 10, Math.PI);
}
