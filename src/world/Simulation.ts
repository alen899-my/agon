import { bodyContact, boundaryContact, circleContact, vehicleBody, type Body, type Contact } from './Collision';
import { VEHICLES, VEHICLE_KINDS, type VehicleKind } from './Vehicles';
import { GAME_CENTER, HOOP, intersects, LIMIT, SOLIDS, PARKED_CARS, PLACES, PROPS, TRAFFIC_ROUTE, circleHit, seeded, type Point } from './Map';
import { TableTennisSim, type TTShot, type TTSnapshot } from './TableTennis';
import { BasketballSim, type BBSnapshot } from './Basketball';

export type WorldAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'turnLeft' | 'turnRight' | 'handbrake';
export type View = 'third' | 'first';
export interface Impact { speed: number; with: string; at: number }
export interface TrafficCar { kind: VehicleKind; x: number; z: number; yaw: number; speed: number; offset: number; base: number; steer: number; wheelSpin: number; braking: boolean; prevYaw: number }
export interface ParkedVehicle { kind: VehicleKind; x: number; z: number; yaw: number }
export interface VehicleTarget { type: 'player' | 'parked' | 'traffic'; index: number; kind: VehicleKind; x: number; z: number; yaw: number; speed: number; dist: number; enterable: boolean; reason: string | null }
export interface Ped { x: number; z: number; yaw: number; route: Point[]; dist: number; speed: number; phase: number; seed: number; move: number; cur: number; scaredUntil: number }
export interface SnapshotCar { x: number; z: number; yaw: number; speed: number; steer: number; wheelSpin: number; braking: boolean }
export type PlayMode = 'roam' | 'table' | 'basket';
export interface WorldSnapshot {
  phase: 'ready' | 'playing'; paused: boolean; view: View; driving: boolean;
  x: number; z: number; yaw: number; speed: number; distance: number;
  location: string; discovered: string[]; waypoint: string | null; nearbyCar: boolean;
  nearbyVehicleKind: VehicleKind | null; nearbyVehicleLabel: string | null; enterHint: string | null;
  damage: number; impact: Impact | null; frontDistance: number; frontBlocked: boolean;
  vehicleKind: VehicleKind; acceleration: number; crashed: boolean; skidding: boolean; car: SnapshotCar;
  transition: number;
  parked: ParkedVehicle[];
  stridePhase: number; moveBlend: number; airborne: boolean; landDip: number;
  traffic: (SnapshotCar)[];
  peds: { x: number; z: number; yaw: number; phase: number; moving: number }[];
  mode: PlayMode; nearTable: boolean; nearHoop: boolean; table: TTSnapshot | null;
  tableFlags: { topspin: boolean; smash: boolean; netCord: boolean; edge: boolean };
  basket: BBSnapshot | null;
  basketFlags: { played: boolean; swish: boolean; streak3: boolean };
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

const PED_ROUTES: Point[][] = [];
{
  const rng = seeded(8008);
  for (let i = 0; i < 16; i++) {
    const east = i % 2 === 0, north = i % 4 < 2;
    const x1 = east ? 13 : -73, x2 = east ? 73 : -13;
    const z1 = north ? -73 : 13, z2 = north ? -13 : 73;
    const route = [{ x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 }];
    if (i % 3 === 0) route.reverse();
    PED_ROUTES.push(route);
  }
  void rng;
}

/** Browser-independent world rules. X/Z use meters, Y is height above pavement. */
export class Simulation {
  x = 12; z = 34; y = 0; vy = 0;
  previous = { x: this.x, z: this.z, y: 0 };
  yaw = -0.25; pitch = 0.13; facing = 0;
  view: View = 'third'; phase: 'ready' | 'playing' = 'ready'; paused = false;
  time = 0; distance = 0; pace = 0;
  driving = false;
  vehicleKind: VehicleKind = 'car';
  acceleration = 0;
  lateralSpeed = 0;
  /** Smooth GTA enter/exit: locks drive inputs while the avatar slips through the door. */
  transition = 0;
  private lookUntil = 0;
  car = { x: 9, z: 29, yaw: 0, speed: 0, steer: 0, wheelSpin: 0, braking: false };
  /** Every parked car in the world is stealable. Includes your previously driven cars. */
  parked: ParkedVehicle[] = [
    { kind: 'van', x: -11, z: -38, yaw: 0 },
    { kind: 'car', x: 11, z: -54, yaw: 0 },
    { kind: 'car', x: 55, z: 12, yaw: 0 },
    { kind: 'taxi', x: 24, z: -4, yaw: Math.PI / 2 },
    { kind: 'muscle', x: -32, z: 14, yaw: 0.3 },
    { kind: 'police', x: 38, z: 34, yaw: -Math.PI / 2 },
    { kind: 'pickup', x: -50, z: -8, yaw: Math.PI / 2 },
    { kind: 'ambulance', x: 48, z: -28, yaw: 0 },
    { kind: 'super', x: 18, z: 48, yaw: -0.4 },
    { kind: 'bus', x: 30, z: 62, yaw: Math.PI / 2 },
    { kind: 'hatch', x: -14, z: 52, yaw: 1.2 },
    { kind: 'fire', x: -58, z: 60, yaw: 0 },
  ];
  waypoint: string | null = 'plaza';
  readonly discovered = new Set<string>();
  // --- realistic-physics state (one by one) ---
  damage = 0;
  impact: Impact | null = null;
  frontDistance = 999;
  frontBlocked = false;
  crashUntil = 0;
  skidding = false;
  traffic: TrafficCar[] = [];
  peds: Ped[] = [];
  // --- character locomotion: smoothed velocity, stride phase, landing dip ---
  pvx = 0; pvz = 0; stride = 0; moveBlend = 0; landDip = 0;
  // --- game center: table tennis + basketball modes ---
  mode: PlayMode = 'roam';
  table = new TableTennisSim();
  basket = new BasketballSim();
  private savedPos = { x: 12, z: 34, yaw: -0.25 };
  private keys = new Map<string, WorldAction>();
  private stick = { x: 0, y: 0 };
  private jumpPressed = false;
  constructor() {
    const rng = seeded(9001);
    // A living street: 8 looping cars covering the full catalog, not just the first six.
    const streetCast: VehicleKind[] = ['car', 'taxi', 'suv', 'bus', 'sport', 'pickup', 'police', 'boxTruck'];
    for (let i = 0; i < 8; i++) this.traffic.push({ kind: streetCast[i % streetCast.length], ...routePoint(TRAFFIC_ROUTE, i * 76 + 25), speed: 7, offset: i * 76 + 25, base: 7, steer: 0, wheelSpin: 0, braking: false, prevYaw: 0 });
    for (let i = 0; i < 16; i++) {
      const speed = 0.9 + rng() * 0.6;
      this.peds.push({ x: 0, z: 0, yaw: 0, route: PED_ROUTES[i], dist: rng() * 240, speed, phase: rng() * 6.28, seed: rng(), move: 1, cur: speed, scaredUntil: 0 });
    }
    this.syncCrowd(0);
  }
  get active(): boolean { return this.phase === 'playing' && !this.paused; }
  /** GTA rule: every world vehicle is enterable. Nearest within reach, traffic must be stopped/slow. */
  nearestVehicle(): VehicleTarget | null {
    const R = 6.5;
    const candidates: VehicleTarget[] = [];
    const pd = Math.hypot(this.x - this.car.x, this.z - this.car.z);
    candidates.push({ type: 'player', index: -1, kind: this.vehicleKind, x: this.car.x, z: this.car.z, yaw: this.car.yaw, speed: Math.abs(this.car.speed), dist: pd, enterable: pd < R, reason: pd < R ? null : 'too far' });
    this.parked.forEach((p, i) => {
      const d = Math.hypot(this.x - p.x, this.z - p.z);
      candidates.push({ type: 'parked', index: i, kind: p.kind, x: p.x, z: p.z, yaw: p.yaw, speed: 0, dist: d, enterable: d < R, reason: d < R ? null : 'too far' });
    });
    this.traffic.forEach((t, i) => {
      const d = Math.hypot(this.x - t.x, this.z - t.z);
      const slow = Math.abs(t.speed) < 3.5;
      candidates.push({ type: 'traffic', index: i, kind: t.kind, x: t.x, z: t.z, yaw: t.yaw, speed: Math.abs(t.speed), dist: d, enterable: d < R && slow, reason: d >= R ? 'too far' : slow ? null : 'moving — block it first' });
    });
    candidates.sort((a, b) => a.dist - b.dist);
    // Prefer an enterable car; otherwise return the closest so the HUD can hint "stop it first".
    return candidates.find(c => c.enterable) ?? (candidates[0]?.dist !== undefined && candidates[0].dist < 9 ? candidates[0] : null);
  }
  get nearbyCar(): boolean { return !!this.nearestVehicle()?.enterable; }
  get nearTable(): boolean { return Math.hypot(this.x - GAME_CENTER.x, this.z - GAME_CENTER.z) < 8; }
  get nearHoop(): boolean { return Math.hypot(this.x - HOOP.x, this.z - (HOOP.z - 4.2)) < 7; }
  enterBasket(): boolean {
    if (!this.active || this.driving || this.mode !== 'roam' || !this.nearHoop) return false;
    this.mode = 'basket';
    this.savedPos = { x: this.x, z: this.z, yaw: this.yaw };
    this.basket.setupHold();
    this.clearInput();
    return true;
  }
  exitBasket(): boolean {
    if (this.mode !== 'basket') return false;
    this.mode = 'roam';
    this.x = this.savedPos.x; this.z = this.savedPos.z; this.yaw = this.savedPos.yaw;
    this.previous = { x: this.x, z: this.z, y: this.y };
    this.clearInput();
    return true;
  }
  enterTable(): boolean {
    if (!this.active || this.driving || this.mode === 'table' || !this.nearTable) return false;
    this.mode = 'table';
    this.savedPos = { x: this.x, z: this.z, yaw: this.yaw };
    this.table.reset();
    this.clearInput();
    this.discovered.add('game-center');
    return true;
  }
  exitTable(): boolean {
    if (this.mode !== 'table') return false;
    this.mode = 'roam';
    this.x = this.savedPos.x; this.z = this.savedPos.z; this.yaw = this.savedPos.yaw;
    this.previous = { x: this.x, z: this.z, y: this.y };
    this.clearInput();
    return true;
  }
  tableSwing(kind?: TTShot): boolean {
    if (this.mode !== 'table') return false;
    if (kind) return this.table.swingPlayer(kind);
    // Modifier keys decide shot: forward=topspin, back=chop, sprint=smash.
    if (this.held('sprint')) return this.table.swingPlayer('smash');
    if (this.held('forward')) return this.table.swingPlayer('topspin');
    if (this.held('back')) return this.table.swingPlayer('chop');
    return this.table.swingPlayer('drive');
  }
  get crashed(): boolean { return this.time < this.crashUntil; }
  private spawnReplacementTraffic(): void {
    // Keep the street alive after a steal: respawn far from the player so it never pops in.
    const kinds: VehicleKind[] = ['car', 'hatch', 'taxi', 'suv', 'sport', 'muscle', 'super', 'minivan', 'van', 'police', 'ambulance', 'boxTruck'];
    const kind = kinds[Math.floor(((this.time * 13.7) % 1 + 1) % 1 * kinds.length) % kinds.length];
    let best = 0, bestDist = -1;
    for (let k = 0; k < 8; k++) {
      const offset = ((this.time * 7 + k * 79 + this.traffic.length * 37) % 608 + 608) % 608;
      const p = routePoint(TRAFFIC_ROUTE, offset);
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d > bestDist) { bestDist = d; best = offset; }
    }
    const p = routePoint(TRAFFIC_ROUTE, best);
    this.traffic.push({ kind, x: p.x, z: p.z, yaw: p.yaw, speed: 0, offset: best, base: 6 + (best % 3), steer: 0, wheelSpin: 0, braking: false, prevYaw: p.yaw });
  }
  get snapshot(): WorldSnapshot {
    let location = 'Civic Avenue', best = 23;
    for (const place of PLACES) {
      const distance = Math.hypot(this.x - place.x, this.z - place.z);
      if (distance < best) { best = distance; location = place.name; }
    }
    const near = this.driving ? null : this.nearestVehicle();
    const enterHint = this.driving ? 'E — exit'
      : !near ? null
      : !near.enterable ? `${VEHICLES[near.kind].name} ${near.reason ?? ''}`.trim()
      : `E — drive ${VEHICLES[near.kind].name}`;
    return { phase: this.phase, paused: this.paused, view: this.view, driving: this.driving,
      x: this.x, z: this.z, yaw: this.yaw, speed: Math.round(Math.abs(this.driving ? this.car.speed : this.pace) * 3.6),
      distance: Math.floor(this.distance), location, discovered: [...this.discovered], waypoint: this.waypoint, nearbyCar: this.nearbyCar,
      nearbyVehicleKind: near?.enterable ? near.kind : null,
      nearbyVehicleLabel: near ? `${VEHICLES[near.kind].name} · ${VEHICLES[near.kind].inspiredBy}` : null,
      enterHint,
      damage: Math.round(this.damage), impact: this.impact, frontDistance: Math.round(this.frontDistance),
      vehicleKind: this.vehicleKind, acceleration: this.acceleration, frontBlocked: this.frontBlocked, crashed: this.crashed, skidding: this.skidding,
      car: { x: this.car.x, z: this.car.z, yaw: this.car.yaw, speed: this.car.speed, steer: this.car.steer, wheelSpin: this.car.wheelSpin, braking: this.car.braking },
      transition: this.transition,
      parked: this.parked.map(p => ({ ...p })),
      stridePhase: this.stride, moveBlend: this.moveBlend, airborne: this.y > 0.02, landDip: Math.max(0, Math.min(1, this.landDip)),
      traffic: this.traffic.map(t => ({ x: t.x, z: t.z, yaw: t.yaw, speed: t.speed, steer: t.steer, wheelSpin: t.wheelSpin, braking: t.braking })),
      peds: this.peds.map(p => ({ x: p.x, z: p.z, yaw: p.yaw, phase: p.phase, moving: p.move })),
      mode: this.mode, nearTable: this.nearTable, nearHoop: this.nearHoop,
      table: this.mode === 'table' ? this.table.snapshot : null,
      tableFlags: { ...this.table.flags },
      basket: this.mode === 'basket' ? this.basket.snapshot : null,
      basketFlags: { played: this.basket.attempts > 0, swish: this.basket.swishes > 0, streak3: this.basket.best >= 3 } };
  }
  begin(): void { this.phase = 'playing'; this.clearInput(); }
  clearInput(): void { this.keys.clear(); this.stick = { x: 0, y: 0 }; this.jumpPressed = false; this.pvx = 0; this.pvz = 0; }
  setInput(action: WorldAction, down: boolean, source: string): void {
    if (!down) { this.keys.delete(source); return; }
    if (!this.active) return;
    if (action === 'jump' && !this.keys.has(source)) this.jumpPressed = true;
    this.keys.set(source, action);
  }
  setStick(x: number, y: number): void {
    if (!this.active) return;
    const length = Math.max(1, Math.hypot(x, y)); this.stick = { x: x / length, y: y / length };
  }
  look(dx: number, dy: number): void {
    if (!this.active) return;
    this.lookUntil = this.time + 3;
    this.yaw += dx * 0.004; this.pitch = clamp(this.pitch + dy * 0.003, -0.7, 0.85);
  }
  toggleView(): void { this.view = this.view === 'third' ? 'first' : 'third'; if (this.driving) { this.yaw = this.car.yaw; this.pitch = 0.08; } }
  togglePause(): void { if (this.phase === 'playing') { this.paused = !this.paused; this.clearInput(); } }
  cycleVehicle(): boolean {
    if (!this.active || this.mode !== 'roam' || !this.driving || Math.abs(this.car.speed) > 0.2 || this.transition > 0) return false;
    const next = VEHICLE_KINDS[(VEHICLE_KINDS.indexOf(this.vehicleKind) + 1) % VEHICLE_KINDS.length];
    if (Math.abs(this.lateralSpeed) > 0.2 || this.contact(vehicleBody(this.car.x, this.car.z, this.car.yaw, next))) return false;
    this.vehicleKind = next; this.lateralSpeed = 0; return true;
  }
  repair(): void { this.damage = 0; }
  interact(): boolean {
    if (!this.active) return false;
    if (this.mode !== 'roam') return false;
    if (this.transition > 0) return false;
    if (!this.driving && this.nearTable) return this.enterTable();
    if (!this.driving && this.nearHoop) return this.enterBasket();
    if (!this.driving) {
      // GTA-style: step into the nearest enterable world vehicle — your old ride stays parked.
      const target = this.nearestVehicle();
      if (!target || !target.enterable) return false;
      if (target.type !== 'player') {
        this.parked.push({ kind: this.vehicleKind, x: this.car.x, z: this.car.z, yaw: this.car.yaw });
        if (this.parked.length > 28) this.parked.shift();
      }
      if (target.type === 'parked') {
        const [p] = this.parked.splice(target.index, 1);
        this.vehicleKind = p.kind;
        this.car = { x: p.x, z: p.z, yaw: p.yaw, speed: 0, steer: 0, wheelSpin: 0, braking: false };
        // Old ride stays parked (pushed above) — straight GTA swap, net +0.
      } else if (target.type === 'traffic') {
        const t = this.traffic[target.index];
        this.vehicleKind = t.kind;
        this.car = { x: t.x, z: t.z, yaw: t.yaw, speed: 0, steer: 0, wheelSpin: 0, braking: false };
        this.traffic.splice(target.index, 1);
        this.spawnReplacementTraffic();
      }
      this.driving = true; this.x = this.car.x; this.z = this.car.z; this.y = this.vy = 0;
      this.yaw = this.car.yaw; this.pitch = 0.12;
      this.transition = 0.35;
    } else {
      // Door candidates follow the vehicle heading and must clear all solid objects.
      const reach = VEHICLES[this.vehicleKind].length / 2 + 0.8;
      const fx = Math.sin(this.car.yaw), fz = -Math.cos(this.car.yaw);
      const rx = Math.cos(this.car.yaw), rz = Math.sin(this.car.yaw);
      const offsets = [[1.9, 0], [-1.9, 0], [1.9, -1.5], [-1.9, -1.5], [0, reach], [0, -reach]];
      const exit = offsets.map(([right, forward]) => ({ x: this.car.x + rx * right + fx * forward, z: this.car.z + rz * right + fz * forward }))
        .find(p => !this.walkBlocked(p.x, p.z));
      if (!exit) return false;
      this.driving = false; this.lateralSpeed = 0; this.acceleration = 0; this.skidding = false; this.x = exit.x; this.z = exit.z; this.car.speed = 0; this.car.steer = 0; this.car.braking = false;
      this.pvx = 0; this.pvz = 0;
      this.transition = 0.3;
    }
    this.previous = { x: this.x, z: this.z, y: this.y }; this.clearInput(); return true;
  }
  private held(action: WorldAction): boolean { return [...this.keys.values()].includes(action); }
  /** Front obstacle probe: narrow corridor ahead of the bumper. */
  probeFront(x: number, z: number, yaw: number): { distance: number; blocked: boolean; label: string | null } {
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const bumper = VEHICLES[this.vehicleKind].length / 2 + 0.05;
    for (let distance = 0.125; distance <= 13; distance += 0.25) {
      const hit = this.contact({ x: x + fx * (bumper + distance), z: z + fz * (bumper + distance), yaw, halfWidth: 1.12, halfLength: 0.125 });
      if (hit) return { distance: Math.max(0, distance - 0.125), blocked: distance < 6, label: hit.label };
    }
    return { distance: 999, blocked: false, label: null };
  }

