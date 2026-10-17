import * as THREE from 'three';
import { GARAGE } from './GarageLocation';

/** The same real 3D workshop is used in the district and the interactive showroom. */
export function createGarageBuilding(interior = false): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const resources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T): T => { resources.push(r); return r; };
  const geometry = own(new THREE.BoxGeometry(1, 1, 1));
  const material = (color: number, metalness = 0, roughness = 0.7) => own(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const wall = material(0x27313b), floor = material(0x252d32, 0.3, 0.38), steel = material(0x78818b, 0.7), dark = material(0x10161e), orange = material(0xff9b35);
  const glow = own(new THREE.MeshStandardMaterial({ color: 0xb5fff2, emissive: 0x51e5cf, emissiveIntensity: 2 }));
  const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = new THREE.Mesh(geometry, m); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  box(floor, 0, -0.06, 0, 18, 0.12, 26);
  box(wall, -9, 3.5, -3, 0.5, 7, 22); box(wall, 9, 3.5, -3, 0.5, 7, 22); box(wall, 0, 3.5, -14, 18, 7, 0.5);
  if (!interior) { box(wall, 0, 7, -3, 18, 0.3, 22); box(dark, 0, 6.3, 8, 18, 1.4, 0.5); }
  for (const x of [-8.7, 8.7]) { box(orange, x, 2.5, 7.8, 0.3, 5, 0.35); box(glow, x, 3, -3, 0.04, 0.09, 20); }
  for (const x of [-3.8, 3.8]) box(glow, x, 0.015, 0, 0.045, 0.025, 12);
  for (const z of [-5.9, 5.9]) box(glow, 0, 0.015, z, 7.6, 0.025, 0.045);
  for (const x of [-6, 6]) {
    box(dark, x, 0.9, -10.5, 3, 1.8, 1.2); box(steel, x, 1.85, -10.5, 3.2, 0.1, 1.4);
    for (let i = 0; i < 5; i++) { box(orange, x, 0.35 + i * 0.29, -9.87, 2.8, 0.22, 0.03); box(steel, x, 0.37 + i * 0.29, -9.83, 0.8, 0.04, 0.03); }
    for (let j = 0; j < 3; j++) {
      const tire = new THREE.Mesh(own(new THREE.TorusGeometry(0.46, 0.16, 10, 24)), dark); tire.position.set(x, 2.7 + j * 1.1, -13.5); group.add(tire);
    }
  }
  for (const z of [-8, 0, 6]) { box(steel, 0, 6.7, z, 17, 0.16, 0.2); box(glow, -4, 6.55, z, 3.8, 0.07, 0.18); box(glow, 4, 6.55, z, 3.8, 0.07, 0.18); }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#10161e'; ctx.fillRect(0, 0, 1024, 192); ctx.fillStyle = '#a9ffe8'; ctx.font = 'bold 78px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('APEX / MOTOR WORKS', 512, 100); ctx.fillStyle = '#e0e9ec'; ctx.font = '26px sans-serif'; ctx.fillText('PAINT   /   PERFORMANCE   /   BESPOKE', 512, 153);
  const texture = own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(own(new THREE.PlaneGeometry(12, 2.25)), own(new THREE.MeshBasicMaterial({ map: texture })));
  sign.position.set(0, interior ? 4.8 : 6.3, interior ? -13.7 : 8.3); group.add(sign);
  if (!interior) group.position.set(GARAGE.x, 0, GARAGE.z + 3);
  return { group, dispose: () => resources.forEach(r => r.dispose()) };
}
