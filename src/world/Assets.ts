import * as THREE from 'three';
import { BUILDINGS, GAME_CENTER, ROADS, TABLE, seeded } from './Map';

type Shape = 'box' | 'sphere' | 'cylinder';
type MaterialName = 'road' | 'pavement' | 'white' | 'ink' | 'glass' | 'metal' | 'wall0' | 'wall1' | 'wall2' | 'leaf';
export interface GaitState { phase: number; intensity: number; airborne: boolean; dip: number; idle: number }
export interface Stickman {
  group: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group;
  arms: THREE.Group[]; elbows: THREE.Group[]; legs: THREE.Group[]; knees: THREE.Group[]; feet: THREE.Mesh[];
  animate: (s: GaitState) => void;
}
export interface Vehicle {
  group: THREE.Group; body: THREE.Group;
  spins: THREE.Object3D[]; frontSteer: THREE.Group[];
  brakeMat: THREE.MeshStandardMaterial; headMat: THREE.MeshStandardMaterial;
  spin: number;
  update: (speed: number, steer: number, dt: number, braking: boolean, bodyTilt?: { pitch: number; roll: number }) => void;
}

/** One asset kit. All copies share geometry/materials; static copies are GPU-instanced. */
export class AssetKit {
  readonly geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
  };
  readonly materials: Record<MaterialName, THREE.MeshStandardMaterial> = {
    road: new THREE.MeshStandardMaterial({ color: 0x373737, roughness: 1 }),
    pavement: new THREE.MeshStandardMaterial({ color: 0x9b9b9b, roughness: 1 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.7 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x414141, roughness: 0.25, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6, metalness: 0.3 }),
    wall0: new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.95 }),
    wall1: new THREE.MeshStandardMaterial({ color: 0xababab, roughness: 0.95 }),
    wall2: new THREE.MeshStandardMaterial({ color: 0x737373, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x626262, roughness: 1, flatShading: true }),
  };
  private batches = new Map<string, THREE.Matrix4[]>();
  private transform = new THREE.Object3D();
  private extra: { dispose: () => void }[] = [];

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
  car(kind: 'car' | 'van' | 'bus' = 'car', dark = false): Vehicle {
    const group = new THREE.Group(); const body = new THREE.Group(); group.add(body);
    const length = kind === 'bus' ? 7 : kind === 'van' ? 4.8 : 4.3;
    const bodyMat = dark ? 'wall2' : 'white';
    this.mesh(body, 'box', bodyMat, 0, 0.8, 0, 1.9, 0.7, length);
    const cabinLength = kind === 'car' ? 2.4 : length - 0.6;
    const cabinHeight = kind === 'car' ? 0.75 : 1.4;
    this.mesh(body, 'box', 'glass', 0, 1.15 + cabinHeight / 2, 0.1, 1.7, cabinHeight, cabinLength);
    this.mesh(body, 'box', bodyMat, 0, 1.15 + cabinHeight, 0.1, 1.85, 0.15, cabinLength + 0.15);
    // Dedicated lamp materials per vehicle so brake glow doesn't leak across cars.
    const brakeMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.4, emissive: 0xff1a1a, emissiveIntensity: 0.25 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5f2df, roughness: 0.3, emissive: 0xfff6c9, emissiveIntensity: 0.35 });
    this.extra.push(brakeMat, headMat);
    const spins: THREE.Object3D[] = []; const frontSteer: THREE.Group[] = [];
    const WHEEL_R = 0.4;
    for (const side of [-1, 1]) {
      for (const z of [-length * 0.32, length * 0.32]) {
        // Steer pivot (front wheels yaw) -> spin pivot (rolls with speed) -> tyre + hub.
        const steer = new THREE.Group(); steer.position.set(side, 0.48, z); group.add(steer);
        const spin = new THREE.Group(); steer.add(spin);
        const tyre = new THREE.Mesh(this.geometry.cylinder, this.materials.ink);
        tyre.scale.set(WHEEL_R, 0.22, WHEEL_R); tyre.rotation.z = Math.PI / 2;
        tyre.castShadow = tyre.receiveShadow = true; spin.add(tyre);
        const hub = new THREE.Mesh(this.geometry.cylinder, this.materials.metal);
        hub.scale.set(0.17, 0.24, 0.17); hub.rotation.z = Math.PI / 2; spin.add(hub);
        spins.push(spin);
        if (z < 0) frontSteer.push(steer); // front = -Z (headlight end)
      }
      const head = new THREE.Mesh(this.geometry.box, headMat);
      head.position.set(side * 0.6, 0.86, -length / 2 - 0.02); head.scale.set(0.35, 0.2, 0.06); body.add(head);
      const tail = new THREE.Mesh(this.geometry.box, brakeMat);
      tail.position.set(side * 0.6, 0.86, length / 2 + 0.02); tail.scale.set(0.32, 0.14, 0.06); body.add(tail);
      this.mesh(body, 'box', bodyMat, side * 0.86, 1.6, 0.1, 0.08, cabinHeight, 0.15);
    }
    const vehicle: Vehicle = { group, body, spins, frontSteer, brakeMat, headMat, spin: 0,
      update: (speed, steer, dt, braking, bodyTilt) => {
        vehicle.spin += (speed * dt) / WHEEL_R;
        for (const s of spins) s.rotation.x = vehicle.spin;
        for (const f of frontSteer) f.rotation.y = -steer * 0.45;
        brakeMat.emissiveIntensity = braking ? 2.2 : 0.25;
        if (bodyTilt) { body.rotation.x = bodyTilt.pitch; body.rotation.z = bodyTilt.roll; body.position.y = 0; }
      } };
    return vehicle;
  }
  dispose(): void {
    Object.values(this.geometry).forEach(g => g.dispose()); Object.values(this.materials).forEach(m => m.dispose()); this.extra.forEach(item => item.dispose());
  }
}

