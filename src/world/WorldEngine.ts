import { VEHICLE_KINDS, VEHICLES, type VehicleKind } from './Vehicles';
import * as THREE from 'three';
import { GameLoop } from '../game/GameLoop';
import type { Theme } from '../game/State';
import { bbSound, ttSound, unlockAudio } from '../game/Sound';
import { AssetKit, buildMap, type Stickman, type Vehicle } from './Assets';
import { BUILDINGS, GAME_CENTER, HOOP, PLACES, RIM, TABLE, seeded } from './Map';
import { Simulation, type WorldAction, type WorldSnapshot } from './Simulation';
import type { TTShot } from './TableTennis';

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
  private car: Vehicle;
  private readonly fleet = new Map<VehicleKind, Vehicle>();
  private readonly parked: Vehicle[] = [];
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x555555, 2.2);
  private readonly marker: THREE.Mesh;
  private readonly ttBall: THREE.Mesh;
  private readonly ttPaddleYou = new THREE.Group();
  private readonly ttPaddleAi = new THREE.Group();
  private readonly ttTrail: THREE.Line;
  private ttTrailPos: Float32Array;
  private lastTTEvents = 0;
  private readonly bbBall: THREE.Mesh;
  private readonly bbRim: THREE.Mesh;
  private readonly bbNet: THREE.LineSegments;
  private bbNetPos: Float32Array;
  private lastBBEvents = 0;
  private readonly loop: GameLoop;
  private readonly people: { actor: Stickman }[] = [];
  private readonly traffic: Vehicle[] = [];
  private shake = 0; private lastImpactAt = -10; private prevSimTime = 0;
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
    for (const kind of VEHICLE_KINDS) {
      const vehicle = this.kit.car(kind, kind === 'sport' || kind === 'suv');
      vehicle.group.visible = false; this.fleet.set(kind, vehicle); this.scene.add(vehicle.group);
    }
    this.car = this.fleet.get('car')!;
    const random = seeded(8008);
    for (let i = 0; i < 16; i++) {
      const actor = this.kit.stickman(false, i); actor.group.scale.setScalar(0.9 + random() * 0.15);
      this.scene.add(actor.group); this.people.push({ actor });
    }
    for (let i = 0; i < 6; i++) {
      const vehicle = this.kit.car(VEHICLE_KINDS[i], i % 2 === 0);
      this.scene.add(vehicle.group); this.traffic.push(vehicle);
    }
    for (const [x, z, type] of [[-11, -38, 'van'], [11, -54, 'car'], [55, 12, 'car']] as const) {
      const parked = this.kit.car(type, true); parked.group.position.set(x, 0, z); this.scene.add(parked.group); this.parked.push(parked);
    }
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.renderOrder = 5; this.scene.add(this.marker);
    // Table tennis dynamic props (world-anchored at GAME_CENTER).
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xff6d1f, roughness: 0.35 });
    this.ttBall = new THREE.Mesh(new THREE.SphereGeometry(TABLE ? 0.05 : 0.05, 20, 14), ballMat);
    this.ttBall.castShadow = true; this.scene.add(this.ttBall);
    const paddleFace = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 24);
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xb3122e, roughness: 0.6 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.8 });
    for (const [group, flip] of [[this.ttPaddleYou, 0], [this.ttPaddleAi, Math.PI]] as const) {
      const face = new THREE.Mesh(paddleFace, faceMat); face.castShadow = true;
      face.rotation.x = Math.PI / 2 + flip * 0;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.03), handleMat);
      handle.position.y = -0.16;
      group.add(face, handle); this.scene.add(group);
    }
    this.ttTrailPos = new Float32Array(14 * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.ttTrailPos, 3));
    this.ttTrail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.ttTrail.frustumCulled = false; this.scene.add(this.ttTrail);
    // Basketball dynamic props (world-anchored at HOOP).
    const bbMat = new THREE.MeshStandardMaterial({ color: 0xe0621a, roughness: 0.55 });
    this.bbBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), bbMat);
    this.bbBall.castShadow = true;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 8, 32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
    this.bbBall.add(seam); this.scene.add(this.bbBall);
    this.bbRim = new THREE.Mesh(new THREE.TorusGeometry(RIM.r, RIM.tube, 10, 32), new THREE.MeshStandardMaterial({ color: 0xd23c1e, roughness: 0.4, metalness: 0.5 }));
    this.bbRim.rotation.x = Math.PI / 2;
    this.bbRim.position.set(HOOP.x, RIM.h, HOOP.z); this.bbRim.castShadow = true;
    this.scene.add(this.bbRim);
    this.bbNetPos = new Float32Array(8 * 2 * 3);
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.BufferAttribute(this.bbNetPos, 3));
    this.bbNet = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.85 }));
    this.bbNet.frustumCulled = false; this.scene.add(this.bbNet);
    this.setTheme('light');
    this.loop = new GameLoop(dt => {
      this.simulation.update(dt); this.hudTime += dt;
      if (this.hudTime >= 0.1) { this.hudTime = 0; this.emit(); }
    }, this.render);
    this.emit();
  }
  private emit(): void { this.publish(this.simulation.snapshot); }
  begin(): void { unlockAudio(); this.simulation.begin(); this.emit(); }
  enterTable(): void { unlockAudio(); this.simulation.enterTable(); this.lastTTEvents = this.simulation.table.events.length; this.emit(); }
  rematch(): void { unlockAudio(); this.simulation.table.reset(); this.lastTTEvents = this.simulation.table.events.length; this.emit(); }
  enterBasket(): void { unlockAudio(); this.simulation.enterBasket(); this.lastBBEvents = this.simulation.basket.events.length; this.emit(); }
  exitBasket(): void { this.simulation.exitBasket(); this.emit(); }
  resetBasket(): void { unlockAudio(); this.simulation.basket.resetStats(); this.lastBBEvents = this.simulation.basket.events.length; this.emit(); }
  basketTap(): void { unlockAudio(); if (this.simulation.mode === 'basket') this.simulation.basket.pressMeter(); }
  exitTable(): void { this.simulation.exitTable(); this.emit(); }
  tableSwing(kind?: TTShot): void { this.simulation.tableSwing(kind); }
  setTableX(x: number): void { if (this.simulation.mode === 'table') this.simulation.table.setPlayerX(x); }
  swipeShot(dx: number, dy: number): void {
    if (this.simulation.mode !== 'table') return;
    // Swipe up fast = topspin/smash, down = chop, else drive. Horizontal aims via paddle offset.
    this.simulation.table.movePlayer(dx * 0.6);
    if (dy < -40) this.simulation.tableSwing(this.simulation.table.ball.y > 1.25 ? 'smash' : 'topspin');
    else if (dy > 40) this.simulation.tableSwing('chop');
    else if (Math.abs(dx) + Math.abs(dy) > 24) this.simulation.tableSwing('drive');
  }
  start(): void { if (!this.suspended) this.loop.start(); }
  togglePause(): void { this.simulation.togglePause(); this.emit(); }
  toggleView(): void { this.simulation.toggleView(); this.emit(); }
  cycleVehicle(): void { this.simulation.cycleVehicle(); this.emit(); }
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
    const dt = Math.max(0, Math.min(0.05, sim.time - this.prevSimTime));
    this.prevSimTime = sim.time;
    const accel = sim.driving ? sim.acceleration : 0;
    for (const [kind, vehicle] of this.fleet) vehicle.group.visible = kind === sim.vehicleKind;
    this.car = this.fleet.get(sim.vehicleKind)!;
    this.car.group.position.set(sim.car.x, 0.08, sim.car.z); this.car.group.rotation.y = -sim.car.yaw;
    this.car.update(sim.car.speed, sim.car.steer, dt, sim.car.braking, {
      pitch: THREE.MathUtils.clamp(-accel * 0.012, -0.06, 0.08),
      roll: sim.skidding ? Math.sin(sim.time * 20) * 0.02 : -sim.car.steer * Math.min(0.05, Math.abs(sim.car.speed) * 0.003),
    });
    this.car.glazing.visible = !(sim.driving && sim.view === 'first');
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
    // Table tennis sounds: play only fresh sim events.
    const evts = sim.table.events;
    if (evts.length !== this.lastTTEvents) {
      for (let i = this.lastTTEvents; i < evts.length; i++) {
        const e = evts[i];
        if (e.kind === 'paddle' || e.kind === 'serve' || e.kind === 'table' || e.kind === 'net' || e.kind === 'edge' || e.kind === 'smash' || e.kind === 'topspin' || e.kind === 'point') ttSound(e.kind, e.speedKmh);
      }
      this.lastTTEvents = evts.length;
    }
    // Table tennis actors: ball, paddles, trail, player + AI placement.
    const inTable = sim.mode === 'table';
    this.ttBall.visible = inTable; this.ttPaddleYou.visible = inTable; this.ttPaddleAi.visible = inTable; this.ttTrail.visible = inTable;
    if (inTable) {
      const gx = GAME_CENTER.x, gz = GAME_CENTER.z;
      const t = sim.table;
      this.ttBall.position.set(gx + t.ball.x, t.ball.y, gz + t.ball.z);
      const ballScale = 1 + Math.min(0.6, Math.hypot(t.vel.x, t.vel.y, t.vel.z) * 0.03);
      this.ttBall.scale.setScalar(ballScale);
      this.ttPaddleAi.position.set(gx + t.ai.x, t.ai.y, gz + t.ai.z);
      this.ttPaddleAi.rotation.set(0.5 + t.swingAi * 1.1, Math.PI, t.ai.x * 0.3);
      const trail = t.trail;
      for (let i = 0; i < 14; i++) {
        const p = trail[Math.max(0, trail.length - 14 + i)] ?? t.ball;
        this.ttTrailPos[i * 3] = gx + p.x; this.ttTrailPos[i * 3 + 1] = p.y; this.ttTrailPos[i * 3 + 2] = gz + p.z;
      }
      this.ttTrail.geometry.attributes.position.needsUpdate = true;
      // First-person: hide your own avatar (head would block the camera).
      this.avatar.group.visible = false;
      const opp = this.people[0];
      if (opp) {
        opp.actor.group.position.set(gx + t.ai.x * 0.9, 0.08, gz + t.ai.z - 0.55);
        opp.actor.group.rotation.y = Math.PI;
        opp.actor.animate({ phase: sim.time * 3, intensity: 0.25, airborne: false, dip: 0, idle: sim.time });
      }
    }
    // Basketball sounds + actors.
    const inBasket = sim.mode === 'basket';
    const bbEvts = sim.basket.events;
    if (bbEvts.length !== this.lastBBEvents) {
      for (let i = this.lastBBEvents; i < bbEvts.length; i++) {
        const e = bbEvts[i];
        bbSound(e.kind, e.speedKmh);
      }
      this.lastBBEvents = bbEvts.length;
    }
    this.bbBall.visible = inBasket; this.bbRim.visible = inBasket; this.bbNet.visible = inBasket;
    if (inBasket) {
      const b = sim.basket;
      this.bbBall.position.set(HOOP.x + b.ball.x, b.ball.y, HOOP.z + b.ball.z);
      this.bbBall.rotation.x += Math.max(0.02, b.snapshot.speedKmh * 0.002);
      this.bbBall.rotation.z -= Math.max(0.01, b.snapshot.speedKmh * 0.001);
      // Rim shake on contact, net sway on swish.
      this.bbRim.position.set(
        HOOP.x + Math.sin(sim.time * 55) * 0.03 * b.rimShake,
        RIM.h + Math.abs(Math.cos(sim.time * 47)) * 0.02 * b.rimShake,
        HOOP.z + Math.cos(sim.time * 52) * 0.03 * b.rimShake);
      const sway = b.swish * Math.sin(sim.time * 28) * 0.06;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.bbNetPos[i * 6] = HOOP.x + Math.cos(a) * RIM.r;
        this.bbNetPos[i * 6 + 1] = RIM.h;
        this.bbNetPos[i * 6 + 2] = HOOP.z + Math.sin(a) * RIM.r;
        this.bbNetPos[i * 6 + 3] = HOOP.x + Math.cos(a) * 0.12 + sway;
        this.bbNetPos[i * 6 + 4] = RIM.h - 0.42;
        this.bbNetPos[i * 6 + 5] = HOOP.z + Math.sin(a) * 0.12;
      }
      this.bbNet.geometry.attributes.position.needsUpdate = true;
      this.avatar.group.visible = false;
    }
    // Camera kick on fresh impacts.
    if (sim.impact && sim.impact.at !== this.lastImpactAt) { this.lastImpactAt = sim.impact.at; this.shake = Math.min(1, sim.impact.speed / 40 + 0.35); }
    this.shake *= 0.9;
    const shakeX = this.shake * Math.sin(sim.time * 70) * 0.35, shakeY = this.shake * Math.cos(sim.time * 55) * 0.25;
    const waypoint = PLACES.find(p => p.id === sim.waypoint);
    // Hide the waypoint ring during a match — it sits on the court otherwise.
    this.marker.visible = Boolean(waypoint) && !inTable && !inBasket;
    if (waypoint && !inTable && !inBasket) this.marker.position.set(waypoint.x, 0.25, waypoint.z);
    if (inBasket) {
      // Shooter POV from the current random spot: stand behind the release point, eyes on the rim.
      const s = sim.basket.spot;
      const sd = Math.max(0.5, Math.hypot(s.x, s.z));
      const cd = sd + 2.2;
      this.camera.position.set(HOOP.x + (s.x / sd) * cd, 2.0, HOOP.z + (s.z / sd) * cd);
      this.target.set(HOOP.x, 2.5, HOOP.z);
      this.camera.lookAt(this.target);
      this.sun.position.set(HOOP.x + 20, 65, HOOP.z + 15); this.sun.target.position.set(HOOP.x, 0, HOOP.z); this.sun.target.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (inTable) {
      const gx = GAME_CENTER.x, gz = GAME_CENTER.z;
      const t = sim.table;
      // First-person: eyes just behind your end, gaze tracks the ball.
      this.camera.position.set(gx + t.player.x * 0.85 + shakeX, 1.72 + shakeY, gz + t.player.z + 0.45);
      this.target.set(gx + t.ball.x * 0.55, Math.max(0.6, t.ball.y * 0.85), gz - 1.2);
      this.camera.lookAt(this.target);
      // Bat pinned into view: bottom-center, follows your lateral position,
      // punches forward on every swing so hits feel connected.
      this.direction.subVectors(this.target, this.camera.position).normalize();
      this.desired.copy(this.camera.position)
        .addScaledVector(this.direction, 0.62 - t.swingYou * 0.12)
        .add(this.hit.set(t.player.x * 0.12, -0.3 + t.swingYou * 0.08, 0));
      this.ttPaddleYou.position.copy(this.desired);
      this.ttPaddleYou.lookAt(this.camera.position);
      this.ttPaddleYou.rotateX(-0.35 - t.swingYou * 0.9);
      this.sun.position.set(gx + 20, 65, gz + 15); this.sun.target.position.set(gx, 0, gz); this.sun.target.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (sim.phase === 'ready') {
      this.camera.position.set(69, 52, 78); this.camera.lookAt(-7, 0, -8);
    } else if (sim.view === 'first') {
      if (sim.driving) {
        this.car.group.updateMatrixWorld(true);
        this.camera.position.copy(this.car.eye); this.car.body.localToWorld(this.camera.position);
        this.camera.position.x += x - sim.car.x + shakeX * 0.15;
        this.camera.position.z += z - sim.car.z;
        this.camera.position.y += shakeY * 0.15;
      } else this.camera.position.set(x + shakeX, y + 1.84 + shakeY, z);
      this.target.copy(this.camera.position).add(this.direction.set(Math.sin(sim.yaw) * 10, -Math.sin(sim.pitch) * 10, -Math.cos(sim.yaw) * 10));
      this.camera.lookAt(this.target);
    } else {
      this.target.set(x, y + 1.35, z);
      const distance = sim.driving ? VEHICLES[sim.vehicleKind].length + 6 : 6.5;
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
