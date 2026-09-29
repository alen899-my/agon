import * as THREE from 'three';
import { GameLoop } from '../game/GameLoop';
import type { Theme } from '../game/State';
import { AssetKit, buildMap, type Stickman, type Vehicle } from './Assets';
import { BUILDINGS, PLACES, seeded } from './Map';
import { Simulation, type WorldAction, type WorldSnapshot } from './Simulation';

export type QualityLevel = 'low' | 'balanced' | 'high' | 'ultra';
const QUALITY_PIXEL: Record<QualityLevel, number> = { low: 1, balanced: 1.5, high: 2, ultra: 2.5 };
const QUALITY_SHADOW: Record<QualityLevel, number> = { low: 512, balanced: 1024, high: 2048, ultra: 4096 };

export class WorldEngine {
  readonly simulation = new Simulation();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.12, 340);
  private readonly kit: AssetKit;
  private readonly avatar: Stickman;
  private readonly car: Vehicle;
  private readonly parked: Vehicle[] = [];
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x555555, 2.2);
  private readonly marker: THREE.Mesh;
  private readonly loop: GameLoop;
  private readonly people: { actor: Stickman }[] = [];
  private readonly traffic: Vehicle[] = [];
  private prevSpeed = 0; private shake = 0; private lastImpactAt = -10; private prevSimTime = 0;
  private quality: QualityLevel = 'balanced'; private pixelCap = QUALITY_PIXEL.balanced;
  private lastW = 1; private lastH = 1;
  private readonly cameraBoxes = BUILDINGS.map(b => new THREE.Box3(new THREE.Vector3(b.x - b.w / 2 - 0.35, 0, b.z - b.d / 2 - 0.35), new THREE.Vector3(b.x + b.w / 2 + 0.35, b.h + 0.5, b.z + b.d / 2 + 0.35)));
  private target = new THREE.Vector3(); private desired = new THREE.Vector3(); private direction = new THREE.Vector3(); private hit = new THREE.Vector3(); private ray = new THREE.Ray();
  private suspended = false; private disposed = false; private hudTime = 0;

  constructor(private canvas: HTMLCanvasElement, private publish: (value: WorldSnapshot) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.kit = new AssetKit(); buildMap(this.scene, this.kit);
    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 150 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.1;
    this.avatar = this.kit.stickman(true); this.scene.add(this.avatar.group);
    this.car = this.kit.car(); this.scene.add(this.car.group);
    const random = seeded(8008);
    for (let i = 0; i < 16; i++) {
      const actor = this.kit.stickman(false, i); actor.group.scale.setScalar(0.9 + random() * 0.15);
      this.scene.add(actor.group); this.people.push({ actor });
    }
    for (let i = 0; i < 6; i++) {
      const vehicle = this.kit.car(i === 0 ? 'bus' : i % 3 === 0 ? 'van' : 'car', i % 2 === 0);
      this.scene.add(vehicle.group); this.traffic.push(vehicle);
    }
    for (const [x, z, type] of [[-11, -38, 'van'], [11, -54, 'car'], [55, 12, 'car']] as const) {
      const parked = this.kit.car(type, true); parked.group.position.set(x, 0, z); this.scene.add(parked.group); this.parked.push(parked);
    }
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.renderOrder = 5; this.scene.add(this.marker);
    this.setTheme('light');
    this.loop = new GameLoop(dt => {
      this.simulation.update(dt); this.hudTime += dt;
      if (this.hudTime >= 0.1) { this.hudTime = 0; this.emit(); }
    }, this.render);
    this.emit();
  }
  private emit(): void { this.publish(this.simulation.snapshot); }
  begin(): void { this.simulation.begin(); this.emit(); }
  start(): void { if (!this.suspended) this.loop.start(); }
  togglePause(): void { this.simulation.togglePause(); this.emit(); }
  toggleView(): void { this.simulation.toggleView(); this.emit(); }
  interact(): void { this.simulation.interact(); this.emit(); }
  waypoint(id: string): void { if (PLACES.some(p => p.id === id)) { this.simulation.waypoint = id; this.emit(); } }
  input(action: WorldAction, down: boolean, source: string): void { if (!this.suspended || !down) this.simulation.setInput(action, down, source); }
  joystick(x: number, y: number): void { if (!this.suspended) this.simulation.setStick(x, y); }
  look(dx: number, dy: number): void { if (!this.suspended) this.simulation.look(dx, dy); }
  clearInput(): void { this.simulation.clearInput(); }
  setSuspended(value: boolean): void { this.suspended = value; this.clearInput(); if (value) this.loop.stop(); else this.loop.start(); }
  setTheme(theme: Theme): void {
    const mats = this.kit.materials;
    if (theme === 'color') {
      // Real-life palette: asphalt, concrete, brick, glass blue, green trees.
      mats.road.color.setHex(0x3c4046);
      mats.pavement.color.setHex(0xb8b2a4);
      mats.white.color.setHex(0xf7f4ec);
      mats.ink.color.setHex(0x22252a);
      mats.glass.color.setHex(0x5ea9dd);
      mats.glass.roughness = 0.12; mats.glass.metalness = 0.45;
      mats.metal.color.setHex(0x9aa1a9);
      mats.wall0.color.setHex(0xe4c188);
      mats.wall1.color.setHex(0xb65a41);
      mats.wall2.color.setHex(0x6f87a3);
      mats.leaf.color.setHex(0x43a047);
      const sky = 0x87bfe8;
      this.scene.background = new THREE.Color(sky); this.scene.fog = new THREE.Fog(sky, 100, 280);
      this.sun.color.setHex(0xfff0d6); this.sun.intensity = 3;
      this.ambient.color.setHex(0xcfe5ff); this.ambient.groundColor.setHex(0x8a9a7b); this.ambient.intensity = 1.6;
      this.renderer.toneMappingExposure = 1.1;
      if (this.marker) (this.marker.material as THREE.MeshBasicMaterial).color.setHex(0xe11d48);
      return;
    }
    // Monochrome palettes (light / dark).
    mats.road.color.setHex(0x373737);
    mats.pavement.color.setHex(0x9b9b9b);
    mats.white.color.setHex(0xf1f1f1);
    mats.ink.color.setHex(0x181818);
    mats.glass.color.setHex(0x414141);
    mats.glass.roughness = 0.25; mats.glass.metalness = 0.35;
    mats.metal.color.setHex(0x666666);
    mats.wall0.color.setHex(0xd9d9d9);
    mats.wall1.color.setHex(0xababab);
    mats.wall2.color.setHex(0x737373);
    mats.leaf.color.setHex(0x626262);
    const dark = theme === 'dark'; const color = dark ? 0x242424 : 0xdadada;
    this.scene.background = new THREE.Color(color); this.scene.fog = new THREE.Fog(color, 90, 255);
    this.sun.color.setHex(0xffffff);
    this.ambient.color.setHex(0xffffff); this.ambient.groundColor.setHex(0x555555);
    this.ambient.intensity = dark ? 1.1 : 2.2; this.sun.intensity = dark ? 1.5 : 3;
    this.renderer.toneMappingExposure = 1.05;
    if (this.marker) (this.marker.material as THREE.MeshBasicMaterial).color.setHex(dark ? 0xffffff : 0x111111);
  }
  resize(width: number, height: number): void {
    this.lastW = Math.max(1, width); this.lastH = Math.max(1, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelCap));
    this.renderer.setSize(this.lastW, this.lastH, false);
    this.camera.aspect = this.lastW / this.lastH; this.camera.updateProjectionMatrix();
  }
  /** Graphics quality for high-spec devices. Live-applied: pixel ratio, shadow resolution, shadows on/off. */
  applyQuality(q: QualityLevel): void {
    this.quality = q; this.pixelCap = QUALITY_PIXEL[q];
    this.sun.shadow.mapSize.set(QUALITY_SHADOW[q], QUALITY_SHADOW[q]);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const enable = q !== 'low';
    if (this.renderer.shadowMap.enabled !== enable) {
      this.renderer.shadowMap.enabled = enable;
      const seen = new Set<THREE.Material>();
      this.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats as THREE.Material[]) if (m && !seen.has(m)) { seen.add(m); m.needsUpdate = true; }
      });
    }
    this.resize(this.lastW, this.lastH);
  }
  private render = (alpha: number): void => {
    if (this.disposed) return;
    const sim = this.simulation; if (!sim.active) alpha = 1;
    const x = THREE.MathUtils.lerp(sim.previous.x, sim.x, alpha), z = THREE.MathUtils.lerp(sim.previous.z, sim.z, alpha), y = THREE.MathUtils.lerp(sim.previous.y, sim.y, alpha);
    this.avatar.group.position.set(x, y + 0.08, z); this.avatar.group.rotation.y = -sim.facing;
    // Model forward is -Z; a positive world yaw turns it toward +X.
    const gaitI = sim.driving ? 0 : sim.moveBlend * THREE.MathUtils.clamp(sim.pace / 4.6, 0, 1.2);
    const bob = gaitI > 0.02 ? Math.abs(Math.sin(sim.stride)) * 0.045 * Math.min(1, gaitI) : Math.sin(sim.time * 2.2) * 0.006;
    this.avatar.group.position.y += bob;
    this.avatar.animate({ phase: sim.stride, intensity: gaitI, airborne: sim.y > 0.02 && !sim.driving, dip: sim.landDip, idle: sim.time });
    this.avatar.group.visible = !sim.driving && sim.view === 'third';
    // Car body feel: pitch under accel/brake, roll in corners, bounce on crash.
    const dt = Math.max(0.001, Math.min(0.05, sim.time - this.prevSimTime || 0.016));
    this.prevSimTime = sim.time;
    const accel = sim.driving ? (sim.car.speed - this.prevSpeed) * 8 : 0;
    this.prevSpeed = sim.car.speed;
    this.car.group.position.set(sim.car.x, 0.08, sim.car.z); this.car.group.rotation.y = -sim.car.yaw;
    this.car.update(sim.car.speed, sim.car.steer, dt, sim.car.braking, {
      pitch: THREE.MathUtils.clamp(-accel * 0.012, -0.06, 0.08),
      roll: sim.skidding ? Math.sin(sim.time * 20) * 0.02 : -sim.car.steer * Math.min(0.05, Math.abs(sim.car.speed) * 0.003),
    });
    this.car.group.visible = !(sim.driving && sim.view === 'first');
    // Ped + traffic positions are owned by the simulation (braking / collisions).
    this.people.forEach((person, i) => {
      const point = sim.peds[i]; if (!point) return;
      person.actor.group.position.set(point.x, 0.08, point.z); person.actor.group.rotation.y = -point.yaw;
      person.actor.animate({ phase: point.phase, intensity: point.move, airborne: false, dip: 0, idle: sim.time + i * 1.7 });
    });
    this.traffic.forEach((vehicle, i) => {
      const p = sim.traffic[i]; if (!p) return;
      vehicle.group.position.set(p.x, 0.08, p.z); vehicle.group.rotation.y = -p.yaw;
      vehicle.update(p.speed, p.steer, dt, p.braking);
    });
    // Camera kick on fresh impacts.
    if (sim.impact && sim.impact.at !== this.lastImpactAt) { this.lastImpactAt = sim.impact.at; this.shake = Math.min(1, sim.impact.speed / 40 + 0.35); }
    this.shake *= 0.9;
    const shakeX = this.shake * Math.sin(sim.time * 70) * 0.35, shakeY = this.shake * Math.cos(sim.time * 55) * 0.25;
    const waypoint = PLACES.find(p => p.id === sim.waypoint);
    this.marker.visible = Boolean(waypoint); if (waypoint) this.marker.position.set(waypoint.x, 0.25, waypoint.z);
    if (sim.phase === 'ready') {
      this.camera.position.set(69, 52, 78); this.camera.lookAt(-7, 0, -8);
    } else if (sim.view === 'first') {
      this.camera.position.set(x + shakeX, y + (sim.driving ? 1.85 : 1.84) + shakeY, z);
      this.target.set(x + Math.sin(sim.yaw) * 10, this.camera.position.y - Math.sin(sim.pitch) * 10, z - Math.cos(sim.yaw) * 10);
      this.camera.lookAt(this.target);
    } else {
      this.target.set(x, y + 1.35, z);
      const distance = sim.driving ? 10 : 6.5;
      this.desired.set(x - Math.sin(sim.yaw) * distance, y + 3.4 + sim.pitch * 5, z + Math.cos(sim.yaw) * distance);
      this.direction.subVectors(this.desired, this.target); let cameraDistance = this.direction.length(); this.direction.normalize();
      this.ray.set(this.target, this.direction);
      for (const box of this.cameraBoxes) if (this.ray.intersectBox(box, this.hit)) cameraDistance = Math.min(cameraDistance, Math.max(0.45, this.hit.distanceTo(this.target) - 0.3));
      this.camera.position.copy(this.target).addScaledVector(this.direction, cameraDistance);
      this.camera.position.x += shakeX; this.camera.position.y += shakeY;
      this.camera.lookAt(this.target);
    }
    this.sun.position.set(x + 35, 65, z + 25); this.sun.target.position.set(x, 0, z); this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
  };
  destroy(): void {
    this.disposed = true; this.loop.stop(); this.clearInput();
    this.scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.marker.geometry.dispose(); (this.marker.material as THREE.Material).dispose();
    this.sun.shadow.dispose(); this.kit.dispose(); this.renderer.dispose();
    this.scene.clear();
  }
}
