import * as THREE from 'three';
import type { AssetKit, MaterialName } from './Assets';

/** Sound/visual family per gun (drives gunshot synth + muzzle size). */
export type GunClass = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'lmg';

export interface GunDef {
  key: string;
  name: string;
  cls: GunClass;
  /** Damage per pellet at full strength (falls off past 60% of range). */
  damage: number;
  /** Magazine capacity (reserve ammo is infinite — reload time is the cost). */
  mag: number;
  /** Seconds between shots while held (auto) or minimum refire (semi). */
  interval: number;
  /** True = hold to keep firing; false = one shot per trigger press. */
  auto: boolean;
  /** Reload duration in seconds. */
  reload: number;
  /** Max reach in meters. */
  range: number;
  /** Cone half-angle in degrees, aimed / hip-fired. */
  spreadAim: number;
  spreadHip: number;
  /** Projectiles per trigger pull. */
  pellets: number;
  /** Camera kick per shot (radians of pitch). */
  kick: number;
  /** Damage multiplier vs vehicles (bodywork soaks small arms). */
  vehMult: number;
  /** Overall length in meters (muzzle offset + tracer origin). */
  len: number;
  /** ADS camera field of view while aiming this gun. */
  zoomFov: number;
  /** True = full scope overlay (dark surround + mil ring) while aiming. */
  scoped: boolean;
}

/**
 * The launch arsenal: 10 originals, all owned from the start.
 * Cycle with G / gun button, pick directly with 1-9,0.
 */
export const GUNS: GunDef[] = [
  { key: 'pistol', name: 'P9 SIDEARM', cls: 'pistol', damage: 26, mag: 12, interval: 0.22, auto: false, reload: 1.4, range: 60, spreadAim: 0.5, spreadHip: 2.2, pellets: 1, kick: 0.012, vehMult: 0.6, len: 0.32, zoomFov: 50, scoped: false },
  { key: 'combat', name: 'CP-9 TACTICAL', cls: 'pistol', damage: 30, mag: 12, interval: 0.18, auto: false, reload: 1.3, range: 65, spreadAim: 0.4, spreadHip: 2.0, pellets: 1, kick: 0.013, vehMult: 0.6, len: 0.34, zoomFov: 50, scoped: false },
  { key: 'revolver', name: 'LONGHORN .44', cls: 'pistol', damage: 65, mag: 6, interval: 0.5, auto: false, reload: 2.2, range: 70, spreadAim: 0.4, spreadHip: 2.4, pellets: 1, kick: 0.03, vehMult: 0.8, len: 0.4, zoomFov: 46, scoped: false },
  { key: 'micro', name: 'WASP MICRO SMG', cls: 'smg', damage: 22, mag: 30, interval: 0.09, auto: true, reload: 1.8, range: 55, spreadAim: 1.1, spreadHip: 3.0, pellets: 1, kick: 0.008, vehMult: 0.6, len: 0.45, zoomFov: 50, scoped: false },
  { key: 'smg', name: 'HORNET SMG', cls: 'smg', damage: 26, mag: 32, interval: 0.08, auto: true, reload: 2.0, range: 60, spreadAim: 0.9, spreadHip: 2.8, pellets: 1, kick: 0.008, vehMult: 0.6, len: 0.55, zoomFov: 48, scoped: false },
  { key: 'shotgun', name: 'M590 BREACHER', cls: 'shotgun', damage: 12, mag: 8, interval: 0.95, auto: false, reload: 2.6, range: 30, spreadAim: 2.4, spreadHip: 3.6, pellets: 8, kick: 0.05, vehMult: 0.8, len: 0.95, zoomFov: 50, scoped: false },
  { key: 'rifle', name: 'AK-VANDAL', cls: 'rifle', damage: 32, mag: 30, interval: 0.11, auto: true, reload: 2.2, range: 90, spreadAim: 0.5, spreadHip: 2.2, pellets: 1, kick: 0.014, vehMult: 0.7, len: 0.85, zoomFov: 38, scoped: false },
  { key: 'carbine', name: 'CQB CARBINE', cls: 'rifle', damage: 36, mag: 30, interval: 0.1, auto: true, reload: 2.1, range: 100, spreadAim: 0.35, spreadHip: 2.0, pellets: 1, kick: 0.012, vehMult: 0.7, len: 0.8, zoomFov: 36, scoped: false },
  { key: 'sniper', name: 'LONGEYE DMR', cls: 'sniper', damage: 120, mag: 5, interval: 1.2, auto: false, reload: 3.0, range: 160, spreadAim: 0.05, spreadHip: 3.5, pellets: 1, kick: 0.04, vehMult: 1.2, len: 1.1, zoomFov: 22, scoped: true },
  { key: 'lmg', name: 'MULE LMG', cls: 'lmg', damage: 30, mag: 80, interval: 0.095, auto: true, reload: 3.6, range: 85, spreadAim: 0.9, spreadHip: 3.2, pellets: 1, kick: 0.01, vehMult: 0.8, len: 1.0, zoomFov: 42, scoped: false },
];

export interface BuiltGun {
  group: THREE.Group;
  /** Muzzle tip in gun-local space (gun points -Z). */
  muzzle: THREE.Vector3;
}

