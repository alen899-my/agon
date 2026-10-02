import * as THREE from 'three';
import { circleContact, vehicleBody } from './Collision';
import { LIMIT, type Box } from './Map';
import { VEHICLES, type VehicleKind } from './Vehicles';
import { barrelSound } from '../game/Sound';

export type BarrelColor = 'hazard' | 'flame' | 'neon' | 'cyan' | 'oil';

export interface DynamicBarrel {
  id: number;
  x: number;
  y: number; // center height in world meters
  z: number;
  vx: number;
  vy: number;
  vz: number;
  pitch: number; // X rotation in radians
  roll: number;  // Z rotation in radians
  yaw: number;   // Y rotation in radians
  wPitch: number;
  wRoll: number;
  wYaw: number;
  radius: number; // 0.35m
  height: number; // 0.88m
  color: BarrelColor;
  sleeping: boolean;
  sleepFrames: number;
  mesh?: THREE.Group;
}

const BARREL_RADIUS = 0.35;
const BARREL_HEIGHT = 0.88;
const GRAVITY = 18.0;

/** Initial street-racing barrels arranged around the arena entrance, drift chicane, and perimeter. */
export const INITIAL_BARRELS: readonly { x: number; z: number; color: BarrelColor }[] = [
  // West entrance archway flanking curbs
  { x: -61.2, z: 72.2, color: 'hazard' },
  { x: -61.2, z: 87.5, color: 'flame' },
  // East exit archway flanking curbs
  { x: -28.8, z: 72.2, color: 'neon' },
  { x: -28.8, z: 87.5, color: 'hazard' },
  // West drift apex pair
  { x: -54.2, z: 86.8, color: 'cyan' },
  { x: -53.4, z: 87.4, color: 'flame' },
  // East drift apex pair
  { x: -36.2, z: 86.8, color: 'flame' },
  { x: -35.4, z: 87.4, color: 'neon' },
  // North run-off barrier cluster
  { x: -48.2, z: 89.2, color: 'hazard' },
  { x: -45.0, z: 89.5, color: 'oil' },
  { x: -41.8, z: 89.2, color: 'cyan' },
  { x: -45.0, z: 88.6, color: 'flame' },
];

export class BarrelSim {
  readonly barrels: DynamicBarrel[] = [];

  constructor() {
    INITIAL_BARRELS.forEach((b, i) => {
      this.barrels.push({
        id: i,
        x: b.x,
        y: BARREL_HEIGHT / 2,
        z: b.z,
        vx: 0,
        vy: 0,
        vz: 0,
        pitch: 0,
        roll: 0,
        yaw: (i * 1.3) % 6.28,
        wPitch: 0,
        wRoll: 0,
        wYaw: 0,
        radius: BARREL_RADIUS,
        height: BARREL_HEIGHT,
        color: b.color,
        sleeping: true,
        sleepFrames: 20,
      });
    });
  }

  /** Apply knockback when vehicle collides with a barrel. Throws the barrel into the air! */
  checkVehicleHit(
    carX: number,
    carZ: number,
    carYaw: number,
    carSpeed: number,
    carKind: VehicleKind,
    lateralSpeed = 0
  ): boolean {
    const spec = VEHICLES[carKind] ?? VEHICLES.car;
    const body = vehicleBody(carX, carZ, carYaw, carKind);
    let anyHit = false;

    // Car velocity vector in world coordinates
    const fx = Math.sin(carYaw), fz = -Math.cos(carYaw);
    const rx = Math.cos(carYaw), rz = Math.sin(carYaw);
    const carVx = fx * carSpeed + rx * lateralSpeed;
    const carVz = fz * carSpeed + rz * lateralSpeed;
    const carVTotal = Math.hypot(carVx, carVz);

    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      const hit = circleContact(body, b.x, b.z, b.radius);
      if (!hit) continue;

      anyHit = true;
      // Normal from car outward toward barrel
      let nx = hit.nx;
      let nz = hit.nz;
      const nlen = Math.hypot(nx, nz);
      if (nlen < 1e-4) {
        nx = b.x - carX;
        nz = b.z - carZ;
      }
      const dirLen = Math.hypot(nx, nz) || 1;
      nx /= dirLen;
      nz /= dirLen;

      // Unstick position immediately so it doesn't stay overlapping
      b.x += nx * (hit.depth + 0.05);
      b.z += nz * (hit.depth + 0.05);

      // Launch impulse proportional to vehicle speed and impact
      const impactSpeed = Math.max(1.8, carVTotal);
      const throwSpeed = Math.max(4.5, impactSpeed * 1.35 + 2.5);
      // Upward launch kick: flies high through the air like in movie street races!
      const upwardKick = Math.min(8.5, 2.5 + impactSpeed * 0.42);

      b.vx = nx * throwSpeed + (Math.random() - 0.5) * 2.5;
      b.vz = nz * throwSpeed + (Math.random() - 0.5) * 2.5;
      b.vy = upwardKick;

      // Aggressive tumbling rotation
      b.wPitch = (Math.random() - 0.5) * 16;
      b.wRoll = (Math.random() - 0.5) * 16;
      b.wYaw = (Math.random() - 0.5) * 12;

      b.sleeping = false;
      b.sleepFrames = 0;

      // Play metallic barrel impact clang
      barrelSound(Math.min(1.5, throwSpeed / 8));
    }

