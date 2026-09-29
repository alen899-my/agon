import * as THREE from 'three';
import { BUILDINGS, ROADS, seeded } from './Map';

type Shape = 'box' | 'sphere' | 'cylinder';
type MaterialName = 'road' | 'pavement' | 'white' | 'ink' | 'glass' | 'metal' | 'wall0' | 'wall1' | 'wall2' | 'leaf';
export interface Stickman { group: THREE.Group; arms: THREE.Group[]; legs: THREE.Group[]; animate: (stride: number, moving: boolean) => void }

/** One asset kit. All copies share geometry/materials; static copies are GPU-instanced. */
export class AssetKit {
  readonly geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
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
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#ffffff'; ctx.font = '600 42px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 50, 480);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture }); const geometry = new THREE.PlaneGeometry(width, width * 96 / 512);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = yaw; scene.add(mesh);
    this.extra.push(texture, material, geometry);
  }
  stickman(player = false, variation = 0): Stickman {
    const group = new THREE.Group(); const material: MaterialName = player ? 'ink' : variation % 3 === 0 ? 'wall2' : variation % 3 === 1 ? 'ink' : 'wall1';
    this.mesh(group, 'cylinder', material, 0, 1.25, 0, 0.17, 0.65, 0.13);
    this.mesh(group, 'sphere', material, 0, 1.9, 0, 0.235, 0.26, 0.23);
    this.mesh(group, 'cylinder', material, 0, 1.64, 0, 0.065, 0.2, 0.065);
    const arms: THREE.Group[] = [], legs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(side * 0.24, 1.52, 0); group.add(arm); arms.push(arm);
      this.mesh(arm, 'cylinder', material, 0, -0.31, 0, 0.065, 0.62, 0.065);
      this.mesh(arm, 'sphere', material, 0, -0.65, 0, 0.075, 0.09, 0.075);
      const leg = new THREE.Group(); leg.position.set(side * 0.12, 0.95, 0); group.add(leg); legs.push(leg);
      this.mesh(leg, 'cylinder', material, 0, -0.4, 0, 0.075, 0.8, 0.075);
      this.mesh(leg, 'box', material, 0, -0.86, -0.065, 0.16, 0.15, 0.3);
    }
    if (player) {
      this.mesh(group, 'box', 'white', 0, 1.97, -0.208, 0.34, 0.065, 0.045);
      this.mesh(group, 'box', 'wall1', 0, 1.25, 0.18, 0.31, 0.42, 0.18);
    }
    return { group, arms, legs, animate: (stride, moving) => {
      const swing = moving ? Math.sin(stride) * 0.6 : 0;
      legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
      arms[0].rotation.x = -swing * 0.8; arms[1].rotation.x = swing * 0.8;
    } };
  }
  car(kind: 'car' | 'van' | 'bus' = 'car', dark = false): THREE.Group {
    const group = new THREE.Group(); const length = kind === 'bus' ? 7 : kind === 'van' ? 4.8 : 4.3;
    const body = dark ? 'wall2' : 'white';
    this.mesh(group, 'box', body, 0, 0.8, 0, 1.9, 0.7, length);
    const cabinLength = kind === 'car' ? 2.4 : length - 0.6;
    const cabinHeight = kind === 'car' ? 0.75 : 1.4;
    this.mesh(group, 'box', 'glass', 0, 1.15 + cabinHeight / 2, 0.1, 1.7, cabinHeight, cabinLength);
    this.mesh(group, 'box', body, 0, 1.15 + cabinHeight, 0.1, 1.85, 0.15, cabinLength + 0.15);
    for (const side of [-1, 1]) {
      for (const z of [-length * 0.32, length * 0.32]) {
        const wheel = this.mesh(group, 'cylinder', 'ink', side, 0.48, z, 0.4, 0.22, 0.4); wheel.rotation.z = Math.PI / 2;
        const hub = this.mesh(group, 'cylinder', 'metal', side * 1.13, 0.48, z, 0.17, 0.02, 0.17); hub.rotation.z = Math.PI / 2;
      }
      this.mesh(group, 'box', 'white', side * 0.6, 0.86, -length / 2 - 0.02, 0.35, 0.2, 0.06);
      this.mesh(group, 'box', 'ink', side * 0.6, 0.86, length / 2 + 0.02, 0.32, 0.14, 0.06);
      this.mesh(group, 'box', body, side * 0.86, 1.6, 0.1, 0.08, cabinHeight, 0.15);
    }
    return group;
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
  kit.flush(scene);
}