/**
 * Original low-poly gun models from the shared asset kit (no new materials,
 * no textures — ink bodies, metal barrels, pale grips). Each points -Z with
 * the grip at the origin so it seats straight into the avatar's hand.
 */
export function buildGun(kind: number, kit: AssetKit): BuiltGun {
  const def = GUNS[kind % GUNS.length];
  const group = new THREE.Group();
  const part = (mat: MaterialName, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(kit.geometry.box, kit.materials[mat]);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    group.add(mesh); return mesh;
  };
  const cyl = (mat: MaterialName, x: number, y: number, z: number, r: number, len: number, axisZ = true) => {
    const mesh = new THREE.Mesh(kit.geometry.cylinder, kit.materials[mat]);
    mesh.position.set(x, y, z); mesh.scale.set(r, axisZ ? len : r, axisZ ? r : len);
    if (axisZ) mesh.rotation.x = Math.PI / 2;
    group.add(mesh); return mesh;
  };
  const L = def.len;
  switch (def.cls) {
    case 'pistol':
      part('ink', 0, 0.02, -L * 0.2, 0.05, 0.09, L * 0.62); // slide
      part('metal', 0, 0.03, -L * 0.48, 0.035, 0.035, 0.06); // muzzle
      part('wall1', 0, -0.07, 0.05, 0.045, 0.12, 0.07); // grip
      part('ink', 0, -0.028, -L * 0.18, 0.052, 0.02, L * 0.55); // frame
      if (def.key === 'revolver') cyl('metal', 0, 0.0, -0.02, 0.045, 0.09); // cylinder
      if (def.key === 'combat') part('ink', 0, 0.075, -L * 0.25, 0.02, 0.03, 0.12); // sight rail
      break;
    case 'smg':
      part('ink', 0, 0.02, -L * 0.15, 0.055, 0.1, L * 0.6); // receiver
      cyl('metal', 0, 0.03, -L * 0.44, 0.025, L * 0.25); // barrel + shroud
      part('wall1', 0, -0.08, 0.06, 0.05, 0.13, 0.07); // grip
      part('ink', 0, -0.06, -L * 0.28, 0.04, 0.12, 0.05); // foregrip/mag
      part('ink', 0, 0.02, L * 0.28, 0.045, 0.09, 0.16); // stock
      part('white', 0, 0.085, -L * 0.3, 0.015, 0.03, 0.015); // front sight
      break;
    case 'shotgun':
      cyl('metal', 0, 0.03, -L * 0.25, 0.032, L * 0.55); // barrel
      cyl('wall1', 0, -0.025, -L * 0.22, 0.035, L * 0.3); // pump
      part('ink', 0, 0.0, L * 0.1, 0.055, 0.09, L * 0.45); // receiver + stock
      part('wall1', 0, -0.05, L * 0.32, 0.05, 0.13, 0.1); // buttstock
      break;
    case 'rifle':
      part('ink', 0, 0.02, 0, 0.055, 0.1, L * 0.55); // receiver
      cyl('metal', 0, 0.035, -L * 0.4, 0.022, L * 0.3); // barrel
      part('wall1', 0, 0.01, -L * 0.28, 0.05, 0.06, 0.16); // handguard
      part('ink', 0, -0.075, -L * 0.05, 0.045, 0.14, 0.06); // curved mag
      part('wall1', 0, -0.06, 0.05, 0.05, 0.12, 0.08); // grip
      part('ink', 0, -0.03, L * 0.35, 0.05, 0.12, 0.12); // stock
      part('white', 0, 0.09, -L * 0.42, 0.015, 0.035, 0.015); // post sight
      if (def.key === 'carbine') part('ink', 0, 0.08, -L * 0.1, 0.025, 0.03, 0.3); // carry handle/sight
      break;
    case 'sniper':
      cyl('metal', 0, 0.04, -L * 0.32, 0.02, L * 0.5); // long fluted barrel
      part('ink', 0, 0.0, L * 0.05, 0.05, 0.1, L * 0.4); // receiver + chassis
      cyl('ink', 0, 0.1, 0.02, 0.032, 0.16); // scope tube
      part('ink', 0, 0.1, 0.1, 0.02, 0.02, 0.05); // scope mount
      part('wall1', 0, -0.06, L * 0.3, 0.055, 0.12, 0.14); // stock + cheek
      part('ink', 0, -0.08, -L * 0.02, 0.04, 0.1, 0.05); // mag
      part('metal', 0, -0.09, -L * 0.3, 0.015, 0.14, 0.015); // bipod leg
      break;
    case 'lmg':
      part('ink', 0, 0.02, 0, 0.06, 0.11, L * 0.5); // receiver
      cyl('metal', 0, 0.035, -L * 0.38, 0.024, L * 0.32); // barrel
      cyl('wall1', 0, -0.06, -L * 0.05, 0.07, 0.1); // ammo drum
      part('ink', 0, -0.075, -L * 0.3, 0.045, 0.12, 0.05); // grip
      part('ink', 0, -0.02, L * 0.36, 0.05, 0.1, 0.14); // stock
      part('metal', 0, -0.1, -L * 0.42, 0.018, 0.16, 0.018); // bipod
      break;
  }
  group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, muzzle: new THREE.Vector3(0, 0.03, -L / 2 - 0.04) };
}