    return anyHit;
  }

  /** Player on foot pushes or kicks the barrel. */
  checkPlayerHit(px: number, pz: number, pvx: number, pvz: number): boolean {
    const playerRadius = 0.45;
    const playerSpeed = Math.hypot(pvx, pvz);
    let anyHit = false;

    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      const dx = b.x - px;
      const dz = b.z - pz;
      const dist = Math.hypot(dx, dz);
      const minDist = playerRadius + b.radius;

      if (dist < minDist) {
        anyHit = true;
        const nx = dist > 1e-4 ? dx / dist : 0;
        const nz = dist > 1e-4 ? dz / dist : 1;
        const overlap = minDist - dist;
        b.x += nx * (overlap + 0.03);
        b.z += nz * (overlap + 0.03);

        if (playerSpeed > 1.2) {
          // Running kick: barrel topples and gets thrown forward
          const kickSpeed = Math.max(3.0, playerSpeed * 1.4);
          b.vx = nx * kickSpeed + pvx * 0.5;
          b.vz = nz * kickSpeed + pvz * 0.5;
          b.vy = Math.min(3.8, 1.2 + playerSpeed * 0.35);
          b.wPitch = nz * 7 + (Math.random() - 0.5) * 4;
          b.wRoll = -nx * 7 + (Math.random() - 0.5) * 4;
          b.wYaw = (Math.random() - 0.5) * 6;
          b.sleeping = false;
          b.sleepFrames = 0;
          barrelSound(0.5);
        } else {
          // Walking nudge: slide/roll gently
          b.vx = nx * 1.5;
          b.vz = nz * 1.5;
          b.wPitch += nz * 2;
          b.wRoll -= nx * 2;
          b.sleeping = false;
          b.sleepFrames = 0;
        }
      }
    }

    return anyHit;
  }

  /** Physics step: gravity, tumbling, ground bouncing, friction, wall collision, sleep. */
  update(dt: number, solids: readonly Box[] = []): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const stepDt = Math.min(1 / 30, dt);

    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (b.sleeping) continue;

      // Gravity & linear motion
      b.vy -= GRAVITY * stepDt;
      b.x += b.vx * stepDt;
      b.y += b.vy * stepDt;
      b.z += b.vz * stepDt;

      // Angular motion
      b.pitch += b.wPitch * stepDt;
      b.roll += b.wRoll * stepDt;
      b.yaw += b.wYaw * stepDt;

      // Air resistance
      const airDrag = Math.pow(0.985, stepDt * 60);
      b.vx *= airDrag;
      b.vz *= airDrag;

      // Dynamic ground resting height based on orientation (standing vs lying down)
      const tilt = Math.hypot(Math.sin(b.pitch), Math.sin(b.roll));
      const groundY = tilt > 0.35 ? b.radius : b.height / 2;

      // Ground collision
      if (b.y <= groundY) {
        b.y = groundY;
        if (b.vy < -0.8) {
          // Bounce off asphalt with restitution
          b.vy = -b.vy * 0.36;
          b.wPitch *= 0.65;
          b.wRoll *= 0.65;
          if (Math.abs(b.vy) > 1.2) barrelSound(0.35);
        } else {
          b.vy = 0;
        }

        // Ground friction
        const groundFriction = Math.pow(0.85, stepDt * 60);
        b.vx *= groundFriction;
        b.vz *= groundFriction;

        // Rolling on ground when knocked onto its side
        if (tilt > 0.35) {
          b.pitch += (b.vz / b.radius) * stepDt;
          b.roll += (-b.vx / b.radius) * stepDt;
        }

        b.wPitch *= Math.pow(0.82, stepDt * 60);
        b.wRoll *= Math.pow(0.82, stepDt * 60);
        b.wYaw *= Math.pow(0.86, stepDt * 60);
      }

      // World boundary collision
      const limit = LIMIT - 1;
      if (Math.abs(b.x) > limit) {
        b.x = Math.sign(b.x) * limit;
        b.vx = -b.vx * 0.45;
      }
      if (Math.abs(b.z) > limit) {
        b.z = Math.sign(b.z) * limit;
        b.vz = -b.vz * 0.45;
      }

      // Collision with static solids (buildings)
      for (let s = 0; s < solids.length; s++) {
        const box = solids[s];
        const halfW = box.w / 2 + b.radius;
        const halfD = box.d / 2 + b.radius;
        if (Math.abs(b.x - box.x) < halfW && Math.abs(b.z - box.z) < halfD) {
          const penX = halfW - Math.abs(b.x - box.x);
          const penZ = halfD - Math.abs(b.z - box.z);
          if (penX < penZ) {
            b.x = box.x + Math.sign(b.x - box.x) * halfW;
            b.vx = -b.vx * 0.4;
          } else {
            b.z = box.z + Math.sign(b.z - box.z) * halfD;
            b.vz = -b.vz * 0.4;
          }
        }
      }

      // Sleep check
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const angSpeed = Math.hypot(b.wPitch, b.wRoll, b.wYaw);
      if (b.y <= groundY + 0.03 && speed < 0.06 && angSpeed < 0.1) {
        b.sleepFrames++;
        if (b.sleepFrames > 10) {
          b.vx = 0; b.vy = 0; b.vz = 0;
          b.wPitch = 0; b.wRoll = 0; b.wYaw = 0;
          b.sleeping = true;
        }
      } else {
        b.sleepFrames = 0;
      }
    }

    // Inter-barrel collisions (scatter like bowling pins)
    for (let i = 0; i < this.barrels.length; i++) {
      const b1 = this.barrels[i];
      for (let j = i + 1; j < this.barrels.length; j++) {
        const b2 = this.barrels[j];
        const dx = b2.x - b1.x;
        const dz = b2.z - b1.z;
        const minDist = b1.radius + b2.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist && distSq > 1e-4) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;
          b1.x -= nx * overlap * 0.5;
          b1.z -= nz * overlap * 0.5;
          b2.x += nx * overlap * 0.5;
          b2.z += nz * overlap * 0.5;

          const v1n = b1.vx * nx + b1.vz * nz;
          const v2n = b2.vx * nx + b2.vz * nz;
          const impulse = (v1n - v2n) * 0.72;
          b1.vx -= impulse * nx;
          b1.vz -= impulse * nz;
          b2.vx += impulse * nx;
          b2.vz += impulse * nz;
          b1.sleeping = false;
          b2.sleeping = false;
        }
      }
    }
  }
}

