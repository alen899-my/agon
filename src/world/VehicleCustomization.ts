import * as THREE from 'three';
import type { GarageLayout, VehicleParts } from './VehicleFactory';
import { VEHICLES, pickVehiclePaint, type VehicleKind } from './Vehicles';
import { DEFAULT_CUSTOMIZATION, resolvedBuild, partProfile, type VehicleCustomization } from '../../server/src/shared/vehicleCustomization';
export { PART_OPTIONS, DEFAULT_CUSTOMIZATION, validCustomization, tuning, partProfile, partLabel } from '../../server/src/shared/vehicleCustomization';
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
  const requested = c;
  c = resolvedBuild(requested);
  if (['f1', 'convertible', 'buggy'].includes(kind)) c.roof = 'stock';
  const profile = (key: keyof typeof requested) => partProfile(String(requested[key]));
  const change: Change = { signature, undo: [], resources: [] }; changes.set(vehicle, change);
  const own = <T extends { dispose(): void }>(r: T): T => { change.resources.push(r); return r; };
  const mat = (color: string | number, metalness = 0.3, roughness = 0.4) => own(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const paint = mat(c.paint, c.finish === 'metallic' ? 0.55 + profile('finish').level * 0.4 : 0.25, c.finish === 'matte' ? 0.75 + profile('finish').level * 0.2 : 0.10 + profile('finish').level * 0.25);
  paint.side = THREE.DoubleSide;
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
    if (role === 'wing' && c.spoiler !== 'stock') hide(object);
    if (role === 'frontBumper' && c.frontBumper !== 'stock') hide(object);
    if (role === 'rearBumper' && c.rearBumper !== 'stock') hide(object);
    if (role === 'exhaust' && c.exhaust !== 'stock') hide(object);
    if (role === 'rack' && c.roof === 'rack') hide(object);
    if (role === 'caliper' && c.brakes !== 'stock') hide(object);
    if (role === 'glass' && c.tint !== 'stock') { const glass = mat(c.tint === 'dark' ? 0x18232c : 0x7693a3, 0.1, 0.12); glass.transparent = true; glass.opacity = (c.tint === 'dark' ? 0.48 : 0.18) + profile('tint').stage * 0.06; glass.depthWrite = false; replace(object, glass); }
  });
  const originalLight = vehicle.headMat.color.clone(), originalEmission = vehicle.headMat.emissive.clone();
  change.undo.push(() => { vehicle.headMat.color.copy(originalLight); vehicle.headMat.emissive.copy(originalEmission); });
  if (c.lights !== 'stock') { vehicle.headMat.color.set(c.lights === 'ice' ? 0xbce9ff : 0xffc052); vehicle.headMat.color.offsetHSL(profile('lights').stage * 0.015, 0, profile('lights').level * 0.08); vehicle.headMat.emissive.copy(vehicle.headMat.color); }
  const additions = new THREE.Group(); vehicle.body.add(additions); change.undo.push(() => additions.removeFromParent());
  const boxGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const box = (parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = new THREE.Mesh(boxGeo, m); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const spec = VEHICLES[kind], w = spec.width, l = spec.length;
  const layout = vehicle.group.userData.garageLayout as GarageLayout | undefined;
  const h = layout?.hoodY ?? 0.8, hz = layout?.hoodZ ?? -l * 0.32, slope = layout?.hoodSlope ?? 0;
  if (c.hood !== 'stock') {
    const hoodLength = Math.max(0.08, layout?.hoodLength ?? l * 0.22);
    const plate = box(additions, carbon, 0, h + 0.014, hz, w * (0.48 + profile('hood').stage * 0.055), 0.018, hoodLength * 0.82);
    plate.rotation.x = -Math.atan(slope);
    // Follow the authored bonnet crown instead of laying a flat slab over a curved body.
    if (layout?.hoodSurface) {
      plate.visible = false;
      const positions: number[] = [], indices: number[] = [], segments = 16;
      const halfWidth = 0.30 + profile('hood').stage * 0.02;
      for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
        const point = layout.hoodSurface(hz + (row / segments - 0.5) * hoodLength * 0.82, 0.5 + (col / segments * 2 - 1) * halfWidth);
        positions.push(point.x, point.y, point.z);
        if (row < segments && col < segments) { const a = row * (segments + 1) + col; indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1); }
      }
      const geo = own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      carbon.side = THREE.DoubleSide;
      const panel = new THREE.Mesh(geo, carbon); panel.castShadow = true; additions.add(panel);
    }
    if (c.hood === 'scoop') { box(additions, paint, 0, h + 0.17, hz, w * (0.24 + profile('hood').stage * 0.025), 0.16 + profile('hood').level * 0.12, Math.min(0.65, hoodLength * 0.65)); box(additions, rubber, 0, h + 0.17, hz - Math.min(0.65, hoodLength * 0.65) / 2 - 0.01, w * 0.29, 0.14, 0.02); }
    if (c.hood === 'vented') for (const side of [-1, 1]) for (let i = 0; i < 3 + profile('hood').stage; i++) {
      const z = hz - hoodLength * 0.3 + i * hoodLength * 0.6 / (3 + profile('hood').stage);
      box(additions, chrome, side * w * 0.23, h + 0.06 + (z - hz) * slope, z, w * 0.2, 0.035, 0.055);
    }
  }
  if (c.roof === 'rack') {
    const ry = (layout?.roofY ?? 1.2) + 0.08 + profile('roof').stage * 0.02, rz = layout?.roofZ ?? 0.2;
    const railX = (layout?.roofHalfWidth ?? w * 0.36) * 0.82;
    const railLength = Math.min(1.25, (layout?.roofLength ?? 1.6) * 0.92);
    for (const side of [-1, 1]) box(additions, carbon, side * railX, ry, rz, 0.08, 0.14, railLength);
    for (const z of [-0.4, 0, 0.4]) box(additions, chrome, 0, ry + 0.08, rz + z * railLength, Math.min(w * 0.92, railX * 2 + 0.12), 0.05, 0.06);
  }
  if (c.roof === 'carbon' && profile('roof').stage > 0) {
    const roofY = layout?.roofY ?? 1.2, roofZ = layout?.roofZ ?? 0;
    const roofLength = Math.max(0.1, layout?.roofLength ?? 1);
    for (let i = 0; i < profile('roof').stage + 2; i++) box(additions, carbon,
      (i - (profile('roof').stage + 1) / 2) * w * 0.09, roofY + 0.025, roofZ + roofLength * 0.33, 0.018, 0.05, roofLength * 0.16);
  }
  // Competition packages add wheel-arch extensions around the actual wheel centres.
  if (profile('skirts').family === 4 || profile('skirts').family === 2) {
    for (const spin of vehicle.spins) if (spin.parent) {
      const radius = Number(spin.userData.wheelRadius) || 0.4;
      const side = Math.sign(spin.parent.position.x);
      const flareWidth = 0.035 + profile('skirts').stage * 0.018;
      const arc = own(new THREE.TorusGeometry(radius + 0.068, flareWidth, 5, 28, Math.PI));
      const flare = new THREE.Mesh(arc, c.skirts === 'carbon' ? carbon : paint);
      flare.rotation.y = Math.PI / 2;
      flare.position.set(spin.parent.position.x + side * (Number(spin.userData.wheelWidth) / 2 + flareWidth * 0.3), radius + 0.08, spin.parent.position.z);
      flare.castShadow = true; additions.add(flare);
    }
  }
  if (c.frontBumper !== 'stock') {
    const fy = layout?.noseY !== undefined ? Math.max(0.36, layout.noseY * 0.72) : 0.48;
    box(additions, paint, 0, fy, -l / 2 - 0.04, w * 0.88, 0.15, 0.18 + profile('frontBumper').stage * 0.025);
    box(additions, carbon, 0, fy - 0.16, -l / 2 - 0.15, w * 0.96, 0.04, c.frontBumper === 'race' ? 0.5 : 0.3);
    box(additions, rubber, 0, fy + 0.02, -l / 2 - 0.19, w * 0.55, 0.16, 0.025);
  }
  if (c.rearBumper !== 'stock') {
    const ty = layout?.tailY !== undefined ? Math.max(0.36, layout.tailY * 0.62) : 0.5;
    box(additions, paint, 0, ty, l / 2, w * 0.88, 0.16, 0.18 + profile('rearBumper').stage * 0.025);
    box(additions, carbon, 0, ty - 0.18, l / 2 + 0.06, w * 0.9, 0.12, 0.38);
    if (c.rearBumper === 'diffuser') for (let i = -2 - profile('rearBumper').stage; i <= 2 + profile('rearBumper').stage; i++) box(additions, carbon, i * w / (7 + profile('rearBumper').stage * 2), ty - 0.21, l / 2 + 0.12, 0.035, 0.22, 0.48);
  }
  if (c.skirts !== 'stock') {
    const sy = layout?.groundY !== undefined ? layout.groundY + 0.12 : 0.32;
    const axles = layout?.axles;
    const span = axles ? Math.max(0.9, axles[1] - axles[0] - Math.max(...vehicle.spins.map(spin => Number(spin.userData.wheelRadius) || 0.4)) * 2 - 0.2) : l * 0.56;
    const center = axles ? (axles[0] + axles[1]) / 2 : 0;
    for (const side of [-1, 1]) box(additions, c.skirts === 'carbon' ? carbon : paint, side * w / 2, sy, center, 0.10 + profile('skirts').stage * 0.025, 0.10, span);
  }
  if (c.spoiler !== 'stock') {
    const tail = layout?.tailY;
    const y = kind === 'f1' ? 1.1 : (tail ?? h) + (c.spoiler === 'wing' ? 0.35 + profile('spoiler').stage * 0.075 : tail !== undefined ? 0.04 : 0.15);
    if (c.spoiler === 'wing') for (const side of [-1, 1]) box(additions, carbon, side * w * 0.3,
      tail !== undefined ? tail + (y - tail) / 2 : y - 0.23, l * 0.41, 0.06, tail !== undefined ? y - tail : 0.46, 0.15);
    box(additions, c.spoiler === 'wing' ? carbon : paint, 0, y, l * 0.41, w * (0.78 + profile('spoiler').stage * 0.04), 0.055, c.spoiler === 'wing' ? 0.24 + profile('spoiler').stage * 0.04 : 0.15);
  }
  if (c.exhaust !== 'stock') {
    const ey = layout?.groundY !== undefined ? layout.groundY + 0.10 : 0.35;
    for (const side of [-1, 1]) for (let i = 0; i < (c.exhaust === 'quad' ? 2 : 1); i++) {
      const geo = own(new THREE.CylinderGeometry(0.045 + profile('exhaust').stage * 0.008, 0.045 + profile('exhaust').stage * 0.008, 0.24 + profile('exhaust').stage * 0.03, 16, 1, true));
      const pipe = new THREE.Mesh(geo, chrome); pipe.rotation.x = Math.PI / 2; pipe.position.set(side * (w * 0.32 + i * 0.18), ey, l / 2 + 0.13); additions.add(pipe);
    }
  }
  if (c.underglow !== 'off') {
    const glow = own(new THREE.MeshStandardMaterial({ color: c.underglow === 'cyan' ? 0x36eeff : c.underglow === 'purple' ? 0xb359ff : 0xff3030, emissiveIntensity: 3 })); glow.color.offsetHSL(profile('underglow').stage * 0.035, 0, 0); glow.emissive.copy(glow.color);
    const gy = layout?.groundY !== undefined ? layout.groundY + 0.035 : 0.21;
    for (const side of [-1, 1]) box(additions, glow, side * w * 0.45, gy, 0, 0.06, 0.035, l * 0.65);
    const light = new THREE.PointLight(glow.color, 3, 5, 2); light.position.y = gy + 0.09; additions.add(light);
  }
  for (const spin of vehicle.spins) {
    const radius = Number(spin.userData.wheelRadius) || 0.4;
    const width = Number(spin.userData.wheelWidth) || 0.26;
    if (c.rims !== 'stock' || c.tyres !== 'stock' || c.rimColor !== DEFAULT_CUSTOMIZATION.rimColor) {
      for (const child of [...spin.children]) hide(child);
      const wheel = new THREE.Group(); spin.add(wheel); change.undo.push(() => wheel.removeFromParent());
      const tyreWidth = width * (0.94 + profile('tyres').stage * 0.015);
      const tyre = new THREE.Mesh(own(new THREE.CylinderGeometry(radius, radius, tyreWidth, 40)), rubber); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; wheel.add(tyre);
      for (const side of [-1, 1]) {
        const disc = new THREE.Mesh(own(new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, 0.018, 32)), carbon);
        disc.rotation.z = Math.PI / 2; disc.position.x = side * (tyreWidth / 2 + 0.01); wheel.add(disc);
        const ring = new THREE.Mesh(own(new THREE.TorusGeometry(radius * 0.69, 0.025, 8, 36)), chrome); ring.rotation.y = Math.PI / 2; ring.position.x = side * (tyreWidth / 2 + 0.025); wheel.add(ring);
        const count = (c.rims === 'mesh' ? 10 : c.rims === 'steel' ? 6 : 4) + profile('rims').stage;
        if (c.rims === 'disc') {
          disc.material = chrome;
          for (let i = 0; i < 4 + profile('rims').stage; i++) {
            const angle = i * Math.PI * 2 / (4 + profile('rims').stage);
            const slot = box(wheel, carbon, side * (tyreWidth / 2 + 0.022), Math.cos(angle) * radius * 0.48, Math.sin(angle) * radius * 0.48, 0.006, radius * 0.18, 0.028);
            slot.rotation.x = angle;
          }
        }
        else for (let i = 0; i < count; i++) {
          const spoke = box(wheel, chrome, side * (tyreWidth / 2 + 0.025), 0, 0, 0.035, radius * 1.3, c.rims === 'mesh' ? 0.025 : 0.06); spoke.rotation.x = i * Math.PI / count;
        }
      }
      if (c.tyres !== 'slick') for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        const tread = box(wheel, rubber, 0, Math.cos(angle) * (radius - 0.01), Math.sin(angle) * (radius - 0.01), tyreWidth * 0.85, c.tyres === 'offroad' ? 0.02 : 0.012, 0.035); tread.rotation.x = angle;
      }
    }
    if (c.brakes !== 'stock' && spin.parent) { const caliper = box(spin.parent, mat(c.brakes === 'ceramic' ? 0xf2cc3c : 0xe94036), 0, radius * 0.1, radius * 0.48, width * 0.42, radius * (0.36 + profile('brakes').stage * 0.025), 0.07); change.undo.push(() => caliper.removeFromParent()); }
  }
  const originalY = vehicle.body.position.y;
  const ride = c.suspension === 'lowered' ? -0.012 - profile('suspension').stage * 0.003 : c.suspension === 'rally' ? 0.06 + profile('suspension').stage * 0.02 : 0;
  vehicle.group.userData.rideHeight = ride;
  vehicle.body.position.y = -0.16 + ride;
  change.undo.push(() => { vehicle.body.position.y = originalY; vehicle.group.userData.rideHeight = 0; });
}
