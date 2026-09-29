import { intersects, LIMIT, PLACES, type Point } from './Map';

export type WorldAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'turnLeft' | 'turnRight';
export type View = 'third' | 'first';
export interface WorldSnapshot {
  phase: 'ready' | 'playing'; paused: boolean; view: View; driving: boolean;
  x: number; z: number; yaw: number; speed: number; distance: number;
  location: string; discovered: string[]; waypoint: string | null; nearbyCar: boolean;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Browser-independent world rules. X/Z use meters, Y is height above pavement. */
export class Simulation {
  x = 12; z = 34; y = 0; vy = 0;
  previous = { x: this.x, z: this.z, y: 0 };
  yaw = -0.25; pitch = 0.13; facing = 0;
  view: View = 'third'; phase: 'ready' | 'playing' = 'ready'; paused = false;
  time = 0; distance = 0; pace = 0;
  driving = false;
  car = { x: 9, z: 29, yaw: 0, speed: 0 };
  waypoint: string | null = 'plaza';
  readonly discovered = new Set<string>();
  private keys = new Map<string, WorldAction>();
  private stick = { x: 0, y: 0 };
  private jumpPressed = false;
  get active(): boolean { return this.phase === 'playing' && !this.paused; }
  get nearbyCar(): boolean { return Math.hypot(this.x - this.car.x, this.z - this.car.z) < 7; }
  get snapshot(): WorldSnapshot {
    let location = 'Civic Avenue', best = 23;
    for (const place of PLACES) {
      const distance = Math.hypot(this.x - place.x, this.z - place.z);
      if (distance < best) { best = distance; location = place.name; }
    }
    return { phase: this.phase, paused: this.paused, view: this.view, driving: this.driving,
      x: this.x, z: this.z, yaw: this.yaw, speed: Math.round(Math.abs(this.driving ? this.car.speed : this.pace) * 3.6),
      distance: Math.floor(this.distance), location, discovered: [...this.discovered], waypoint: this.waypoint, nearbyCar: this.nearbyCar };
  }
  begin(): void { this.phase = 'playing'; this.clearInput(); }
  clearInput(): void { this.keys.clear(); this.stick = { x: 0, y: 0 }; this.jumpPressed = false; }
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
  interact(): boolean {
    if (!this.active) return false;
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
      this.driving = false; this.x = exit.x; this.z = exit.z; this.car.speed = 0;
    }
    this.previous = { x: this.x, z: this.z, y: this.y }; this.clearInput(); return true;
  }
  private held(action: WorldAction): boolean { return [...this.keys.values()].includes(action); }
  update(dt: number): void {
    if (!this.active) return;
    this.time += dt; this.previous = { x: this.x, z: this.z, y: this.y };
    this.yaw += (Number(this.held('turnRight')) - Number(this.held('turnLeft'))) * dt * 1.8;
    const forward = clamp(Number(this.held('forward')) - Number(this.held('back')) - this.stick.y, -1, 1);
    const side = clamp(Number(this.held('right')) - Number(this.held('left')) + this.stick.x, -1, 1);
    if (this.driving) {
      const target = forward > 0 ? 19 * forward : 7 * forward;
      this.car.speed += clamp(target - this.car.speed, -12 * dt, 7 * dt);
      this.car.yaw += side * Math.min(Math.abs(this.car.speed) / 5, 1) * Math.sign(this.car.speed) * 1.35 * dt;
      const x = this.x + Math.sin(this.car.yaw) * this.car.speed * dt;
      const z = this.z - Math.cos(this.car.yaw) * this.car.speed * dt;
      if (Math.abs(x) < LIMIT - 3 && Math.abs(z) < LIMIT - 3 && !intersects(x, z, 2.6)) {
        this.x = this.car.x = x; this.z = this.car.z = z;
      } else this.car.speed = 0;
      this.facing = this.car.yaw;
      this.yaw += Math.atan2(Math.sin(this.car.yaw - this.yaw), Math.cos(this.car.yaw - this.yaw)) * dt * 2;
    } else {
      const length = Math.max(1, Math.hypot(forward, side));
      const speed = this.held('sprint') ? 8 : 4.6;
      const dx = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) / length * speed * dt;
      const dz = (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * side) / length * speed * dt;
      const x = clamp(this.x + dx, -LIMIT, LIMIT), z = clamp(this.z + dz, -LIMIT, LIMIT);
      const carBlocks = (px: number, pz: number) => Math.abs(px - this.car.x) < 1.5 && Math.abs(pz - this.car.z) < 2.7;
      // Axis separation permits sliding along facades instead of sticking to corners.
      if (!intersects(x, this.z, 0.48) && !carBlocks(x, this.z)) this.x = x;
      if (!intersects(this.x, z, 0.48) && !carBlocks(this.x, z)) this.z = z;
      if (Math.hypot(dx, dz) > 0.001) this.facing = Math.atan2(dx, -dz);
      if (this.jumpPressed && this.y === 0) this.vy = 5.4;
      this.vy -= 17 * dt; this.y = Math.max(0, this.y + this.vy * dt); if (this.y === 0) this.vy = 0;
    }
    this.jumpPressed = false;
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