/** Construct a high-detail 3D oil drum with ribs and street racing livery. */
export function createBarrelMesh(color: BarrelColor): THREE.Group {
  const group = new THREE.Group();

  let bodyHex = 0xffd000;
  let bandHex = 0x181818;
  let rimHex = 0x4a4a4a;

  if (color === 'hazard') {
    bodyHex = 0xffbe0b; // Bright hazard yellow
    bandHex = 0x212529; // Carbon stripe
    rimHex = 0x343a40;
  } else if (color === 'flame') {
    bodyHex = 0xd90429; // Race red
    bandHex = 0xf8f9fa; // White racing stripe
    rimHex = 0x2b2d42;
  } else if (color === 'neon') {
    bodyHex = 0x70e000; // Toxic drift green
    bandHex = 0x181818;
    rimHex = 0x202020;
  } else if (color === 'cyan') {
    bodyHex = 0x00f5d4; // Tokyo electric cyan
    bandHex = 0x03045e;
    rimHex = 0x333333;
  } else if (color === 'oil') {
    bodyHex = 0x264653; // Industrial midnight oil
    bandHex = 0xe76f51;
    rimHex = 0x555555;
  }

  const drumGeo = new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS, BARREL_HEIGHT, 18);
  const drumMat = new THREE.MeshStandardMaterial({
    color: bodyHex,
    roughness: 0.45,
    metalness: 0.35,
  });
  const drum = new THREE.Mesh(drumGeo, drumMat);
  drum.castShadow = true;
  drum.receiveShadow = true;
  group.add(drum);

  // Center accent band
  const bandGeo = new THREE.CylinderGeometry(BARREL_RADIUS + 0.004, BARREL_RADIUS + 0.004, 0.24, 18);
  const bandMat = new THREE.MeshStandardMaterial({
    color: bandHex,
    roughness: 0.5,
    metalness: 0.25,
  });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.castShadow = true;
  group.add(band);

  // Raised body reinforcement ribs (iconic 55-gallon oil drum ribs)
  const ribGeo = new THREE.TorusGeometry(BARREL_RADIUS + 0.005, 0.012, 6, 20);
  const ribMat = new THREE.MeshStandardMaterial({
    color: rimHex,
    roughness: 0.4,
    metalness: 0.5,
  });
  const rib1 = new THREE.Mesh(ribGeo, ribMat);
  rib1.rotation.x = Math.PI / 2;
  rib1.position.y = 0.16;
  group.add(rib1);

  const rib2 = new THREE.Mesh(ribGeo, ribMat);
  rib2.rotation.x = Math.PI / 2;
  rib2.position.y = -0.16;
  group.add(rib2);

  // Top & bottom chime rims
  const chimeGeo = new THREE.TorusGeometry(BARREL_RADIUS + 0.006, 0.016, 6, 20);
  const chimeTop = new THREE.Mesh(chimeGeo, ribMat);
  chimeTop.rotation.x = Math.PI / 2;
  chimeTop.position.y = BARREL_HEIGHT / 2 - 0.01;
  group.add(chimeTop);

  const chimeBtm = new THREE.Mesh(chimeGeo, ribMat);
  chimeBtm.rotation.x = Math.PI / 2;
  chimeBtm.position.y = -BARREL_HEIGHT / 2 + 0.01;
  group.add(chimeBtm);

  return group;
}
