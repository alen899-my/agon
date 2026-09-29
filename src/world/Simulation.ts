import { GAME_CENTER, intersects, LIMIT, PARKED_CARS, PLACES, PROPS, TRAFFIC_ROUTE, circleHit, seeded, type Point } from './Map';
import { TableTennisSim, type TTShot, type TTSnapshot } from './TableTennis';

export type WorldAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'turnLeft' | 'turnRight';
export type View = 'third' | 'first';
export interface Impact { speed: number; with: string; at: number }
export interface TrafficCar { x: number; z: number; yaw: number; speed: number; offset: number; base: number; steer: number; wheelSpin: number; braking: boolean; prevYaw: number }
export interface Ped { x: number; z: number; yaw: number; route: Point[]; dist: number; speed: number; phase: number; seed: number; move: number; cur: number; scaredUntil: number }
export interface SnapshotCar { x: number; z: number; yaw: number; speed: number; steer: number; wheelSpin: number; braking: boolean }
export type PlayMode = 'roam' | 'table';
export interface WorldSnapshot {
  phase: 'ready' | 'playing'; paused: boolean; view: View; driving: boolean;
  x: number; z: number; yaw: number; speed: number; distance: number;
  location: string; discovered: string[]; waypoint: string | null; nearbyCar: boolean;
  damage: number; impact: Impact | null; frontDistance: number; frontBlocked: boolean;
  crashed: boolean; skidding: boolean; car: SnapshotCar;
  stridePhase: number; moveBlend: number; airborne: boolean; landDip: number;
  traffic: (SnapshotCar)[];
  peds: { x: number; z: number; yaw: number; phase: number; moving: number }[];
  mode: PlayMode; nearTable: boolean; table: TTSnapshot | null;
  tableFlags: { topspin: boolean; smash: boolean; netCord: boolean; edge: boolean };
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
  car = { x: 9, z: 29, yaw: 0, speed: 0, steer: 0, wheelSpin: 0, braking: false };
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
  // --- game center: table tennis mode ---
  mode: PlayMode = 'roam';
  table = new TableTennisSim();
  private savedPos = { x: 12, z: 34, yaw: -0.25 };
  private keys = new Map<string, WorldAction>();
  private stick = { x: 0, y: 0 };
  private jumpPressed = false;
  constructor() {
    const rng = seeded(9001);
    for (let i = 0; i < 6; i++) this.traffic.push({ x: 0, z: 0, yaw: 0, speed: 7, offset: i * 100 + 25, base: 7, steer: 0, wheelSpin: 0, braking: false, prevYaw: 0 });
    for (let i = 0; i < 16; i++) {
      const speed = 0.9 + rng() * 0.6;
      this.peds.push({ x: 0, z: 0, yaw: 0, route: PED_ROUTES[i], dist: rng() * 240, speed, phase: rng() * 6.28, seed: rng(), move: 1, cur: speed, scaredUntil: 0 });
    }
    this.syncCrowd(0);
  }
  get active(): boolean { return this.phase === 'playing' && !this.paused; }
  get nearbyCar(): boolean { return Math.hypot(this.x - this.car.x, this.z - this.car.z) < 7; }
  get nearTable(): boolean { return Math.hypot(this.x - GAME_CENTER.x, this.z - GAME_CENTER.z) < 8; }
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
  get snapshot(): WorldSnapshot {
    let location = 'Civic Avenue', best = 23;
    for (const place of PLACES) {
      const distance = Math.hypot(this.x - place.x, this.z - place.z);
      if (distance < best) { best = distance; location = place.name; }
    }
    return { phase: this.phase, paused: this.paused, view: this.view, driving: this.driving,
      x: this.x, z: this.z, yaw: this.yaw, speed: Math.round(Math.abs(this.driving ? this.car.speed : this.pace) * 3.6),
      distance: Math.floor(this.distance), location, discovered: [...this.discovered], waypoint: this.waypoint, nearbyCar: this.nearbyCar,
      damage: Math.round(this.damage), impact: this.impact, frontDistance: Math.round(this.frontDistance),
      frontBlocked: this.frontBlocked, crashed: this.crashed, skidding: this.skidding,
      car: { x: this.car.x, z: this.car.z, yaw: this.car.yaw, speed: this.car.speed, steer: this.car.steer, wheelSpin: this.car.wheelSpin, braking: this.car.braking },
      stridePhase: this.stride, moveBlend: this.moveBlend, airborne: this.y > 0.02, landDip: Math.max(0, Math.min(1, this.landDip)),
      traffic: this.traffic.map(t => ({ x: t.x, z: t.z, yaw: t.yaw, speed: t.speed, steer: t.steer, wheelSpin: t.wheelSpin, braking: t.braking })),
      peds: this.peds.map(p => ({ x: p.x, z: p.z, yaw: p.yaw, phase: p.phase, moving: p.move })),
      mode: this.mode, nearTable: this.nearTable,
      table: this.mode === 'table' ? this.table.snapshot : null,
      tableFlags: { ...this.table.flags } };
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
    this.yaw += dx * 0.004; this.pitch = clamp(this.pitch + dy * 0.003, -0.7, 0.85);
  }
  toggleView(): void { this.view = this.view === 'third' ? 'first' : 'third'; }
  togglePause(): void { if (this.phase === 'playing') { this.paused = !this.paused; this.clearInput(); } }
  repair(): void { this.damage = 0; }
  interact(): boolean {
    if (!this.active) return false;
    if (this.mode === 'table') return false;
    if (!this.driving && this.nearTable) return this.enterTable();
    if (!this.driving) {
      if (!this.nearbyCar) return false;
      this.driving = true; this.x = this.car.x; this.z = this.car.z; this.y = this.vy = 0;
      this.yaw = this.car.yaw; this.pitch = 0.12;
    } else {
      // Test both doors and both ends before exiting; never place the player inside a wall.
      const offsets = [[3, 0], [-3, 0], [0, 4], [0, -4]];
      const exit = offsets.map(([x, z]) => ({ x: this.car.x + x, z: this.car.z + z }))
        .find(p => Math.abs(p.x) < LIMIT && Math.abs(p.z) < LIMIT && !intersects(p.x, p.z, 0.5));
      if (!exit) return false;
      this.driving = false; this.x = exit.x; this.z = exit.z; this.car.speed = 0; this.car.steer = 0; this.car.braking = false;
      this.pvx = 0; this.pvz = 0;
    }
    this.previous = { x: this.x, z: this.z, y: this.y }; this.clearInput(); return true;
  }
  private held(action: WorldAction): boolean { return [...this.keys.values()].includes(action); }
  /** Front obstacle probe: narrow corridor ahead of the bumper. */
  probeFront(x: number, z: number, yaw: number): { distance: number; blocked: boolean; label: string | null } {
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = Math.sin(yaw);
    let best = 999; let label: string | null = null;
    const test = (px: number, pz: number) => {
      if (Math.abs(px) >= LIMIT - 2 || Math.abs(pz) >= LIMIT - 2) { const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; label = 'boundary'; } return; }
      if (intersects(px, pz, 0.9)) { const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; label = 'building'; } return; }
      for (const p of PARKED_CARS) if (circleHit(px, pz, 0.9, p.x, p.z, p.r * 0.8)) { const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; label = p.label ?? 'parked'; } return; }
      for (const t of this.traffic) if (circleHit(px, pz, 0.9, t.x, t.z, 1.8)) { const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; label = 'traffic'; } return; }
      for (const p of PROPS) {
        if (p.r > 1.5) continue; // sculpture/fountain are map features, handled by direct collision
        if (circleHit(px, pz, 0.7, p.x, p.z, p.r)) { const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; label = p.label ?? 'prop'; } return; }
      }
    };
    for (const dist of [3.5, 6, 9, 13]) {
      for (const lateral of [0, -0.9, 0.9]) {
        test(x + fx * dist + rx * lateral, z + fz * dist + rz * lateral);
      }
      if (best < 900) { const d = Math.max(0, best - 2.5); return { distance: d, blocked: d < 6, label }; }
    }
    return { distance: 999, blocked: false, label: null };
  }
  /** Two axle circles approximate the car body so side passes don't count as hits. */
  private carCircles(x: number, z: number, yaw: number): { x: number; z: number; r: number }[] {
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    return [
      { x: x + fx * 1.4, z: z + fz * 1.4, r: 1.1 },
      { x: x - fx * 1.4, z: z - fz * 1.4, r: 1.1 },
    ];
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
    if (along < -1 || along > 10) return false;
    return Math.abs(dx * fz - dz * fx) < 2.2 + orad;
  }
  private syncCrowd(dt: number): void {
    for (const t of this.traffic) {
      // Brake when the player car or another traffic car is ahead in the lane.
      let want = t.base;
      const p = routePoint(TRAFFIC_ROUTE, t.offset + this.time * t.speed);
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      if (this.driving && this.aheadBlocked(fx, fz, p.x, p.z, this.car.x, this.car.z, 1.6)) want = 0;
      for (const o of this.traffic) {
        if (o === t) continue;
        if (this.aheadBlocked(fx, fz, p.x, p.z, o.x, o.z, 1.6)) { want = 0; break; }
      }
      t.braking = want < t.speed - 0.3;
      t.speed += clamp(want - t.speed, -10 * Math.max(dt, 0.001), 4 * Math.max(dt, 0.001));
      const q = routePoint(TRAFFIC_ROUTE, t.offset + this.time * t.speed + t.speed * Math.max(dt, 0));
      let dyaw = q.yaw - t.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      t.steer = clamp(dyaw * 4, -1, 1);
      t.prevYaw = t.yaw;
      t.x = q.x; t.z = q.z; t.yaw = q.yaw;
      t.wheelSpin += (t.speed * Math.max(dt, 0)) / 0.4;
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
    if (!this.active) return;
    this.time += dt; this.previous = { x: this.x, z: this.z, y: this.y };
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
    this.yaw += (Number(this.held('turnRight')) - Number(this.held('turnLeft'))) * dt * 1.8;
    const forward = clamp(Number(this.held('forward')) - Number(this.held('back')) - this.stick.y, -1, 1);
    const side = clamp(Number(this.held('right')) - Number(this.held('left')) + this.stick.x, -1, 1);
    if (this.impact && this.time - this.impact.at > 1.4) this.impact = null;
    if (this.driving) {
      // 2) Car feel: damage caps top speed, crash lockout mutes input, steering grips with speed.
      const topSpeed = 19 * (1 - this.damage / 160);
      const target = forward > 0 ? topSpeed * forward : 7 * forward;
      const crashed = this.crashed;
      const accel = crashed ? -14 * dt * Math.sign(this.car.speed) : clamp(target - this.car.speed, -12 * dt, 7 * dt);
      this.car.speed += accel;
      if (crashed && Math.abs(this.car.speed) < 0.4) this.car.speed *= 0.8;
      const grip = Math.abs(this.car.speed) / (Math.abs(this.car.speed) + 8);
      if (!crashed) this.car.yaw += side * grip * Math.sign(this.car.speed || 1) * 1.7 * dt;
      this.car.steer += (side - this.car.steer) * Math.min(1, 10 * dt);
      this.car.braking = (forward < 0 && this.car.speed > 0.5) || target - this.car.speed < -2 || crashed;
      this.car.wheelSpin += (this.car.speed * dt) / 0.4;
      this.skidding = Math.abs(side) > 0.5 && Math.abs(this.car.speed) > 12;
      if (this.skidding) this.car.speed *= 1 - 0.35 * dt; // drift scrub
      const probe = this.probeFront(this.car.x, this.car.z, this.car.yaw);
      this.frontDistance = probe.distance; this.frontBlocked = probe.blocked;
      const nx = this.x + Math.sin(this.car.yaw) * this.car.speed * dt;
      const nz = this.z - Math.cos(this.car.yaw) * this.car.speed * dt;
      if (!crashed && Math.abs(this.car.speed) > 1.2) {
        const [front, rear] = this.carCircles(nx, nz, this.car.yaw);
        let withWhat: string | null = null; let minor = false;
        if (Math.abs(nx) >= LIMIT - 3 || Math.abs(nz) >= LIMIT - 3) withWhat = 'boundary';
        else if (intersects(front.x, front.z, front.r) || intersects(rear.x, rear.z, rear.r)) withWhat = 'building';
        if (!withWhat) {
          for (const c of [front, rear]) {
            const hit = PARKED_CARS.find(p => circleHit(c.x, c.z, c.r * 0.9, p.x, p.z, p.r * 0.8));
            if (hit) { withWhat = hit.label ?? 'parked car'; break; }
          }
        }
        const hitTraffic = !withWhat ? this.traffic.find(t => [front, rear].some(c => circleHit(c.x, c.z, c.r, t.x, t.z, 1.7))) : undefined;
        if (hitTraffic) withWhat = 'traffic';
        let hitProp: string | null = null;
        if (!withWhat) {
          for (const c of [front, rear]) {
            const hit = PROPS.find(p => circleHit(c.x, c.z, c.r * 0.8, p.x, p.z, p.r));
            if (hit) { hitProp = hit.label ?? 'prop'; break; }
          }
          // Small roadside props only scuff at speed; they never stop the car.
          if (hitProp && ['lamp', 'tree', 'bench', 'canopy-pillar'].includes(hitProp)) { withWhat = hitProp; minor = true; }
          else if (hitProp) withWhat = hitProp;
        }
        const hitPed = !withWhat ? this.peds.find(p => this.time >= p.scaredUntil && [front, rear].some(c => circleHit(c.x, c.z, 0.9, p.x, p.z, 0.5))) : undefined;
        if (withWhat || hitPed) {
          // 3) Crash: bounce + damage + lockout instead of instant stop.
          if (hitPed && !withWhat) {
            hitPed.scaredUntil = this.time + 4; hitPed.dist += 25;
            this.registerImpact(this.car.speed, 'pedestrian');
            this.car.speed = this.car.speed * -0.1;
          } else if (minor) {
            this.registerImpact(this.car.speed, withWhat ?? 'prop', true);
            this.car.speed *= 0.55; // scuff through, keep rolling
            this.x = this.car.x = nx; this.z = this.car.z = nz;
          } else {
            this.registerImpact(this.car.speed, withWhat ?? 'obstacle');
            this.car.speed = Math.abs(this.car.speed) < 4 ? 0 : this.car.speed * -0.25;
          }
          if (hitTraffic) hitTraffic.speed = 0;
        } else {
          this.x = this.car.x = nx; this.z = this.car.z = nz;
        }
      } else {
        // Locked out or crawling: roll without new impacts so the car can separate.
        const blocked = intersects(nx, nz, 1.1);
        if (!blocked) { this.x = this.car.x = nx; this.z = this.car.z = nz; }
        else if (Math.abs(this.car.speed) < 4) this.car.speed = 0;
      }
      this.facing = this.car.yaw;
      this.yaw += Math.atan2(Math.sin(this.car.yaw - this.yaw), Math.cos(this.car.yaw - this.yaw)) * dt * 2;
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
      const blocks = (px: number, pz: number) =>
        Math.abs(px - this.car.x) < 1.5 && Math.abs(pz - this.car.z) < 2.7 ||
        PARKED_CARS.some(p => circleHit(px, pz, 0.48, p.x, p.z, p.r)) ||
        this.traffic.some(t => circleHit(px, pz, 0.48, t.x, t.z, 2.2)) ||
        PROPS.some(p => circleHit(px, pz, 0.48, p.x, p.z, p.r));
      // Axis separation permits sliding along facades instead of sticking to corners.
      if (!intersects(x, this.z, 0.48) && !blocks(x, this.z)) this.x = x; else this.pvx = 0;
      if (!intersects(this.x, z, 0.48) && !blocks(this.x, z)) this.z = z; else this.pvz = 0;
      // Soft ped push so crowds part around you.
      for (const ped of this.peds) {
        if (circleHit(this.x, this.z, 0.4, ped.x, ped.z, 0.5)) {
          const dxp = this.x - ped.x, dzp = this.z - ped.z, d = Math.max(0.2, Math.hypot(dxp, dzp));
          this.x += dxp / d * 1.5 * dt * 10 * 0.1; this.z += dzp / d * 1.5 * dt * 10 * 0.1;
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
