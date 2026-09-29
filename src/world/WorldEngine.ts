import * as THREE from 'three';
import { GameLoop } from '../game/GameLoop';
import { AssetKit, buildMap, type Stickman } from './Assets';
import { BUILDINGS, PLACES, seeded, type Point } from './Map';
import { routePoint, Simulation, type WorldAction, type WorldSnapshot } from './Simulation';

export class WorldEngine {
  readonly simulation = new Simulation();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.12, 340);
  private readonly kit: AssetKit;
  private readonly avatar: Stickman;
  private readonly car: THREE.Group;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x555555, 2.2);
  private readonly marker: THREE.Mesh;
  private readonly loop: GameLoop;
  private readonly people: { actor: Stickman; route: Point[]; offset: number; speed: number }[] = [];
  private readonly traffic: { mesh: THREE.Group; offset: number; speed: number }[] = [];
  private readonly trafficRoute = [{ x: -76, z: -76 }, { x: 76, z: -76 }, { x: 76, z: 76 }, { x: -76, z: 76 }];
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
    this.car = this.kit.car(); this.scene.add(this.car);
    const random = seeded(8008);
    for (let i = 0; i < 16; i++) {
      const east = i % 2 === 0, north = i % 4 < 2;
      const x1 = east ? 13 : -73, x2 = east ? 73 : -13;
      const z1 = north ? -73 : 13, z2 = north ? -13 : 73;
      const route = [{ x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 }];
      if (i % 3 === 0) route.reverse();
      const actor = this.kit.stickman(false, i); actor.group.scale.setScalar(0.9 + random() * 0.15);
      this.scene.add(actor.group); this.people.push({ actor, route, offset: random() * 240, speed: 0.9 + random() * 0.6 });
    }
    for (let i = 0; i < 6; i++) {
      const mesh = this.kit.car(i === 0 ? 'bus' : i % 3 === 0 ? 'van' : 'car', i % 2 === 0);
      this.scene.add(mesh); this.traffic.push({ mesh, offset: i * 100 + 25, speed: 7 });
    }
    for (const [x, z, type] of [[-11, -38, 'van'], [11, -54, 'car'], [55, 12, 'car']] as const) {
      const parked = this.kit.car(type, true); parked.position.set(x, 0, z); this.scene.add(parked);
    }
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
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
  setTheme(theme: 'light' | 'dark'): void {
    const dark = theme === 'dark'; const color = dark ? 0x242424 : 0xdadada;
    this.scene.background = new THREE.Color(color); this.scene.fog = new THREE.Fog(color, 90, 255);
    this.ambient.intensity = dark ? 1.1 : 2.2; this.sun.intensity = dark ? 1.5 : 3;
    if (this.marker) (this.marker.material as THREE.MeshBasicMaterial).color.setHex(dark ? 0xffffff : 0x111111);
  }
  resize(width: number, height: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height); this.camera.updateProjectionMatrix();
  }
  private render = (alpha: number): void => {
    if (this.disposed) return;
    const sim = this.simulation; if (!sim.active) alpha = 1;
    const x = THREE.MathUtils.lerp(sim.previous.x, sim.x, alpha), z = THREE.MathUtils.lerp(sim.previous.z, sim.z, alpha), y = THREE.MathUtils.lerp(sim.previous.y, sim.y, alpha);
    this.avatar.group.position.set(x, y + 0.08, z); this.avatar.group.rotation.y = -sim.facing;
    // Model forward is -Z; a positive world yaw turns it toward +X.
    this.avatar.animate(sim.distance * 2, sim.pace > 0.2 && !sim.driving);
    this.avatar.group.visible = !sim.driving && sim.view === 'third';
    this.car.position.set(sim.car.x, 0.08, sim.car.z); this.car.rotation.y = -sim.car.yaw;
    this.car.visible = !(sim.driving && sim.view === 'first');
    for (const person of this.people) {
      const point = routePoint(person.route, person.offset + sim.time * person.speed);
      person.actor.group.position.set(point.x, 0.08, point.z); person.actor.group.rotation.y = -point.yaw;
      person.actor.animate(sim.time * person.speed * 3, sim.active);
    }
    for (const traffic of this.traffic) {
      const p = routePoint(this.trafficRoute, traffic.offset + sim.time * traffic.speed);
      traffic.mesh.position.set(p.x, 0.08, p.z); traffic.mesh.rotation.y = -p.yaw;
    }
    const waypoint = PLACES.find(p => p.id === sim.waypoint);
    this.marker.visible = Boolean(waypoint); if (waypoint) this.marker.position.set(waypoint.x, 0.25, waypoint.z);
    if (sim.phase === 'ready') {
      this.camera.position.set(69, 52, 78); this.camera.lookAt(-7, 0, -8);
    } else if (sim.view === 'first') {
      this.camera.position.set(x, y + (sim.driving ? 1.85 : 1.84), z);
      this.target.set(x + Math.sin(sim.yaw) * 10, this.camera.position.y - Math.sin(sim.pitch) * 10, z - Math.cos(sim.yaw) * 10);
      this.camera.lookAt(this.target);
    } else {
      this.target.set(x, y + 1.35, z);
      const distance = sim.driving ? 10 : 6.5;
      this.desired.set(x - Math.sin(sim.yaw) * distance, y + 3.4 + sim.pitch * 5, z + Math.cos(sim.yaw) * distance);
      this.direction.subVectors(this.desired, this.target); let cameraDistance = this.direction.length(); this.direction.normalize();
      this.ray.set(this.target, this.direction);
      for (const box of this.cameraBoxes) if (this.ray.intersectBox(box, this.hit)) cameraDistance = Math.min(cameraDistance, Math.max(0.45, this.hit.distanceTo(this.target) - 0.3));
      this.camera.position.copy(this.target).addScaledVector(this.direction, cameraDistance); this.camera.lookAt(this.target);
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
