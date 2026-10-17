import * as THREE from 'three';
import type { VehicleParts } from './VehicleFactory';
import { VEHICLES, pickVehiclePaint, type VehicleKind } from './Vehicles';
import { DEFAULT_CUSTOMIZATION, type VehicleCustomization } from '../../server/src/shared/vehicleCustomization';
export { PART_OPTIONS, DEFAULT_CUSTOMIZATION, validCustomization, tuning } from '../../server/src/shared/vehicleCustomization';
export type { PartKey, VehicleCustomization } from '../../server/src/shared/vehicleCustomization';

export function stockBuild(kind: VehicleKind): VehicleCustomization {
  return { ...DEFAULT_CUSTOMIZATION, paint: '#' + pickVehiclePaint(kind, 0).toString(16).padStart(6, '0') };
}
type Change = { signature: string; undo: (() => void)[]; resources: { dispose(): void }[] };
const changes = new WeakMap<VehicleParts, Change>();
export function clearCustomization(vehicle: VehicleParts): void {
  const old = changes.get(vehicle);
  if (!old) return;
  old.undo.reverse().forEach(undo => undo()); old.resources.forEach(resource => resource.dispose()); changes.delete(vehicle);
}

/** Instance-owned parts/materials: never recolor other cars sharing factory geometry. */
export function applyCustomization(vehicle: VehicleParts, kind: VehicleKind, c?: VehicleCustomization): void {
  const signature = c ? JSON.stringify(c) : '';
  if (changes.get(vehicle)?.signature === signature) return;
  clearCustomization(vehicle);
  if (!c) return;
  const change: Change = { signature, undo: [], resources: [] }; changes.set(vehicle, change);
  const own = <T extends { dispose(): void }>(r: T): T => { change.resources.push(r); return r; };
  const mat = (color: string | number, metalness = 0.3, roughness = 0.4) => own(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const paint = mat(c.paint, c.finish === 'metallic' ? 0.8 : 0.25, c.finish === 'matte' ? 0.95 : 0.23);
  const carbon = mat(0x171b20, 0.25, 0.7), chrome = mat(c.rimColor, 0.9, 0.2), rubber = mat(0x101215, 0, 0.94);
  const replace = (mesh: THREE.Mesh, material: THREE.Material) => {
    const original = mesh.material; change.undo.push(() => { mesh.material = original; }); mesh.material = material;
  };
  const hide = (mesh: THREE.Object3D) => { const visible = mesh.visible; change.undo.push(() => { mesh.visible = visible; }); mesh.visible = false; };
  vehicle.body.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = object.userData.vehicleRole;
    if (role === 'paint' || role === 'roof' || role === 'spoiler' || role === 'frontBumper' || role === 'rearBumper') replace(object, paint);
    if (role === 'roof' && c.roof === 'carbon') replace(object, carbon);
    if (role === 'spoiler' && c.spoiler !== 'stock') hide(object);
    if (role === 'frontBumper' && c.frontBumper !== 'stock') hide(object);
    if (role === 'rearBumper' && c.rearBumper !== 'stock') hide(object);
    if (role === 'glass' && c.tint !== 'stock') replace(object, mat(c.tint === 'dark' ? 0x030608 : 0x7693a3, 0.45, 0.12));
  });
  const originalLight = vehicle.headMat.color.clone(), originalEmission = vehicle.headMat.emissive.clone();
  change.undo.push(() => { vehicle.headMat.color.copy(originalLight); vehicle.headMat.emissive.copy(originalEmission); });
  if (c.lights !== 'stock') { vehicle.headMat.color.set(c.lights === 'ice' ? 0xbce9ff : 0xffc052); vehicle.headMat.emissive.copy(vehicle.headMat.color); }
  const additions = new THREE.Group(); vehicle.body.add(additions); change.undo.push(() => additions.removeFromParent());
  const boxGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const box = (parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = new THREE.Mesh(boxGeo, m); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const spec = VEHICLES[kind], w = spec.width, l = spec.length;
  const layout = vehicle.group.userData.garageLayout as { hoodY: number; hoodZ: number; hoodLength: number; roofY: number; roofZ: number; roofLength: number };
  const h = layout?.hoodY ?? 0.8, hz = layout?.hoodZ ?? -l * 0.32;
  if (c.hood !== 'stock') {
    box(additions, carbon, 0, h + 0.025, hz, w * 0.8, 0.045, layout?.hoodLength ?? l * 0.22);
    if (c.hood === 'scoop') { box(additions, paint, 0, h + 0.17, hz, w * 0.36, 0.25, 0.65); box(additions, rubber, 0, h + 0.17, hz - 0.331, w * 0.29, 0.14, 0.02); }
    if (c.hood === 'vented') for (const side of [-1, 1]) for (let i = 0; i < 5; i++) box(additions, chrome, side * w * 0.23, h + 0.06, hz - 0.3 + i * 0.13, w * 0.2, 0.035, 0.055);
  }
  if (c.roof === 'rack') {
    const ry = (layout?.roofY ?? 1.2) + 0.12, rz = layout?.roofZ ?? 0.2;
    for (const side of [-1, 1]) box(additions, carbon, side * w * 0.36, ry, rz, 0.08, 0.14, 1.25);
    for (const z of [-0.5, 0, 0.5]) box(additions, chrome, 0, ry + 0.08, rz + z, w * 0.8, 0.05, 0.06);
  }
  if (c.frontBumper !== 'stock') {
    box(additions, paint, 0, 0.48, -l / 2 - 0.04, w * 1.01, 0.33, 0.28);
    box(additions, carbon, 0, 0.32, -l / 2 - 0.15, w * 1.03, 0.06, c.frontBumper === 'race' ? 0.5 : 0.3);
    box(additions, rubber, 0, 0.5, -l / 2 - 0.19, w * 0.55, 0.16, 0.025);
  }
  if (c.rearBumper !== 'stock') {
    box(additions, paint, 0, 0.5, l / 2, w, 0.3, 0.28);
    box(additions, carbon, 0, 0.32, l / 2 + 0.06, w * 0.9, 0.12, 0.38);
    if (c.rearBumper === 'diffuser') for (let i = -3; i <= 3; i++) box(additions, carbon, i * w / 9, 0.29, l / 2 + 0.12, 0.035, 0.22, 0.48);
  }
  if (c.skirts !== 'stock') for (const side of [-1, 1]) box(additions, c.skirts === 'carbon' ? carbon : paint, side * w / 2, 0.32, 0, 0.16, 0.18, l * 0.56);
  if (c.spoiler !== 'stock') {
    const y = kind === 'f1' ? 1.1 : h + (c.spoiler === 'wing' ? 0.65 : 0.15);
    if (c.spoiler === 'wing') for (const side of [-1, 1]) box(additions, carbon, side * w * 0.3, y - 0.23, l * 0.41, 0.06, 0.46, 0.15);
    box(additions, c.spoiler === 'wing' ? carbon : paint, 0, y, l * 0.41, w * 0.96, 0.07, c.spoiler === 'wing' ? 0.4 : 0.2);
  }
  if (c.exhaust !== 'stock') for (const side of [-1, 1]) for (let i = 0; i < (c.exhaust === 'quad' ? 2 : 1); i++) {
    const geo = own(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 16, 1, true));
    const pipe = new THREE.Mesh(geo, chrome); pipe.rotation.x = Math.PI / 2; pipe.position.set(side * (w * 0.32 + i * 0.18), 0.35, l / 2 + 0.13); additions.add(pipe);
  }
  if (c.underglow !== 'off') {
    const glow = own(new THREE.MeshStandardMaterial({ color: c.underglow === 'cyan' ? 0x36eeff : c.underglow === 'purple' ? 0xb359ff : 0xff3030, emissiveIntensity: 3 })); glow.emissive.copy(glow.color);
    for (const side of [-1, 1]) box(additions, glow, side * w * 0.45, 0.21, 0, 0.06, 0.035, l * 0.65);
    const light = new THREE.PointLight(glow.color, 3, 5, 2); light.position.y = 0.3; additions.add(light);
  }
  for (const spin of vehicle.spins) {
    const radius = Number(spin.userData.wheelRadius) || 0.4;
    const width = Number(spin.userData.wheelWidth) || 0.26;
    if (c.rims !== 'stock' || c.tyres !== 'stock' || c.rimColor !== DEFAULT_CUSTOMIZATION.rimColor) {
      for (const child of [...spin.children]) hide(child);
      const wheel = new THREE.Group(); spin.add(wheel); change.undo.push(() => wheel.removeFromParent());
      const tyreWidth = width * (c.tyres === 'slick' ? 1.14 : c.tyres === 'offroad' ? 1.18 : 1);
      const tyre = new THREE.Mesh(own(new THREE.CylinderGeometry(radius, radius, tyreWidth, 40)), rubber); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; wheel.add(tyre);
      for (const side of [-1, 1]) {
        const disc = new THREE.Mesh(own(new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, 0.018, 32)), carbon);
        disc.rotation.z = Math.PI / 2; disc.position.x = side * (tyreWidth / 2 + 0.01); wheel.add(disc);
        const ring = new THREE.Mesh(own(new THREE.TorusGeometry(radius * 0.69, 0.025, 8, 36)), chrome); ring.rotation.y = Math.PI / 2; ring.position.x = side * (tyreWidth / 2 + 0.025); wheel.add(ring);
        const count = c.rims === 'mesh' ? 12 : c.rims === 'steel' ? 8 : 5;
        if (c.rims === 'disc') { disc.material = chrome; }
        else for (let i = 0; i < count; i++) {
          const spoke = box(wheel, chrome, side * (tyreWidth / 2 + 0.025), 0, 0, 0.035, radius * 1.3, c.rims === 'mesh' ? 0.025 : 0.06); spoke.rotation.x = i * Math.PI / count;
        }
      }
      if (c.tyres !== 'slick') for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        const tread = box(wheel, rubber, 0, Math.cos(angle) * radius, Math.sin(angle) * radius, tyreWidth * 0.85, c.tyres === 'offroad' ? 0.055 : 0.012, 0.035); tread.rotation.x = angle;
      }
    }
    if (c.brakes !== 'stock' && spin.parent) box(additions, mat(c.brakes === 'ceramic' ? 0xf2cc3c : 0xe94036), spin.parent.position.x, radius + 0.08, spin.parent.position.z + 0.15, 0.07, 0.22, 0.13);
  }
  const originalY = vehicle.body.position.y;
  const ride = c.suspension === 'lowered' ? -0.09 : c.suspension === 'rally' ? 0.14 : 0;
  vehicle.group.userData.rideHeight = ride;
  vehicle.body.position.y = ride;
  change.undo.push(() => { vehicle.body.position.y = originalY; vehicle.group.userData.rideHeight = 0; });
}
