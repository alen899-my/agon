import * as THREE from 'three';
import type { KitLike, Model } from './VehicleFactory';
import { VehicleMeshBuilder } from './VehicleMeshBuilder';

const templates = new WeakMap<Model, THREE.Group>();

/** Seated driver anchored to the actual cockpit, shared across copies of a model. */
export function createVehicleOccupant(kit: KitLike, model: Model): THREE.Group {
  let template = templates.get(model);
  if (!template) {
    const p = new VehicleMeshBuilder(), eye = model.eye;
    const at = (x: number, y: number, z: number) => new THREE.Vector3(eye.x + x, eye.y + y, eye.z + z);
    const ellipsoid = (role: string, point: THREE.Vector3, x: number, y: number, z: number) => {
      const geometry = new THREE.SphereGeometry(1, 18, 12); geometry.scale(x, y, z); p.add(role, geometry, point);
    };
    ellipsoid('skin', at(0, 0.015, 0.035), 0.083, 0.108, 0.085);
    ellipsoid('hair', at(0, 0.069, 0.05), 0.085, 0.061, 0.079);
    ellipsoid('skin', at(0, -0.005, -0.05), 0.020, 0.027, 0.018);
    for (const side of [-1, 1]) {
      ellipsoid('skin', at(side * 0.083, 0.005, 0.035), 0.013, 0.023, 0.018);
      ellipsoid('hair', at(side * 0.029, 0.026, -0.043), 0.008, 0.005, 0.004);
    }
    p.tube('skin', [at(0, -0.08, 0.035), at(0, -0.15, 0.045)], 0.038);
    ellipsoid('shirt', at(0, -0.28, 0.07), 0.155, 0.19, 0.085);
    ellipsoid('trousers', at(0, -0.46, 0.08), 0.15, 0.09, 0.11);
    for (const side of [-1, 1]) {
      const shoulder = at(side * 0.13, -0.18, 0.05);
      const hand = model.steerPos.clone().add(new THREE.Vector3(side * 0.115, 0.02, 0.04));
      const elbow = shoulder.clone().lerp(hand, 0.55).add(new THREE.Vector3(side * 0.035, -0.12, 0.05));
      p.tube('shirt', [shoulder, elbow], 0.047);
      p.tube('skin', [elbow, hand], 0.030);
      ellipsoid('skin', hand, 0.032, 0.033, 0.038);
      const hip = at(side * 0.085, -0.46, 0.06), knee = at(side * 0.09, -0.48, -0.28);
      const foot = at(side * 0.10, -0.73, -0.44);
      p.tube('trousers', [hip, knee, foot.clone().add(new THREE.Vector3(0, 0.05, 0.035))], 0.057);
      ellipsoid('shoes', foot, 0.059, 0.043, 0.105);
    }
    // Visible diagonal belt is attached to the occupant rather than floating in space.
    p.tube('belt', [at(-0.13, -0.15, -0.025), at(0, -0.32, -0.025), at(0.12, -0.47, -0.025)], 0.012);
    const materials: Record<string, THREE.Material> = {
      skin: new THREE.MeshStandardMaterial({ color: 0xb77f5c, roughness: 0.88 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x211b19, roughness: 1 }),
      shirt: new THREE.MeshStandardMaterial({ color: 0x334d69, roughness: 0.92 }),
      trousers: new THREE.MeshStandardMaterial({ color: 0x242b36, roughness: 0.95 }),
      shoes: new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.88 }),
      belt: new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.92 }),
    };
    template = new THREE.Group(); template.name = 'Seated driver';
    const geometries = p.finish();
    geometries.forEach((geometry, role) => {
      const mesh = new THREE.Mesh(geometry, materials[role]);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.vehicleRole = 'occupant'; template!.add(mesh);
    });
    kit.extra.push({ dispose: () => { geometries.forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); } });
    templates.set(model, template);
  }
  const driver = template.clone(true); driver.visible = false; return driver;
}