export function buildMap(scene: THREE.Scene, kit: AssetKit): void {
  const box = (material: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => kit.stamp('box', material, x, y, z, w, h, d);
  box('pavement', 0, -0.3, 0, 250, 0.5, 250);
  for (const road of ROADS) {
    box('road', road, -0.025, 0, 17, 0.08, 242); box('road', 0, -0.025, road, 242, 0.08, 17);
    for (let v = -116; v <= 116; v += 7) {
      if (ROADS.every(r => Math.abs(r - v) > 12)) {
        box('white', road, 0.025, v, 0.12, 0.015, 2.6); box('white', v, 0.025, road, 2.6, 0.015, 0.12);
      }
    }
    for (const cross of ROADS) for (const side of [-1, 1]) for (let i = -3; i <= 3; i++) {
      box('white', road + i * 1.8, 0.035, cross + side * 11, 1, 0.02, 3.4);
      box('white', road + side * 11, 0.035, cross + i * 1.8, 3.4, 0.02, 1);
    }
    for (const side of [-1, 1]) {
      box('white', road + side * 9, 0.035, 0, 0.25, 0.18, 240);
      box('white', 0, 0.035, road + side * 9, 240, 0.18, 0.25);
    }
  }
  for (const b of BUILDINGS) {
    const material = `wall${b.shade}` as MaterialName;
    box(material, b.x, b.h / 2, b.z, b.w, b.h, b.d);
    box('white', b.x, b.h + 0.15, b.z, b.w + 0.5, 0.3, b.d + 0.5);
    box('ink', b.x, 0.45, b.z, b.w + 0.2, 0.9, b.d + 0.2);
    box('metal', b.x - b.w * 0.22, b.h + 0.65, b.z, 2.8, 1, 2.3);
    for (const side of [-1, 1]) {
      for (let y = 3.6; y < b.h - 1; y += 3.7) {
        for (let x = -b.w / 2 + 2.5; x < b.w / 2 - 1.5; x += 3.8) {
          box('glass', b.x + x, y, b.z + side * (b.d / 2 + 0.035), 1.7, 2, 0.08);
          box('white', b.x + x, y - 1.05, b.z + side * (b.d / 2 + 0.15), 1.95, 0.12, 0.35);
        }
        for (let z = -b.d / 2 + 2.5; z < b.d / 2 - 1.5; z += 3.8) box('glass', b.x + side * (b.w / 2 + 0.035), y, b.z + z, 0.08, 2, 1.7);
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
  for (const [x, z] of [[27, -39], [28, -60], [51, -62], [53, -38], [36, -63], [-42, 16], [-43, 31], [-15, 16], [20, 62], [56, 24]]) {
    kit.stamp('cylinder', 'ink', x, 1.6, z, 0.22, 3.2, 0.22);
    kit.stamp('sphere', 'leaf', x, 4 + rng(), z, 2, 2.5, 2);
  }
  for (const [x, z] of [[-36, 32], [-20, 32], [31, -56], [49, -56], [26, 26]]) {
    box('ink', x, 0.55, z, 3, 0.18, 0.8); box('metal', x, 1.05, z + 0.35, 3, 0.85, 0.12);
    for (const offset of [-1, 1]) box('metal', x + offset, 0.25, z, 0.12, 0.5, 0.6);
  }
  for (const x of [-12, 12]) for (let z = -67; z < 80; z += 24) {
    kit.stamp('cylinder', 'ink', x, 3.1, z, 0.1, 6.2, 0.1);
    box('ink', x + (x < 0 ? 0.7 : -0.7), 6.2, z, 1.6, 0.15, 0.15);
    box('white', x + (x < 0 ? 1.4 : -1.4), 6.1, z, 0.6, 0.12, 0.4);
  }
  // Station canopy and visible parallel rail tracks.
  box('metal', 42, 4.3, 62, 28, 0.35, 7);
  for (const x of [30, 42, 54]) box('ink', x, 2.1, 62, 0.22, 4.2, 0.22);
  for (const z of [68, 70]) box('ink', 40, 0.03, z, 53, 0.08, 0.15);
  for (let x = 15; x < 67; x += 1.6) box('metal', x, 0.01, 69, 0.2, 0.08, 3.4);
  for (const [x, z] of [[-30, 68], [-44, 68], [-60, 68]]) {
    box('wall1', x, 1.5, z, 10, 3, 4); box('white', x, 3.05, z, 10.1, 0.1, 4.1);
  }
  for (const x of [-118, 118]) box('metal', x, 0.55, 0, 0.3, 1.1, 236);
  for (const z of [-118, 118]) box('metal', 0, 0.55, z, 236, 1.1, 0.3);
  buildGameCenter(scene, kit, box);
  kit.flush(scene);
}

/** Game Center: open-air hall with ITTF table tennis court. Play axis = Z. */
export function buildGameCenter(scene: THREE.Scene, kit: AssetKit, box?: (m: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number) => void): void {
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
    put('white', gx + sx * 5.4, 5.1, gz + sz * 4.6, 0.7, 0.18, 0.5);
  }
  // Back wall with signage.
  put('wall0', gx, 1.75, gz + 5.6, 12, 3.5, 0.4);
  kit.sign(scene, 'GAME CENTER · TABLE TENNIS', gx, 2.9, gz + 5.35, 10, Math.PI);
}