  private contact(body: Body, ignore?: TrafficCar, includePlayer = false): (Contact & { label: string }) | null {
    const boundary = boundaryContact(body, LIMIT);
    if (boundary) return { ...boundary, label: 'boundary' };
    for (const box of SOLIDS) {
      const hit = bodyContact(body, { x: box.x, z: box.z, yaw: 0, halfWidth: box.w / 2, halfLength: box.d / 2 });
      if (hit) return { ...hit, label: 'building' };
    }
    for (const p of PARKED_CARS) {
      const hit = bodyContact(body, vehicleBody(p.x, p.z, 0, p.label === 'parked-van' ? 'van' : 'car'));
      if (hit) return { ...hit, label: p.label ?? 'parked car' };
    }
    // Dynamic parked fleet (includes stolen-car leftovers + your old rides).
    for (const p of this.parked) {
      const hit = bodyContact(body, vehicleBody(p.x, p.z, p.yaw, p.kind));
      if (hit) return { ...hit, label: 'parked car' };
    }
    // Your last ride stays solid while you are on foot.
    if (!this.driving) {
      const hit = bodyContact(body, vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind));
      if (hit) return { ...hit, label: 'parked car' };
    }
    for (const t of this.traffic) {
      if (t === ignore) continue;
      const hit = bodyContact(body, vehicleBody(t.x, t.z, t.yaw, t.kind));
      if (hit) return { ...hit, label: 'traffic' };
    }
    for (const p of PROPS) {
      const hit = circleContact(body, p.x, p.z, p.r);
      if (hit) return { ...hit, label: p.label ?? 'prop' };
    }
    if (includePlayer) {
      const hit = bodyContact(body, vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind));
      if (hit) return { ...hit, label: 'player car' };
      if (!this.driving) {
        const ped = circleContact(body, this.x, this.z, 0.5);
        if (ped) return { ...ped, label: 'player' };
      }
    }
    return null;
  }
  private walkBlocked(x: number, z: number): boolean {
    return Math.abs(x) + 0.48 >= LIMIT || Math.abs(z) + 0.48 >= LIMIT || intersects(x, z, 0.48) ||
      !!circleContact(vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind), x, z, 0.48) ||
      PARKED_CARS.some(p => circleContact(vehicleBody(p.x, p.z, 0, p.label === 'parked-van' ? 'van' : 'car'), x, z, 0.48)) ||
      this.parked.some(p => circleContact(vehicleBody(p.x, p.z, p.yaw, p.kind), x, z, 0.48)) ||
      this.traffic.some(t => circleContact(vehicleBody(t.x, t.z, t.yaw, t.kind), x, z, 0.48)) ||
      PROPS.some(p => circleHit(x, z, 0.48, p.x, p.z, p.r));
  }
  /** Sweep translation AND rotation; only commit non-overlapping poses. */
  private moveCar(dt: number, wantedYaw: number): void {
    let vx = Math.sin(wantedYaw) * this.car.speed + Math.cos(wantedYaw) * this.lateralSpeed;
    let vz = -Math.cos(wantedYaw) * this.car.speed + Math.sin(wantedYaw) * this.lateralSpeed;
    const turn = wantedYaw - this.car.yaw;
    const steps = Math.max(1, Math.ceil((Math.hypot(vx, vz) * dt + Math.abs(turn) * VEHICLES[this.vehicleKind].length / 2) / 0.12));
    const h = dt / steps; let yawStep = turn / steps;
    for (let i = 0; i < steps; i++) {
      const x = this.car.x, z = this.car.z, yaw = this.car.yaw;
      const nx = x + vx * h, nz = z + vz * h, nyaw = yaw + yawStep;
      const hit = this.contact(vehicleBody(nx, nz, nyaw, this.vehicleKind));
      if (!hit) { this.car.x = nx; this.car.z = nz; this.car.yaw = nyaw; }
      else {
        // Resolve to the last safe pose, including the vehicle's rotation.
        let lo = 0, hi = 1;
        for (let j = 0; j < 10; j++) {
          const mid = (lo + hi) / 2;
          if (this.contact(vehicleBody(x + (nx - x) * mid, z + (nz - z) * mid, yaw + yawStep * mid, this.vehicleKind))) hi = mid;
          else lo = mid;
        }
        this.car.x = x + (nx - x) * lo; this.car.z = z + (nz - z) * lo; this.car.yaw = yaw + yawStep * lo;
        const inward = vx * hit.nx + vz * hit.nz;
        if (inward < 0) {
          this.registerImpact(-inward, hit.label);
          const restitution = -inward > 5 ? 0.12 : 0;
          vx -= (1 + restitution) * inward * hit.nx;
          vz -= (1 + restitution) * inward * hit.nz;
        }
        yawStep = 0;
        // Preserve tangential travel instead of bouncing the entire car backwards.
        const sx = this.car.x + vx * h * (1 - lo), sz = this.car.z + vz * h * (1 - lo);
        if (!this.contact(vehicleBody(sx, sz, this.car.yaw, this.vehicleKind))) { this.car.x = sx; this.car.z = sz; }
      }
      const body = vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind);
      for (const ped of this.peds) if (this.time >= ped.scaredUntil && circleContact(body, ped.x, ped.z, 0.5)) {
        ped.scaredUntil = this.time + 4;
        this.registerImpact(Math.hypot(vx, vz), 'pedestrian');
        vx *= 0.5; vz *= 0.5;
      }
    }
    this.x = this.car.x; this.z = this.car.z;
    this.car.speed = vx * Math.sin(this.car.yaw) - vz * Math.cos(this.car.yaw);
    this.lateralSpeed = vx * Math.cos(this.car.yaw) + vz * Math.sin(this.car.yaw);
  }
  private registerImpact(speed: number, withWhat: string, minor = false): void {
    const s = Math.abs(speed);
    if (s < 2.5 || this.crashed) return; // soft taps never flash; lockout prevents multi-trigger
    this.impact = { speed: Math.round(s * 3.6), with: withWhat, at: this.time };
    if (s > 5) {
      const gain = (s - 5) * (minor ? 0.7 : 2.0);
      this.damage = clamp(this.damage + gain, 0, 100);
    }
    this.crashUntil = this.time + (minor ? 0.25 : s > 8 ? 0.8 : 0.45);
  }
  /** True when an obstacle sits in the lane ahead (0..10m forward, <3m lateral). */
  private aheadBlocked(fx: number, fz: number, tx: number, tz: number, ox: number, oz: number, orad: number): boolean {
    const dx = ox - tx, dz = oz - tz;
    const along = dx * fx + dz * fz;
    if (along <= 0 || along > orad + 4) return false;
    return Math.abs(dx * fz - dz * fx) < 2.4;
  }
  private syncCrowd(dt: number): void {
    for (const t of this.traffic) {
      let want = t.base;
      const p = routePoint(TRAFFIC_ROUTE, t.offset);
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const clearance = VEHICLES[t.kind].length / 2;
      // Chase & stop: traffic yields to your car AND to you on foot standing in the lane.
      const blockX = this.driving ? this.car.x : this.x;
      const blockZ = this.driving ? this.car.z : this.z;
      const blockR = this.driving ? clearance + VEHICLES[this.vehicleKind].length / 2 : clearance + 1.2;
      if (this.aheadBlocked(fx, fz, t.x, t.z, blockX, blockZ, blockR)) want = 0;
      for (const o of this.traffic) {
        if (o !== t && this.aheadBlocked(fx, fz, t.x, t.z, o.x, o.z, clearance + VEHICLES[o.kind].length / 2)) { want = 0; break; }
      }
      if (want !== 0) for (const q of this.parked) {
        if (this.aheadBlocked(fx, fz, t.x, t.z, q.x, q.z, clearance + VEHICLES[q.kind].length / 2)) { want = 0; break; }
      }
      t.braking = want < t.speed - 0.3;
      t.speed += clamp(want - t.speed, -10 * dt, 4 * dt);
      // Offset is accumulated distance, never elapsed time multiplied by changing speed.
      const nextOffset = t.offset + t.speed * dt;
      const q = routePoint(TRAFFIC_ROUTE, nextOffset);
      const dyaw = Math.atan2(Math.sin(q.yaw - t.yaw), Math.cos(q.yaw - t.yaw));
      const yaw = t.yaw + clamp(dyaw, -1.7 * dt, 1.7 * dt);
      t.prevYaw = t.yaw;
      if (dt > 0 && this.contact(vehicleBody(q.x, q.z, yaw, t.kind), t, true)) {
        t.speed = 0; t.braking = true; t.steer = 0;
      } else {
        t.offset = nextOffset; t.x = q.x; t.z = q.z; t.yaw = yaw;
        t.steer = clamp(dyaw, -1, 1); t.wheelSpin += t.speed * dt / 0.4;
      }
    }
    for (const ped of this.peds) {
      if (this.time < ped.scaredUntil) { ped.move += (0 - ped.move) * Math.min(1, 6 * dt); continue; }
      // Ease off before sharp corners so turns look walked, not snapped.
      const yawNow = routePoint(ped.route, ped.dist).yaw;
      const yawAhead = routePoint(ped.route, ped.dist + 2.5).yaw;
      let corner = yawNow - yawAhead;
      while (corner > Math.PI) corner -= Math.PI * 2;
      while (corner < -Math.PI) corner += Math.PI * 2;
      const cornerF = 1 - Math.min(0.55, Math.abs(corner) * 0.9);
      const wander = 0.85 + 0.3 * Math.sin(this.time * 0.6 + ped.seed * 6.28);
      let want = ped.speed * cornerF * wander;
      // Wait for a moving car passing close by instead of walking through it.
      if (this.driving) {
        const cd = Math.hypot(this.car.x - ped.x, this.car.z - ped.z);
        if (cd < 4.5 && (Math.abs(this.car.speed) > 2 || cd < 3)) want = 0;
      }
      ped.cur += (want - ped.cur) * Math.min(1, 4 * dt);
      ped.dist += ped.cur * dt;
      ped.phase += ped.cur * dt * 2.4;
      ped.move += ((ped.cur > 0.2 ? 1 : 0) - ped.move) * Math.min(1, 6 * dt);
      const q = routePoint(ped.route, ped.dist);
      ped.x = q.x; ped.z = q.z; ped.yaw = q.yaw;
    }
  }
  update(dt: number): void {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    if (dt > 1 / 60 + 1e-8) {
      const steps = Math.ceil(dt / (1 / 60));
      const previous = { x: this.x, z: this.z, y: this.y };
      for (let i = 0; i < steps; i++) this.update(dt / steps);
      this.previous = previous; return;
    }
    this.time += dt; this.previous = { x: this.x, z: this.z, y: this.y };
    if (this.transition > 0) this.transition = Math.max(0, this.transition - dt);
    // Basketball mode: tap-tap power meter (tap to pump, tap again to throw).
    if (this.mode === 'basket') {
      if (this.jumpPressed) this.basket.pressMeter();
      this.jumpPressed = false;
      this.basket.update(dt);
      this.syncCrowd(dt);
      return;
    }
    // Table tennis mode: paddle movement + swings only; world keeps ambient life.
    if (this.mode === 'table') {
      const tSide = clamp(Number(this.held('right')) - Number(this.held('left')) + this.stick.x, -1, 1);
      this.table.movePlayer(tSide * 3.2 * dt);
      if (this.jumpPressed) this.tableSwing();
      this.jumpPressed = false;
      this.table.update(dt);
      this.syncCrowd(dt);
      return;
    }
    const cameraTurn = Number(this.held('turnRight')) - Number(this.held('turnLeft'));
    if (cameraTurn) this.lookUntil = this.time + 3;
    this.yaw += cameraTurn * dt * 1.8;
    const forward = clamp(Number(this.held('forward')) - Number(this.held('back')) - this.stick.y, -1, 1);
    const side = clamp(Number(this.held('right')) - Number(this.held('left')) + this.stick.x, -1, 1);
    if (this.impact && this.time - this.impact.at > 1.4) this.impact = null;
    if (this.driving) {
      const spec = VEHICLES[this.vehicleKind];
      const crashed = this.crashed;
      const oldSpeed = this.car.speed, oldYaw = this.car.yaw;
      const handbrake = this.held('handbrake') || this.held('jump');
      const topSpeed = spec.topSpeed * (1 - this.damage / 160);
      const opposing = forward !== 0 && forward * oldSpeed < -0.1;
      const drag = 0.65 + 0.008 * oldSpeed * oldSpeed;
      let force = forward * spec.acceleration * Math.max(0.15, 1 - Math.abs(oldSpeed) / (forward < 0 ? 7 : topSpeed));
      if (opposing) force = forward * 13;
      if (!forward || handbrake || crashed) {
        const decel = crashed ? 14 : handbrake ? 9 : drag;
        this.car.speed = Math.sign(oldSpeed) * Math.max(0, Math.abs(oldSpeed) - decel * dt);
      } else this.car.speed = clamp(oldSpeed + (force - Math.sign(oldSpeed) * drag) * dt, -7, topSpeed);
      this.acceleration = (this.car.speed - oldSpeed) / dt;
      this.car.steer += ((crashed ? 0 : side) - this.car.steer) * (1 - Math.exp(-6 * dt));
      const steeringAngle = this.car.steer * 0.55 / (1 + Math.abs(this.car.speed) / 24);
      const yawRate = this.car.speed / (spec.length * 0.64) * Math.tan(steeringAngle) * (handbrake ? 1.5 : 1);
      const wantedYaw = oldYaw + clamp(yawRate, -1.7, 1.7) * dt;
      const deltaYaw = wantedYaw - oldYaw;
      // Preserve momentum across a turning chassis; tire grip dissipates lateral slip.
      this.lateralSpeed = (this.lateralSpeed - oldSpeed * deltaYaw) * Math.exp(-(handbrake ? 0.65 : spec.grip) * dt);
      this.skidding = Math.abs(this.lateralSpeed) > 1.2;
      this.car.braking = opposing || handbrake || crashed;
      this.car.wheelSpin += (this.car.speed * dt) / 0.4;
      this.jumpPressed = false;
      this.moveCar(dt, wantedYaw);
      const probe = this.probeFront(this.car.x, this.car.z, this.car.yaw);
      this.frontDistance = probe.distance; this.frontBlocked = probe.blocked;
      this.acceleration = (this.car.speed - oldSpeed) / dt;
      this.skidding = Math.abs(this.lateralSpeed) > 1.2;
      this.facing = this.car.yaw;
      if (this.view === 'first') this.yaw += this.car.yaw - oldYaw;
      else if (this.time > this.lookUntil) this.yaw += Math.atan2(Math.sin(this.car.yaw - this.yaw), Math.cos(this.car.yaw - this.yaw)) * dt * 2;
    } else {
      this.frontDistance = 999; this.frontBlocked = false; this.skidding = false;
      // Velocity-based locomotion: accelerate into the wish direction, ease out on release.
      const grounded = this.y === 0;
      const length = Math.max(1, Math.hypot(forward, side));
      const targetSpeed = this.held('sprint') ? 8 : 4.6;
      const wishX = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) / length * targetSpeed;
      const wishZ = (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * side) / length * targetSpeed;
      const wishMag = Math.hypot(wishX, wishZ), curMag = Math.hypot(this.pvx, this.pvz);
      const acc = grounded ? (wishMag > curMag + 0.1 ? 42 : 55) : 14;
      // Vector-capped: diagonals close the gap at the same rate as straight lines.
      const dvx = wishX - this.pvx, dvz = wishZ - this.pvz, dvm = Math.hypot(dvx, dvz), step = acc * dt;
      if (dvm <= step) { this.pvx = wishX; this.pvz = wishZ; }
      else { this.pvx += dvx / dvm * step; this.pvz += dvz / dvm * step; }
      const dx = this.pvx * dt, dz = this.pvz * dt;
      const x = clamp(this.x + dx, -LIMIT, LIMIT), z = clamp(this.z + dz, -LIMIT, LIMIT);
      // 4) On foot: player car + parked + traffic + props + peds all push back.
      const blocks = (px: number, pz: number) => this.walkBlocked(px, pz);
      // Axis separation permits sliding along facades instead of sticking to corners.
      if (!intersects(x, this.z, 0.48) && !blocks(x, this.z)) this.x = x; else this.pvx = 0;
      if (!intersects(this.x, z, 0.48) && !blocks(this.x, z)) this.z = z; else this.pvz = 0;
      // Soft ped push so crowds part around you.
      for (const ped of this.peds) {
        if (circleHit(this.x, this.z, 0.4, ped.x, ped.z, 0.5)) {
          const dxp = this.x - ped.x, dzp = this.z - ped.z, d = Math.max(0.2, Math.hypot(dxp, dzp));
          const nx = this.x + dxp / d * 1.5 * dt, nz = this.z + dzp / d * 1.5 * dt;
          if (!blocks(nx, nz)) { this.x = nx; this.z = nz; }
        }
      }
      const speed2d = Math.hypot(this.pvx, this.pvz);
      // Smooth turn toward the travel direction instead of snapping.
      if (speed2d > 0.6) {
        const target = Math.atan2(this.pvx, -this.pvz);
        let diff = target - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += clamp(diff, -12 * dt, 12 * dt);
      }
      this.moveBlend += ((speed2d > 0.4 ? 1 : 0) - this.moveBlend) * Math.min(1, 8 * dt);
      this.stride += speed2d * dt * 2.1;
      this.pace = speed2d;
      // 5) Jump + gravity, with a landing dip scaled by fall speed.
      if (this.jumpPressed && grounded) this.vy = 5.4;
      const fallVy = this.vy;
      this.vy -= 17 * dt; this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) {
        if (fallVy < -4) this.landDip = 1;
        this.vy = 0;
      }
      this.landDip = Math.max(0, this.landDip - 5 * dt);
    }
    this.syncCrowd(dt);
    this.jumpPressed = false;
    // Repair slowly at South Station (on foot or behind the wheel).
    if (Math.hypot(this.x - 42, this.z - 27) < 14 && this.damage > 0) this.damage = Math.max(0, this.damage - 12 * dt);
    const traveled = Math.hypot(this.x - this.previous.x, this.z - this.previous.z);
    this.distance += traveled; this.pace = traveled / dt;
    for (const place of PLACES) if (Math.hypot(this.x - place.x, this.z - place.z) < 14) this.discovered.add(place.id);
  }
}

/** Constant-speed closed routes used by traffic and sidewalk pedestrians. */
export function routePoint(points: readonly Point[], distance: number): Point & { yaw: number } {
  const lengths = points.map((p, i) => Math.hypot(points[(i + 1) % points.length].x - p.x, points[(i + 1) % points.length].z - p.z));
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = ((distance % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    if (remaining <= lengths[i]) {
      const p = points[i], q = points[(i + 1) % points.length], t = remaining / lengths[i];
      return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, yaw: Math.atan2(q.x - p.x, p.z - q.z) };
    }
    remaining -= lengths[i];
  }
  return { ...points[0], yaw: 0 };
}
