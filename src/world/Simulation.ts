import { bodyContact, boundaryContact, circleContact, vehicleBody, type Body, type Contact } from './Collision';
import { VEHICLES, VEHICLE_KINDS, type VehicleKind } from './Vehicles';
import { WEATHER_GRIP, type Season, type Weather } from './Weather';
import { GAME_CENTER, HOOP, PROMENADE, ROAD_HALF, groundHeight, inPromenade, inWater, intersects, LIMIT, onRoad, SOLIDS, PARKED_CARS, PLACES, PROPS, RACE_SHOW_CARS, TRAFFIC_ROUTE, circleHit, seeded, type Point } from './Map';
import { TRACK_LENGTH, gridSlots, startLine } from './Track';
import { GUNS } from './Guns';
import { TableTennisSim, type TTShot, type TTSnapshot } from './TableTennis';
import { BasketballSim, type BBSnapshot } from './Basketball';

export type WorldAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'turnLeft' | 'turnRight' | 'handbrake' | 'signalLeft' | 'signalRight' | 'horn' | 'aim' | 'fire';
export type View = 'third' | 'first';
export interface Impact { speed: number; with: string; at: number }
export interface TrafficCar { kind: VehicleKind; x: number; z: number; yaw: number; speed: number; offset: number; base: number; steer: number; wheelSpin: number; braking: boolean; prevYaw: number; hp: number; burning: boolean; burnT: number }
export interface ParkedVehicle { kind: VehicleKind; x: number; z: number; yaw: number; hp?: number; burning?: boolean; burnT?: number }
/** Map dot for a far-away room member (1 Hz, no full transform). */
export interface RemoteDot { id: string; x: number; z: number; driving: boolean }
export interface VehicleTarget { type: 'player' | 'parked' | 'traffic'; index: number; kind: VehicleKind; x: number; z: number; yaw: number; speed: number; dist: number; enterable: boolean; reason: string | null }
export interface Ped {
  x: number; z: number; yaw: number; route: Point[]; dist: number; speed: number; phase: number; seed: number; move: number; cur: number; scaredUntil: number;
  /** Ragdoll state — active while ped is tumbling after a vehicle hit. */
  ragdoll: boolean; ry: number; rvx: number; rvz: number; rvy: number; rpitch: number; rpitchRate: number; rollYaw: number;
  /** Gunshot wounds: 100 fresh, dead at 0 (corpse never recovers). */
  hp: number; dead: boolean;
}
/** One tracer + muzzle flash, drawn by the renderer for ~90ms. */
export interface ShotFX { mx: number; my: number; mz: number; ex: number; ey: number; ez: number; born: number; cls: string }
/** One explosion flash + shockwave, drawn ~0.6s. */
export interface BoomFX { x: number; y: number; z: number; born: number }
/** One burning vehicle (flame + smoke anchor). */
export interface BurnerFX { x: number; y: number; z: number }
export interface SnapshotCar { x: number; z: number; yaw: number; speed: number; steer: number; wheelSpin: number; braking: boolean }
export type PlayMode = 'roam' | 'table' | 'basket';
/** Wiper control: auto (rain-driven), forced on, or forced off. */
export type WiperMode = 'auto' | 'on' | 'off';
export type { Season, Weather };
export interface WorldSnapshot {
  phase: 'ready' | 'playing'; paused: boolean; view: View; driving: boolean; weather: Weather; season: Season; wiperMode: WiperMode;
  x: number; z: number; yaw: number; speed: number; distance: number;
  location: string; discovered: string[]; waypoint: string | null; nearbyCar: boolean;
  nearbyVehicleKind: VehicleKind | null; nearbyVehicleLabel: string | null; enterHint: string | null;
  damage: number; impact: Impact | null; frontDistance: number; frontBlocked: boolean;
  vehicleKind: VehicleKind; acceleration: number; crashed: boolean; skidding: boolean; boosting: boolean; boost: number; boostEnabled: boolean; car: SnapshotCar;
  transition: number;
  parked: ParkedVehicle[];
  /** Private server presence. Null in solo. Filled by WorldEngine, not the sim. */
  room: { code: string; members: number } | null;
  dots: RemoteDot[];
  stridePhase: number; moveBlend: number; airborne: boolean; landDip: number;
  traffic: (SnapshotCar)[];
  peds: { x: number; z: number; yaw: number; phase: number; moving: number; ragdoll: boolean; ry: number; rpitch: number; rollYaw: number; dead: boolean }[];
  mode: PlayMode; nearTable: boolean; nearHoop: boolean; table: TTSnapshot | null;
  tableFlags: { topspin: boolean; smash: boolean; netCord: boolean; edge: boolean };
  basket: BBSnapshot | null;
  basketFlags: { played: boolean; swish: boolean; streak3: boolean };
  blinker: number; blinkerManual: boolean; nearArena: boolean;
  /** World time of last pedestrian blood hit, -999 if never. Used to trigger blood-splash FX. */
  pedBloodAt: number;
  /** Increments on every pedestrian hit — remounts the blood overlay even for same-tick hits. */
  pedBloodSeq: number;
  /** Current world time (lets the HUD expire one-shot FX like the blood splash). */
  time: number;
  // --- GTA combat: health, arsenal, fire, wrecks (all mirrored to the HUD) ---
  hp: number; dead: boolean; wastedIn: number;
  armed: boolean; aiming: boolean; gunIndex: number;
  mag: number; magSize: number;
  reloading: boolean; reloadT: number; reloadDur: number;
  hitSeq: number; hitKill: boolean; hitAt: number;
  shotSeq: number; shotCls: string;
  drySeq: number; reloadSeq: number; explodeSeq: number;
  hurtSeq: number; deathSeq: number;
  shots: ShotFX[]; booms: BoomFX[];
  burners: BurnerFX[];
  carBurning: boolean; carWrecked: boolean;
  /** Projected screen position (0..1) of the aiming point in the current camera frame.
   *  Filled by WorldEngine each render; used to position the 3rd-person crosshair like PUBG. */
  aimScreenX: number; aimScreenY: number;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Grid bubble: no parked/traffic vehicle may sit this close to a grid slot or the start line while a race is live. */
export const GRID_BUBBLE_RADIUS = 14;
/** Cached grid geometry (deterministic): avoids per-tick allocations in the hot loop. */
const GRID_SLOTS = gridSlots();
const START_PT = startLine();
/** True when (x,z) matches a paddock show-car display spot (RACE_SHOW_CARS row). */
function isShowCarSpot(x: number, z: number): boolean {
  for (const s of RACE_SHOW_CARS) {
    if (Math.hypot(x - s.x, z - s.z) < 2) return true;
  }
  return false;
}

/** Ray vs axis-aligned rect: smallest t > 0.3 inside, else null. */
function rayRect(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, hw: number, hl: number): number | null {
  let tmin = 0.3, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (Math.abs(ox - cx) > hw) return null; }
  else {
    let t1 = (cx - hw - ox) / dx, t2 = (cx + hw - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-9) { if (Math.abs(oz - cz) > hl) return null; }
  else {
    let t1 = (cz - hl - oz) / dz, t2 = (cz + hl - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  return tmin <= tmax ? tmin : null;
}

/** Ray vs yawed vehicle box (forward = (sin yaw, -cos yaw)). */
function rayBox(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, hw: number, hl: number, yaw: number): number | null {
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = Math.sin(yaw);
  const ex = ox - cx, ez = oz - cz;
  // Local frame: u along right, v along forward.
  const ou = ex * rx + ez * rz, ov = ex * fx + ez * fz;
  const du = dx * rx + dz * rz, dv = dx * fx + dz * fz;
  return rayRect(ou, ov, du, dv, 0, 0, hw, hl);
}

/** Ray vs ground circle (peds): smallest t > 0.2 inside, else null. */
function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): number | null {
  const ex = ox - cx, ez = oz - cz;
  const b = ex * dx + ez * dz;
  const c = ex * ex + ez * ez - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0.2 ? t : null;
}

const PED_ROUTES: Point[][] = [];
{
  const rng = seeded(8008);
  for (let i = 0; i < 16; i++) {
    const east = i % 2 === 0, north = i % 4 < 2;
    // Half the crowd walks the inner blocks, half patrols the outer ring
    // (same 16 peds = zero extra per-frame cost).
    const outer = i % 4 >= 2;
    const spread = outer ? 133 : 73;
    const x1 = east ? 13 : -spread, x2 = east ? spread : -13;
    const z1 = north ? -spread : 13, z2 = north ? -13 : spread;
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
  /** Nitro boost meter 0-100. Drains while boosting, auto-refills after a short delay. Racing-only. */
  boost = 100;
  boosting = false;
  /** Set by WorldEngine: true only while race phase is 'racing'. */
  boostEnabled = false;
  private boostDelay = 0;
  /** Smooth GTA enter/exit: locks drive inputs while the avatar slips through the door. */
  transition = 0;
  private lookUntil = 0;
  car = { x: 9, z: 29, yaw: 0, speed: 0, steer: 0, wheelSpin: 0, braking: false };
  /** Bridge height: surface Y under the car (0 at grade, deckY on the span). */
  carY = 0;
  /** Slope pitch under the car (radians, + climbing) for the body tilt. */
  carPitch = 0;
  // --- GTA combat: health, arsenal, wrecks ---
  /** Player health 0-100 (hearts + bar in the HUD). */
  hp = 100;
  dead = false;
  private wastedAt = -999;
  private lastHurtAt = -999;
  private lastBloodFxAt = -999;
  /** Arsenal: armed toggle, selected gun, magazine per gun (reserve infinite). */
  armed = false;
  gunIndex = 0;
  mags: number[] = GUNS.map(g => g.mag);
  aiming = false;
  private fireTimer = 0;
  private triggerEdge = false;
  reloading = false;
  private reloadT = 0;
  private reloadDur = 0;
  // FX + audio sequence counters (renderer plays sounds on change).
  hitSeq = 0; hitKill = false; hitAt = -999;
  shotSeq = 0; drySeq = 0; reloadSeq = 0; explodeSeq = 0; hurtSeq = 0; deathSeq = 0;
  shots: ShotFX[] = [];
  booms: BoomFX[] = [];
  burners: BurnerFX[] = [];
  /** Torched map parking spots (static collider + visuals both gone). */
  private clearedStatic: { x: number; z: number }[] = [];
  /** Player car burning fuse / burnt-out wreck state. */
  carBurning = false;
  private carBurnT = 0;
  carWrecked = false;
  private wreckT = 0;
  /** Every parked car in the world is stealable. Includes your previously driven cars.
   *  Slots mirror Map PARKED_CARS + RACE_SHOW_CARS (all clear of driving lines). */
  parked: ParkedVehicle[] = [
    { kind: 'van', x: -14, z: -38, yaw: 0 },
    { kind: 'car', x: 14, z: -54, yaw: 0 },
    { kind: 'car', x: 55, z: 16, yaw: 0 },
    { kind: 'taxi', x: 24, z: -13, yaw: Math.PI / 2 },
    { kind: 'muscle', x: -32, z: 14, yaw: 0.3 },
    { kind: 'police', x: 38, z: 34, yaw: -Math.PI / 2 },
    { kind: 'pickup', x: -47, z: -18, yaw: Math.PI / 2 },
    { kind: 'ambulance', x: 48, z: -31, yaw: 0 },
    { kind: 'super', x: 18, z: 48, yaw: -0.4 },
    { kind: 'bus', x: 30, z: 68, yaw: Math.PI / 2 },
    { kind: 'hatch', x: -15, z: 55, yaw: 1.2 },
    { kind: 'fire', x: -63, z: 60, yaw: 0 },
    { kind: 'car', x: 100, z: -95, yaw: 0.4 },
    { kind: 'car', x: -48, z: 100, yaw: -0.3 },
    { kind: 'muscle', x: 97, z: -122, yaw: -0.2 },
    { kind: 'van', x: 122, z: -45, yaw: Math.PI / 2 },
    { kind: 'taxi', x: -20, z: 98, yaw: 0.1 },
    { kind: 'hatch', x: 100, z: 93, yaw: -0.5 },
    { kind: 'pickup', x: -64, z: -115, yaw: 0.2 },
    { kind: 'coupe', x: 64, z: -115, yaw: -0.2 },
    ...RACE_SHOW_CARS.map((s): ParkedVehicle => ({ kind: s.kind, x: s.x, z: s.z, yaw: s.yaw })),
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
  /** Turn signals: 0 off, 1 left, 2 right, 3 hazard. Auto from steering + manual Z/X. */
  blinker = 0;
  /** True only while a signal is deliberately held (Z/X keys, touch pads). Auto-steer leaves this false. */
  blinkerManual = false;
  traffic: TrafficCar[] = [];
  peds: Ped[] = [];
  /** True while a race is on the lights / live: start line + arena stay empty. */
  raceClearActive = false;
  /** Paddock show cars + grid bubble vehicles stashed while `raceClearActive`. */
  private stashedRaceClearParked: ParkedVehicle[] = [];
  private stashedRaceClearTraffic: TrafficCar[] = [];
  /** World time of the most recent pedestrian hit (for blood-splash overlay). */
  pedBloodAt = -999;
  /** Hit counter — guarantees a fresh overlay key for every hit. */
  pedBloodSeq = 0;
  // --- character locomotion: smoothed velocity, stride phase, landing dip ---
  pvx = 0; pvz = 0; stride = 0; moveBlend = 0; landDip = 0;
  /** Weather mode (grip multiplier). Set by WorldEngine.setWeather. */
  weather: Weather = 'normal';
  get weatherGrip(): number { return WEATHER_GRIP[this.weather] ?? 1; }
  /** Season (visuals + ambience only; grip stays with the condition). Set by WorldEngine.setSeason. */
  season: Season = 'spring';
  /** Wiper switch: auto -> on -> off -> auto (T key / touch button). */
  wiperMode: WiperMode = 'auto';
  cycleWipers(): WiperMode {
    this.wiperMode = this.wiperMode === 'auto' ? 'on' : this.wiperMode === 'on' ? 'off' : 'auto';
    return this.wiperMode;
  }
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
    // A living street: 8 looping cars spread evenly over the Grand Circuit.
    const streetCast: VehicleKind[] = ['coupe', 'taxi', 'crossover', 'coach', 'track', 'raptor', 'patrol', 'wagon'];
    for (let i = 0; i < 8; i++) this.traffic.push({ kind: streetCast[i % streetCast.length], ...routePoint(TRAFFIC_ROUTE, i * TRACK_LENGTH / 8 + 25), speed: 7, offset: i * TRACK_LENGTH / 8 + 25, base: 7, steer: 0, wheelSpin: 0, braking: false, prevYaw: 0, hp: 100, burning: false, burnT: 0 });
    for (let i = 0; i < 16; i++) {
      const speed = 0.9 + rng() * 0.6;
      this.peds.push({ x: 0, z: 0, yaw: 0, route: PED_ROUTES[i], dist: rng() * 240, speed, phase: rng() * 6.28, seed: rng(), move: 1, cur: speed, scaredUntil: 0, ragdoll: false, ry: 0, rvx: 0, rvz: 0, rvy: 0, rpitch: 0, rpitchRate: 0, rollYaw: 0, hp: 100, dead: false });
    }
    this.syncCrowd(0);
  }
  get active(): boolean { return this.phase === 'playing' && !this.paused; }
  /** GTA rule: every world vehicle is enterable. Nearest within reach, traffic must be stopped/slow. */
  nearestVehicle(): VehicleTarget | null {
    const R = 6.5;
    const candidates: VehicleTarget[] = [];
    // Your own ride keeps its bridge height: unreachable from far below/above.
    const ownHigh = Math.abs(this.carY - Math.max(0, groundHeight(this.x, this.z, this.y))) > 1.5;
    const pd = Math.hypot(this.x - this.car.x, this.z - this.car.z);
    candidates.push({ type: 'player', index: -1, kind: this.vehicleKind, x: this.car.x, z: this.car.z, yaw: this.car.yaw, speed: Math.abs(this.car.speed), dist: pd, enterable: pd < R && !ownHigh && !this.carWrecked, reason: this.carWrecked ? 'destroyed' : ownHigh ? 'too high' : pd < R ? null : 'too far' });
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
    const kinds: VehicleKind[] = ['car', 'hatch', 'taxi', 'suv', 'sport', 'muscle', 'super', 'minivan', 'van', 'police', 'ambulance', 'boxTruck',
      'coupe', 'wagon', 'compact', 'esedan', 'crossover', 'shuttle', 'minibus', 'towtruck', 'tanker', 'rally', 'jeep', 'cruiser'];
    const kind = kinds[Math.floor(((this.time * 13.7) % 1 + 1) % 1 * kinds.length) % kinds.length];
    let best = 0, bestDist = -1;
    for (let k = 0; k < 8; k++) {
      const offset = ((this.time * 7 + k * 79 + this.traffic.length * 37) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
      const p = routePoint(TRAFFIC_ROUTE, offset);
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d > bestDist) { bestDist = d; best = offset; }
    }
    const p = routePoint(TRAFFIC_ROUTE, best);
    // While a race is live, never respawn onto the cleared start/grid bubble.
    if (this.raceClearActive && this.nearGridBubble(p.x, p.z, GRID_BUBBLE_RADIUS)) {
      const shifted = (best + 120) % TRACK_LENGTH;
      const q = routePoint(TRAFFIC_ROUTE, shifted);
      this.traffic.push({ kind, x: q.x, z: q.z, yaw: q.yaw, speed: 0, offset: shifted, base: 6 + (shifted % 3), steer: 0, wheelSpin: 0, braking: false, prevYaw: q.yaw, hp: 100, burning: false, burnT: 0 });
      return;
    }
    this.traffic.push({ kind, x: p.x, z: p.z, yaw: p.yaw, speed: 0, offset: best, base: 6 + (best % 3), steer: 0, wheelSpin: 0, braking: false, prevYaw: p.yaw, hp: 100, burning: false, burnT: 0 });
  }
  /**
   * Race-clear mode: empty the paddock show-car row + any vehicle sitting on
   * the start/grid bubble for `countdown + racing`, then restore afterwards.
   * Public traffic outside the bubble keeps flowing normally.
   */
  setRaceClear(on: boolean): void {
    if (on === this.raceClearActive) {
      // Re-sweep while active: a stolen-car leftover may have been dropped on the grid.
      if (on) this.sweepGridBubble();
      return;
    }
    this.raceClearActive = on;
    if (on) {
      this.stashedRaceClearParked = [];
      this.stashedRaceClearTraffic = [];
      // Stash the 6 paddock show cars wherever they currently are in the fleet.
      this.parked = this.parked.filter((p) => {
        if (isShowCarSpot(p.x, p.z)) { this.stashedRaceClearParked.push(p); return false; }
        return true;
      });
      this.sweepGridBubble();
    } else {
      if (this.stashedRaceClearParked.length > 0) this.parked.push(...this.stashedRaceClearParked);
      if (this.stashedRaceClearTraffic.length > 0) this.traffic.push(...this.stashedRaceClearTraffic);
      this.stashedRaceClearParked = [];
      this.stashedRaceClearTraffic = [];
    }
  }
  /** Remove parked + stopped traffic sitting inside the grid bubble (stash for restore). */
  private sweepGridBubble(): void {
    this.parked = this.parked.filter((p) => {
      if (this.nearGridBubble(p.x, p.z, GRID_BUBBLE_RADIUS)) { this.stashedRaceClearParked.push(p); return false; }
      return true;
    });
    this.traffic = this.traffic.filter((t) => {
      if (this.nearGridBubble(t.x, t.z, GRID_BUBBLE_RADIUS)) { this.stashedRaceClearTraffic.push(t); return false; }
      return true;
    });
  }
  /** True when (x,z) sits inside the cleared start/grid bubble (slots + start line). */
  nearGridBubble(x: number, z: number, radius = GRID_BUBBLE_RADIUS): boolean {
    if (Math.hypot(x - START_PT.x, z - START_PT.z) < radius) return true;
    for (const slot of GRID_SLOTS) {
      if (Math.hypot(x - slot.x, z - slot.z) < radius) return true;
    }
    return false;
  }
  /** Teleport to a race grid slot (keeps physics settled). */
  placeAt(x: number, z: number, yaw: number): void {
    this.car.x = x; this.car.z = z; this.car.yaw = yaw;
    this.car.speed = 0; this.car.steer = 0; this.car.braking = false;
    this.x = x; this.z = z; this.yaw = yaw; this.facing = yaw;
    this.lateralSpeed = 0; this.acceleration = 0;
    this.carY = Math.max(0, groundHeight(x, z)); this.carPitch = 0;
    this.y = this.carY; this.vy = 0;
    this.boost = 100; this.boosting = false; this.boostDelay = 0;
    this.previous = { x, z, y: this.y };
    this.clearInput();
  }
  get nearArena(): boolean {
    return Math.hypot(this.x - (-45), this.z - 82) < 20;
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
    return { phase: this.phase, paused: this.paused, view: this.view, driving: this.driving, weather: this.weather, season: this.season, wiperMode: this.wiperMode,
      x: this.x, z: this.z, yaw: this.yaw, speed: Math.round(Math.abs(this.driving ? this.car.speed : this.pace) * 3.6),
      distance: Math.floor(this.distance), location, discovered: [...this.discovered], waypoint: this.waypoint, nearbyCar: this.nearbyCar,
      nearbyVehicleKind: near?.enterable ? near.kind : null,
      nearbyVehicleLabel: near ? `${VEHICLES[near.kind].name} · ${VEHICLES[near.kind].inspiredBy}` : null,
      enterHint,
      damage: Math.round(this.damage), impact: this.impact, frontDistance: Math.round(this.frontDistance),
      vehicleKind: this.vehicleKind, acceleration: this.acceleration, frontBlocked: this.frontBlocked, crashed: this.crashed, skidding: this.skidding,
      boosting: this.boosting, boost: Math.round(this.boost), boostEnabled: this.boostEnabled,
      car: { x: this.car.x, z: this.car.z, yaw: this.car.yaw, speed: this.car.speed, steer: this.car.steer, wheelSpin: this.car.wheelSpin, braking: this.car.braking },
      transition: this.transition,
      parked: this.parked.map(p => ({ ...p })),
      room: null,
      dots: [],
      stridePhase: this.stride, moveBlend: this.moveBlend, airborne: this.y > 0.02, landDip: Math.max(0, Math.min(1, this.landDip)),
      traffic: this.traffic.map(t => ({ x: t.x, z: t.z, yaw: t.yaw, speed: t.speed, steer: t.steer, wheelSpin: t.wheelSpin, braking: t.braking })),
      peds: this.peds.map(p => ({ x: p.x, z: p.z, yaw: p.yaw, phase: p.phase, moving: p.move, ragdoll: p.ragdoll, ry: p.ry, rpitch: p.rpitch, rollYaw: p.rollYaw, dead: p.dead })),
      pedBloodAt: this.pedBloodAt,
      pedBloodSeq: this.pedBloodSeq,
      time: this.time,
      hp: Math.round(this.hp), dead: this.dead,
      wastedIn: this.dead ? Math.max(0, 4 - (this.time - this.wastedAt)) : 0,
      armed: this.armed, aiming: this.aiming, gunIndex: this.gunIndex,
      mag: this.mags[this.gunIndex] ?? 0, magSize: GUNS[this.gunIndex].mag,
      reloading: this.reloading, reloadT: this.reloadT, reloadDur: this.reloadDur,
      hitSeq: this.hitSeq, hitKill: this.hitKill, hitAt: this.hitAt,
      shotSeq: this.shotSeq, shotCls: this.shots.length > 0 ? this.shots[this.shots.length - 1].cls : '',
      drySeq: this.drySeq, reloadSeq: this.reloadSeq, explodeSeq: this.explodeSeq,
      hurtSeq: this.hurtSeq, deathSeq: this.deathSeq,
      shots: this.shots.map(s => ({ ...s })),
      booms: this.booms.map(b => ({ ...b })),
      burners: this.burners.map(b => ({ ...b })),
      carBurning: this.carBurning, carWrecked: this.carWrecked,
      mode: this.mode, nearTable: this.nearTable, nearHoop: this.nearHoop,
      table: this.mode === 'table' ? this.table.snapshot : null,
      tableFlags: { ...this.table.flags },
      basket: this.mode === 'basket' ? this.basket.snapshot : null,
      basketFlags: { played: this.basket.attempts > 0, swish: this.basket.swishes > 0, streak3: this.basket.best >= 3 },
      blinker: this.blinker, blinkerManual: this.blinkerManual, nearArena: this.nearArena,
      aimScreenX: 0.5, aimScreenY: 0.5 };
  }
  begin(): void { this.phase = 'playing'; this.clearInput(); }
  /** Back to the entry screen (keeps world position; clears transient input). */
  exitToIntro(): void { this.phase = 'ready'; this.paused = false; this.clearInput(); }
  clearInput(): void { this.keys.clear(); this.stick = { x: 0, y: 0 }; this.jumpPressed = false; this.pvx = 0; this.pvz = 0; }
  setInput(action: WorldAction, down: boolean, source: string): void {
    if (!down) { this.keys.delete(source); return; }
    if (!this.active) return;
    if (this.dead) return;
    if (action === 'jump' && !this.keys.has(source)) this.jumpPressed = true;
    if (action === 'fire' && !this.keys.has(source)) this.triggerEdge = true;
    this.keys.set(source, action);
  }
  setStick(x: number, y: number): void {
    if (!this.active) return;
    const length = Math.max(1, Math.hypot(x, y)); this.stick = { x: x / length, y: y / length };
  }
  look(dx: number, dy: number): void {
    if (!this.active) return;
    this.lookUntil = this.time + 3;
    // ADS steadies the hands: slower look while aiming, slowest through glass.
    let steady = 1;
    if (this.armed && this.aiming && !this.driving) {
      steady = GUNS[this.gunIndex]?.scoped ? 0.35 : 0.6;
    }
    this.yaw += dx * 0.004 * steady; this.pitch = clamp(this.pitch + dy * 0.003 * steady, -0.7, 0.85);
  }
  toggleView(): void { this.view = this.view === 'third' ? 'first' : 'third'; if (this.driving) { this.yaw = this.car.yaw; this.pitch = 0.08; } }
  togglePause(): void { if (this.phase === 'playing') { this.paused = !this.paused; this.clearInput(); } }
  cycleVehicle(): boolean {
    if (!this.active || this.dead || this.mode !== 'roam' || !this.driving || Math.abs(this.car.speed) > 0.2 || this.transition > 0) return false;
    const next = VEHICLE_KINDS[(VEHICLE_KINDS.indexOf(this.vehicleKind) + 1) % VEHICLE_KINDS.length];
    if (Math.abs(this.lateralSpeed) > 0.2 || this.contact(vehicleBody(this.car.x, this.car.z, this.car.yaw, next), undefined, false, this.carY)) return false;
    this.vehicleKind = next; this.lateralSpeed = 0; return true;
  }
  repair(): void { this.damage = 0; }

  // ---------------- GTA combat: arsenal, wounds, wrecks ----------------
  /** Cycle armed pistol → … → LMG → disarm (G key / GUN button). */
  armCycle(): void {
    if (!this.active || this.dead || this.mode !== 'roam') return;
    if (!this.armed) { this.armed = true; this.gunIndex = 0; }
    else {
      this.gunIndex++;
      if (this.gunIndex >= GUNS.length) { this.armed = false; this.gunIndex = 0; this.aiming = false; }
    }
    this.cancelReload();
  }
  /** Arm a specific gun directly (digit keys). */
  selectGun(i: number): void {
    if (!this.active || this.dead || this.mode !== 'roam') return;
    this.armed = true;
    this.gunIndex = ((i % GUNS.length) + GUNS.length) % GUNS.length;
    this.cancelReload();
  }
  /** Put it away (weapon dock ✕ / cycling past the LMG). */
  disarm(): void {
    this.armed = false; this.aiming = false;
    for (const [s, a] of this.keys) if (a === 'aim') this.keys.delete(s);
    this.cancelReload();
  }
  /** Start a reload (R key / RELOAD button, or auto on empty trigger). */
  startReload(): void {
    if (!this.active || this.dead || !this.armed || this.reloading || this.driving || this.mode !== 'roam') return;
    const gun = GUNS[this.gunIndex];
    if (this.mags[this.gunIndex] >= gun.mag) return;
    this.reloading = true; this.reloadT = gun.reload; this.reloadDur = gun.reload;
    this.reloadSeq++;
  }
  private cancelReload(): void { this.reloading = false; this.reloadT = 0; }
  /** Wound the player (crashes, falls, fire, blasts). Blood flashes at most 2×/s. */
  hurtPlayer(amount: number, _cause: string, blood = true): void {
    if (!this.active || this.dead || !(amount > 0)) return;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHurtAt = this.time;
    if (blood && this.time - this.lastBloodFxAt > 0.5) {
      this.lastBloodFxAt = this.time;
      this.pedBloodAt = this.time; this.pedBloodSeq += 1;
    }
    this.hurtSeq++;
    if (this.hp <= 0) this.die();
  }
  private die(): void {
    this.dead = true; this.wastedAt = this.time; this.deathSeq++;
    this.aiming = false; this.cancelReload();
    if (this.driving) {
      this.driving = false; this.car.speed = 0;
      this.x = this.car.x; this.z = this.car.z; this.y = this.carY; this.vy = 0;
    }
    this.clearInput();
  }
  /** GTA rules: keep your guns, wake up at the spawn with full health. */
  private respawn(): void {
    this.x = 12; this.z = 34; this.yaw = -0.25; this.facing = -0.25;
    const g = Math.max(0, groundHeight(this.x, this.z, 0));
    this.y = g; this.vy = 0;
    this.hp = 100; this.dead = false;
    this.clearInput();
    this.previous = { x: this.x, z: this.z, y: this.y };
  }
  /** One trigger pull (semi) or interval tick (auto): pellets, falloff, FX. */
  private fireBullet(): void {
    const gun = GUNS[this.gunIndex];
    this.mags[this.gunIndex]--;
    this.fireTimer = gun.interval;
    this.shotSeq++;
    // Hip-fire magnetism: snap to the closest target inside a narrow cone.
    let yaw = this.yaw;
    if (!this.aiming) {
      const snap = this.aimSnap(yaw, gun.range);
      if (snap !== null) yaw = snap;
    }
    this.facing = yaw;
    const moving = Math.hypot(this.pvx, this.pvz) > 1;
    const spreadDeg = (this.aiming ? gun.spreadAim : gun.spreadHip) + (moving ? 1.5 : 0);
    const ox = this.x, oy = this.y + 1.55, oz = this.z;
    const mzl = gun.len / 2 + 0.5;
    for (let p = 0; p < gun.pellets; p++) {
      const a = yaw + (Math.random() * 2 - 1) * spreadDeg * Math.PI / 180;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const mx = ox + dx * mzl, mz = oz + dz * mzl;
      let range = gun.range;
      const wall = this.rayWalls(ox, oz, dx, dz, range);
      if (wall !== null) range = wall;
      let ex = ox + dx * range, ez = oz + dz * range;
      const hit = this.rayTargets(ox, oz, dx, dz, range);
      if (hit) {
        const fall = hit.t > gun.range * 0.6 ? 0.5 : 1;
        if (hit.kind === 'ped') this.pedHit(hit.ped, gun.damage * fall, dx, dz);
        else this.damageVehicle(hit, gun.damage * gun.vehMult * fall);
        ex = ox + dx * hit.t; ez = oz + dz * hit.t;
      }
      this.shots.push({ mx, my: oy, mz, ex, ey: oy - 0.25, ez, born: this.time, cls: gun.cls });
    }
    this.pitch = clamp(this.pitch + gun.kick, -0.7, 0.85);
  }
  /** Closest shootable inside a 14° cone (hip-fire assist). */
  private aimSnap(yaw: number, range: number): number | null {
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    let best: number | null = null, bestScore = 14 * Math.PI / 180;
    const consider = (tx: number, tz: number) => {
      const dx = tx - this.x, dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1 || dist > range) return;
      const ang = Math.acos(clamp((dx * fx + dz * fz) / dist, -1, 1));
      if (ang < bestScore) { bestScore = ang; best = Math.atan2(dx, -dz); }
    };
    for (const p of this.peds) if (!p.dead) consider(p.x, p.z);
    for (const t of this.traffic) consider(t.x, t.z);
    for (const p of this.parked) consider(p.x, p.z);
    if (!this.carWrecked) consider(this.car.x, this.car.z);
    return best;
  }
  /** Nearest bullet impact: buildings block, then peds and vehicles. */
  private rayTargets(ox: number, oz: number, dx: number, dz: number, range: number):
    { kind: 'ped'; ped: Ped; t: number } | { kind: 'traffic'; index: number; t: number } | { kind: 'parked'; index: number; t: number } | { kind: 'player'; t: number } | null {
    let best: { kind: 'ped'; ped: Ped; t: number } | { kind: 'traffic'; index: number; t: number } | { kind: 'parked'; index: number; t: number } | { kind: 'player'; t: number } | null = null;
    const closer = (t: number | null): boolean => t !== null && t < range && (!best || t < best.t);
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const t = rayCircle(ox, oz, dx, dz, ped.x, ped.z, 0.6);
      if (closer(t)) best = { kind: 'ped', ped, t: t! };
    }
    this.traffic.forEach((t, i) => {
      const b = vehicleBody(t.x, t.z, t.yaw, t.kind);
      const ht = rayBox(ox, oz, dx, dz, b.x, b.z, b.halfWidth, b.halfLength, b.yaw);
      if (closer(ht)) best = { kind: 'traffic', index: i, t: ht! };
    });
    this.parked.forEach((p, i) => {
      const b = vehicleBody(p.x, p.z, p.yaw, p.kind);
      const ht = rayBox(ox, oz, dx, dz, b.x, b.z, b.halfWidth, b.halfLength, b.yaw);
      if (closer(ht)) best = { kind: 'parked', index: i, t: ht! };
    });
    if (!this.carWrecked) {
      const b = vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind);
      const ht = rayBox(ox, oz, dx, dz, b.x, b.z, b.halfWidth, b.halfLength, b.yaw);
      if (closer(ht)) best = { kind: 'player', t: ht! };
    }
    return best;
  }
  /** Buildings swallow bullets (also the bridge deck sides — thin, ignored). */
  private rayWalls(ox: number, oz: number, dx: number, dz: number, range: number): number | null {
    let best: number | null = null;
    for (const box of SOLIDS) {
      const t = rayBox(ox, oz, dx, dz, box.x, box.z, box.w / 2, box.d / 2, 0);
      if (t !== null && t < range && (best === null || t < best)) best = t;
    }
    return best;
  }
  /** A bullet found flesh: wound, knockdown, blood — death at 0 hp. */
  private pedHit(ped: Ped, dmg: number, kdx: number, kdz: number): void {
    if (ped.dead || dmg <= 0) return;
    ped.hp -= dmg;
    this.pedBloodAt = this.time; this.pedBloodSeq += 1;
    ped.ragdoll = true; ped.ry = Math.max(ped.ry, 0.1);
    ped.rvx = kdx * 5; ped.rvz = kdz * 5; ped.rvy = 3.2;
    ped.rpitch = 0; ped.rpitchRate = -5; ped.rollYaw = ped.yaw;
    ped.scaredUntil = this.time + 8;
    if (ped.hp <= 0) ped.dead = true;
    this.hitSeq++; this.hitKill = ped.dead; this.hitAt = this.time;
  }
  /** A bullet found bodywork: shared road to the bonfire for every vehicle. */
  private damageVehicle(hit: { kind: 'traffic'; index: number } | { kind: 'parked'; index: number } | { kind: 'player' }, dmg: number): void {
    if (dmg <= 0) return;
    if (hit.kind === 'traffic') {
      const t = this.traffic[hit.index]; if (!t) return;
      t.hp -= dmg;
      if (t.hp <= 0 && !t.burning) { t.burning = true; t.burnT = 0; }
    } else if (hit.kind === 'parked') {
      const p = this.parked[hit.index]; if (!p) return;
      p.hp = (p.hp ?? 100) - dmg;
      if ((p.hp ?? 0) <= 0 && !p.burning) { p.burning = true; p.burnT = 0; }
    } else {
      this.damage = clamp(this.damage + dmg, 0, 100);
      if (this.damage >= 100 && !this.carBurning && !this.carWrecked) { this.carBurning = true; this.carBurnT = 0; }
    }
    this.hitSeq++; this.hitKill = false; this.hitAt = this.time;
  }
  /** Burn fuses tick here; explosions resolve through explodeAt. */
  private tickBurning(dt: number): void {
    if (this.carBurning && !this.carWrecked) {
      this.carBurnT += dt;
      if (this.carBurnT > 4) this.explodePlayerCar();
    }
    if (this.carWrecked) {
      this.wreckT += dt;
      if (this.wreckT > 12) this.respawnPlayerCar();
    }
    for (const t of this.traffic) if (t.burning) t.burnT += dt;
    for (const t of [...this.traffic]) {
      if (!t.burning || t.burnT <= 3) continue;
      this.explodeAt(t.x, 1, t.z);
      this.traffic.splice(this.traffic.indexOf(t), 1);
      this.spawnReplacementTraffic();
    }
    for (const p of this.parked) if (p.burning) p.burnT = (p.burnT ?? 0) + dt;
    for (const p of [...this.parked]) {
      if (!p.burning || (p.burnT ?? 0) <= 3) continue;
      this.explodeAt(p.x, 1, p.z);
      // The map collider dies with the car so no ghost wall remains.
      const spot = PARKED_CARS.find(c => Math.hypot(c.x - p.x, c.z - p.z) < 1);
      if (spot) this.clearedStatic.push({ x: spot.x, z: spot.z });
      this.parked.splice(this.parked.indexOf(p), 1);
    }
  }
  /** Your own ride burns out: eject (or torch in place), wreck, later replace. */
  private explodePlayerCar(): void {
    this.explodeAt(this.car.x, this.carY + 1, this.car.z);
    if (this.driving) {
      this.hurtPlayer(70, 'blast');
      if (!this.dead) {
        this.driving = false; this.car.speed = 0;
        this.x = this.car.x + 2.5; this.z = this.car.z; this.y = this.carY; this.vy = 0;
      }
    }
    this.carBurning = false; this.carWrecked = true; this.wreckT = 0;
  }
  /** Explosion: flash + boom + AoE that wounds you, kills peds, chains cars. */
  private explodeAt(x: number, y: number, z: number): void {
    this.booms.push({ x, y, z, born: this.time });
    this.explodeSeq++;
    const pd = Math.hypot(this.x - x, this.z - z);
    if (pd < 9 && Math.abs((this.driving ? this.carY : this.y) - y) < 4) {
      this.hurtPlayer(85 * (1 - pd / 9), 'blast');
    }
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d >= 9) continue;
      const kx = d > 0.5 ? (ped.x - x) / d : 0, kz = d > 0.5 ? (ped.z - z) / d : 0;
      ped.hp = 0;
      this.pedBloodAt = this.time; this.pedBloodSeq += 1;
      ped.ragdoll = true; ped.ry = Math.max(ped.ry, 0.2);
      ped.rvx = kx * 9; ped.rvz = kz * 9; ped.rvy = 5;
      ped.rpitch = 0; ped.rpitchRate = -7; ped.rollYaw = ped.yaw;
      ped.scaredUntil = this.time + 8; ped.dead = true;
      this.hitSeq++; this.hitKill = true; this.hitAt = this.time;
    }
    for (const t of this.traffic) {
      if (Math.hypot(t.x - x, t.z - z) >= 9 || t.burning) continue;
      t.hp -= 70;
      if (t.hp <= 0) { t.burning = true; t.burnT = 0; }
    }
    for (const p of this.parked) {
      if (Math.hypot(p.x - x, p.z - z) >= 9 || p.burning) continue;
      p.hp = (p.hp ?? 100) - 70;
      if ((p.hp ?? 0) <= 0) { p.burning = true; p.burnT = 0; }
    }
    if (!this.carWrecked && Math.hypot(this.car.x - x, this.car.z - z) < 9) {
      this.damage = clamp(this.damage + 70, 0, 100);
      if (this.damage >= 100 && !this.carBurning) { this.carBurning = true; this.carBurnT = 0; }
    }
  }
  /** Burnt-out ride is towed: a fresh one waits at the nearest clear roadside. */
  private respawnPlayerCar(): void {
    for (let r = 12; r <= 60; r += 6) {
      for (let a = 0; a < 12; a++) {
        const x = this.x + Math.cos((a / 12) * Math.PI * 2) * r;
        const z = this.z + Math.sin((a / 12) * Math.PI * 2) * r;
        if (Math.abs(x) + 4 >= LIMIT || Math.abs(z) + 4 >= LIMIT) continue;
        if (!onRoad(x, z, ROAD_HALF - 2) || intersects(x, z, 3) || inWater(x, z)) continue;
        if (groundHeight(x, z, 0) !== 0) continue;
        this.placeAt(x, z, Math.atan2(x - this.x, -(z - this.z)));
        this.damage = 0; this.carWrecked = false; this.carBurning = false;
        return;
      }
    }
    this.damage = 0; this.carWrecked = false; this.carBurning = false;
  }
  /** Live flame anchors for the renderer (player car + every burner). */
  private collectBurners(): BurnerFX[] {
    const out: BurnerFX[] = [];
    if (this.carBurning && !this.carWrecked) out.push({ x: this.car.x, y: this.carY + 1.2, z: this.car.z });
    for (const t of this.traffic) if (t.burning) out.push({ x: t.x, y: 1.2, z: t.z });
    for (const p of this.parked) if (p.burning) out.push({ x: p.x, y: 1.2, z: p.z });
    return out.slice(0, 16);
  }
  interact(): boolean {
    if (!this.active || this.dead) return false;
    if (this.mode !== 'roam') return false;
    if (this.transition > 0) return false;
    if (!this.driving && this.nearTable) return this.enterTable();
    if (!this.driving && this.nearHoop) return this.enterBasket();
    if (!this.driving) {
      // GTA-style: step into the nearest enterable world vehicle — your old ride stays parked.
      const target = this.nearestVehicle();
      if (!target || !target.enterable) return false;
      if (target.type !== 'player') {
        this.parked.push({ kind: this.vehicleKind, x: this.car.x, z: this.car.z, yaw: this.car.yaw, hp: 100, burning: false, burnT: 0 });
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
      // Parked + traffic targets sit at grade; your own ride keeps its height.
      if (target.type !== 'player') { this.carY = 0; this.carPitch = 0; this.y = 0; }
      else this.y = this.carY;
      this.boost = 100; this.boosting = false; this.boostDelay = 0;
      this.transition = 0.35;
    } else {
      // Door candidates follow the vehicle heading and must clear all solid objects.
      const reach = VEHICLES[this.vehicleKind].length / 2 + 0.8;
      const fx = Math.sin(this.car.yaw), fz = -Math.cos(this.car.yaw);
      const rx = Math.cos(this.car.yaw), rz = Math.sin(this.car.yaw);
      const offsets = [[1.9, 0], [-1.9, 0], [1.9, -1.5], [-1.9, -1.5], [0, reach], [0, -reach]];
      // Exits must land on the same surface (deck exits stay on the deck).
      const exit = offsets.map(([right, forward]) => ({ x: this.car.x + rx * right + fx * forward, z: this.car.z + rz * right + fz * forward }))
        .find(p => !this.walkBlocked(p.x, p.z, this.carY) && Math.abs(Math.max(0, groundHeight(p.x, p.z, this.carY)) - this.carY) < 1.2);
      if (!exit) return false;
      this.driving = false; this.lateralSpeed = 0; this.acceleration = 0; this.skidding = false; this.x = exit.x; this.z = exit.z; this.car.speed = 0; this.car.steer = 0; this.car.braking = false;
      this.y = this.carY; this.vy = 0;
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
    const y = this.driving ? this.carY : this.y;
    const mired = inWater(this.driving ? this.car.x : this.x, this.driving ? this.car.z : this.z);
    for (let distance = 0.125; distance <= 13; distance += 0.25) {
      const hit = this.contact({ x: x + fx * (bumper + distance), z: z + fz * (bumper + distance), yaw, halfWidth: 1.12, halfLength: 0.125 }, undefined, false, y, mired);
      if (hit) return { distance: Math.max(0, distance - 0.125), blocked: distance < 6, label: hit.label };
    }
    return { distance: 999, blocked: false, label: null };
  }

  private contact(body: Body, ignore?: TrafficCar, includePlayer = false, y = 0, mired = false): (Contact & { label: string }) | null {
    const boundary = boundaryContact(body, LIMIT);
    if (boundary) return { ...boundary, label: 'boundary' };
    // Bridge support: open water and deck edges are walls — unless the body
    // is already mired, in which case anything goes (escape back to the bank).
    // The promenade under the span is feet-only: cars read it as a wall.
    // Normals come from car-perspective heights (promenade counts as blocked)
    // so the gradient never goes flat at the water line: impacts register,
    // velocity dies, and the car settles instead of grinding in place.
    const ch = (x: number, z: number): number => {
      const g = groundHeight(x, z, y);
      if (g < 0) return g;
      if (y < 1.5 && inPromenade(x, z)) return -1.6;
      return g;
    };
    const h = groundHeight(body.x, body.z, y);
    if (!mired && (h < 0 || Math.abs(h - y) > 1.2)) {
      const s = 1.2;
      const gx = ch(body.x + s, body.z) - ch(body.x - s, body.z);
      const gz = ch(body.x, body.z + s) - ch(body.x, body.z - s);
      const len = Math.hypot(gx, gz) || 1;
      return { nx: gx / len, nz: gz / len, depth: 0.3, label: h < 0 ? 'water' : 'ledge' };
    }
    if (!mired && y < 1.5 && inPromenade(body.x, body.z)) {
      const dxl = body.x - PROMENADE.x0, dxr = PROMENADE.x1 - body.x;
      const dzl = body.z - PROMENADE.z0, dzr = PROMENADE.z1 - body.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      const n = m === dxl ? { nx: -1, nz: 0 } : m === dxr ? { nx: 1, nz: 0 } : m === dzl ? { nx: 0, nz: -1 } : { nx: 0, nz: 1 };
      return { ...n, depth: 0.3, label: 'promenade' };
    }
    for (const box of SOLIDS) {
      const hit = bodyContact(body, { x: box.x, z: box.z, yaw: 0, halfWidth: box.w / 2, halfLength: box.d / 2 });
      if (hit) return { ...hit, label: 'building' };
    }
    // Everything below sits at grade: ignore it while up on the bridge deck.
    const high = Math.abs(y) > 1.5;
    for (const p of PARKED_CARS) {
      if (high) break;
      if (this.clearedStatic.some(c => Math.abs(c.x - p.x) < 0.5 && Math.abs(c.z - p.z) < 0.5)) continue;
      const hit = bodyContact(body, vehicleBody(p.x, p.z, 0, p.label === 'parked-van' ? 'van' : 'car'));
      if (hit) return { ...hit, label: p.label ?? 'parked car' };
    }
    // Dynamic parked fleet (includes stolen-car leftovers + your old rides).
    for (const p of this.parked) {
      if (high) break;
      const hit = bodyContact(body, vehicleBody(p.x, p.z, p.yaw, p.kind));
      if (hit) return { ...hit, label: 'parked car' };
    }
    // Your last ride stays solid while you are on foot.
    if (!this.driving && !high) {
      const hit = bodyContact(body, vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind));
      if (hit) return { ...hit, label: 'parked car' };
    }
    for (const t of this.traffic) {
      if (t === ignore || high) continue;
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
  private walkBlocked(x: number, z: number, y = this.y): boolean {
    // Open water blocks — but the bridge deck flying above it does not.
    if (groundHeight(x, z, y) < 0) return true;
    const high = Math.abs(y) > 1.5;
    return Math.abs(x) + 0.48 >= LIMIT || Math.abs(z) + 0.48 >= LIMIT || intersects(x, z, 0.48) ||
      (!high && !!circleContact(vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind), x, z, 0.48)) ||
      (!high && PARKED_CARS.some(p => !this.clearedStatic.some(c => Math.abs(c.x - p.x) < 0.5 && Math.abs(c.z - p.z) < 0.5) && circleContact(vehicleBody(p.x, p.z, 0, p.label === 'parked-van' ? 'van' : 'car'), x, z, 0.48))) ||
      (!high && this.parked.some(p => circleContact(vehicleBody(p.x, p.z, p.yaw, p.kind), x, z, 0.48))) ||
      (!high && this.traffic.some(t => circleContact(vehicleBody(t.x, t.z, t.yaw, t.kind), x, z, 0.48))) ||
      PROPS.some(p => circleHit(x, z, 0.48, p.x, p.z, p.r));
  }
  /** Sweep translation AND rotation; only commit non-overlapping poses. */
  private moveCar(dt: number, wantedYaw: number): void {
    let vx = Math.sin(wantedYaw) * this.car.speed + Math.cos(wantedYaw) * this.lateralSpeed;
    let vz = -Math.cos(wantedYaw) * this.car.speed + Math.sin(wantedYaw) * this.lateralSpeed;
    const turn = wantedYaw - this.car.yaw;
    const steps = Math.max(1, Math.ceil((Math.hypot(vx, vz) * dt + Math.abs(turn) * VEHICLES[this.vehicleKind].length / 2) / 0.12));
    const h = dt / steps; let yawStep = turn / steps;
    // Mired in the drink (debug/teleport only — gameplay can never enter
    // water): relax the support wall so the car can crawl back to the bank.
    // Raw water test on purpose: a car beached ON the promenade reads dry
    // ground but still needs the escape hatch.
    const mired = inWater(this.car.x, this.car.z);
    for (let i = 0; i < steps; i++) {
      const x = this.car.x, z = this.car.z, yaw = this.car.yaw;
      const nx = x + vx * h, nz = z + vz * h, nyaw = yaw + yawStep;
      const hit = this.contact(vehicleBody(nx, nz, nyaw, this.vehicleKind), undefined, false, this.carY, mired);
      if (!hit) { this.car.x = nx; this.car.z = nz; this.car.yaw = nyaw; }
      else {
        // Resolve to the last safe pose, including the vehicle's rotation.
        let lo = 0, hi = 1;
        for (let j = 0; j < 10; j++) {
          const mid = (lo + hi) / 2;
          if (this.contact(vehicleBody(x + (nx - x) * mid, z + (nz - z) * mid, yaw + yawStep * mid, this.vehicleKind), undefined, false, this.carY, mired)) hi = mid;
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
        if (!this.contact(vehicleBody(sx, sz, this.car.yaw, this.vehicleKind), undefined, false, this.carY, mired)) { this.car.x = sx; this.car.z = sz; }
      }
      const body = vehicleBody(this.car.x, this.car.z, this.car.yaw, this.vehicleKind);
      const carSpeed = Math.hypot(vx, vz);
      // Peds stay at grade: a car flying over on the bridge deck passes above them.
      const highAbovePeds = Math.abs(this.carY) > 1.5;
      for (const ped of this.peds) if (!highAbovePeds && !ped.dead && !ped.ragdoll && this.time >= ped.scaredUntil && circleContact(body, ped.x, ped.z, 0.5)) {
        // Launch ragdoll — vehicle rolls right over at full speed.
        ped.ragdoll = true;
        ped.ry = 0;
        // Inherit vehicle velocity + upward launch to arc over the hood.
        const launchSpeed = Math.max(carSpeed, 4);
        ped.rvx = vx * 0.85 + Math.cos(this.car.yaw) * 1.5;
        ped.rvz = vz * 0.85 + Math.sin(this.car.yaw) * 1.5;
        ped.rvy = launchSpeed * 0.55 + 2.2; // upward impulse
        ped.rpitch = 0;
        ped.rpitchRate = (carSpeed > 4 ? -6.5 : -3.5); // forward tumble rate
        ped.rollYaw = ped.yaw; // preserve yaw at moment of impact
        ped.scaredUntil = this.time + 12; // long recover time
        // Fast hits kill outright (corpse never recovers); slow taps knock down.
        if (carSpeed > 8) {
          ped.hp = 0; ped.dead = true;
          this.hitSeq++; this.hitKill = true; this.hitAt = this.time;
        }
        // No registerImpact here: pedestrian hits never flash "CRASH vs PEDESTRIAN",
        // never shake the camera, damage the car, or slow it (no crashUntil lockout).
        this.pedBloodAt = this.time;
        this.pedBloodSeq += 1;
        // Vehicle does NOT slow down — roll right over.
      }
    }
    this.x = this.car.x; this.z = this.car.z;
    this.car.speed = vx * Math.sin(this.car.yaw) - vz * Math.cos(this.car.yaw);
    this.lateralSpeed = vx * Math.cos(this.car.yaw) + vz * Math.sin(this.car.yaw);
    // Ride the surface: ramps lift the car, deck edges and water hold it back.
    const support = groundHeight(this.car.x, this.car.z, this.carY);
    if (support >= 0 && Math.abs(support - this.carY) <= 1.2) this.carY = support;
    // Body follows the slope under the nose (facing-relative, so reversing
    // down a ramp still tilts the right way).
    const fx = Math.sin(this.car.yaw), fz = -Math.cos(this.car.yaw);
    const ahead = Math.max(0, groundHeight(this.car.x + fx * 2, this.car.z + fz * 2, this.carY));
    const behind = Math.max(0, groundHeight(this.car.x - fx * 2, this.car.z - fz * 2, this.carY));
    const slopePitch = Math.atan2(ahead - behind, 4);
    this.carPitch += (clamp(slopePitch, -0.3, 0.3) - this.carPitch) * 0.2;
  }
  private registerImpact(speed: number, withWhat: string, minor = false): void {
    const s = Math.abs(speed);
    if (s < 2.5 || this.crashed) return; // soft taps never flash; lockout prevents multi-trigger
    this.impact = { speed: Math.round(s * 3.6), with: withWhat, at: this.time };
    if (s > 5) {
      const gain = (s - 5) * (minor ? 0.7 : 2.0);
      this.damage = clamp(this.damage + gain, 0, 100);
    }
    // The driver feels big hits too (seatbelts off, GTA rules).
    if (this.driving && s > 4) this.hurtPlayer((s - 4) * 2.2, 'crash', s > 8);
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
      // While a race is live, hold traffic outside the cleared grid bubble
      // instead of driving through the start line. Everything else flows normally.
      // Both endpoints are checked (no speed gate) so the car stops at the last
      // outside pose instead of overshooting a car length into the bubble.
      if (this.raceClearActive && (this.nearGridBubble(t.x, t.z, GRID_BUBBLE_RADIUS) || this.nearGridBubble(q.x, q.z, GRID_BUBBLE_RADIUS))) {
        t.speed = 0; t.braking = true; t.steer = 0;
        continue;
      }
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
      // Ragdoll physics: arc through the air then slide on the ground.
      if (ped.ragdoll) {
        ped.rvy -= 18 * dt; // gravity
        ped.ry = Math.max(0, ped.ry + ped.rvy * dt);
        ped.x += ped.rvx * dt;
        ped.z += ped.rvz * dt;
        ped.rpitch += ped.rpitchRate * dt;
        if (ped.ry <= 0) {
          // Landed: friction stops the slide, recover after scaredUntil.
          const friction = Math.exp(-5.5 * dt);
          ped.rvx *= friction; ped.rvz *= friction; ped.rvy = 0;
          ped.rpitchRate *= friction;
          const groundSpeed = Math.hypot(ped.rvx, ped.rvz);
          if (groundSpeed < 0.05 && !ped.dead && this.time >= ped.scaredUntil - 6) {
            // Ped gets up: snap back onto their route closest to current position.
            ped.ragdoll = false; ped.ry = 0; ped.rvx = 0; ped.rvz = 0; ped.rvy = 0; ped.rpitch = 0; ped.rpitchRate = 0;
            // Find closest point on their route.
            let bestDist = ped.dist, bestD = 999;
            for (let k = 0; k < 600; k += 2) {
              const q = routePoint(ped.route, ped.dist + k - 300);
              const d = Math.hypot(q.x - ped.x, q.z - ped.z);
              if (d < bestD) { bestD = d; bestDist = ped.dist + k - 300; }
            }
            ped.dist = bestDist;
            const q = routePoint(ped.route, ped.dist);
            ped.x = q.x; ped.z = q.z; ped.yaw = q.yaw;
          }
        }
        ped.move = 0;
        continue;
      }
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
      // ── Nitro boost (RACING ONLY): Shift / BOOST while pushing forward.
      // Drains 32/s, auto-refills 14/s after a 0.9s delay. Needs >1% to kick in. ──
      const wantBoost = this.boostEnabled && this.held('sprint') && forward > 0.1 && !crashed && this.boost > 1;
      this.boosting = wantBoost && this.boost > 0;
      if (this.boosting) {
        this.boost = Math.max(0, this.boost - 32 * dt);
        this.boostDelay = 0.9;
        if (this.boost <= 0) this.boosting = false;
      } else {
        this.boostDelay = Math.max(0, this.boostDelay - dt);
        if (this.boostDelay <= 0) this.boost = Math.min(100, this.boost + 14 * dt);
      }
      const baseTop = spec.topSpeed * (1 - this.damage / 160);
      const topSpeed = this.boosting ? baseTop * 1.45 : baseTop;
      const opposing = forward !== 0 && forward * oldSpeed < -0.1;
      const gripF = this.weatherGrip;
      const drag = 0.65 + 0.008 * oldSpeed * oldSpeed;
      let force = forward * spec.acceleration * (this.boosting ? 1.9 : 1) * Math.max(0.15, 1 - Math.abs(oldSpeed) / (forward < 0 ? 7 : topSpeed));
      if (opposing) force = forward * 13 * gripF;
      if (!forward || handbrake || crashed) {
        const decel = crashed ? 14 : handbrake ? 9 * gripF : drag;
        this.car.speed = Math.sign(oldSpeed) * Math.max(0, Math.abs(oldSpeed) - decel * dt);
      } else this.car.speed = clamp(oldSpeed + (force - Math.sign(oldSpeed) * drag) * dt, -7, topSpeed);
      this.acceleration = (this.car.speed - oldSpeed) / dt;
      this.car.steer += ((crashed ? 0 : side) - this.car.steer) * (1 - Math.exp(-6 * dt));
      const steeringAngle = this.car.steer * 0.55 / (1 + Math.abs(this.car.speed) / 24);
      const yawRate = this.car.speed / (spec.length * 0.64) * Math.tan(steeringAngle) * (handbrake ? 1.5 : 1);
      const wantedYaw = oldYaw + clamp(yawRate, -1.7, 1.7) * dt;
      const deltaYaw = wantedYaw - oldYaw;
      // Preserve momentum across a turning chassis; tire grip dissipates lateral slip.
      // Weather scales grip: rain 0.85x, snow 0.7x (longer slides, longer braking).
      this.lateralSpeed = (this.lateralSpeed - oldSpeed * deltaYaw) * Math.exp(-(handbrake ? 0.65 : spec.grip * this.weatherGrip) * dt);
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
      // Turn signals: manual Z/X override, else auto from steering while moving.
      // Only a deliberately held signal counts as manual (drives the HUD pill).
      const sigL = this.held('signalLeft');
      const sigR = this.held('signalRight');
      this.blinkerManual = sigL || sigR;
      if (sigL && sigR) this.blinker = 3;
      else if (sigL) this.blinker = 1;
      else if (sigR) this.blinker = 2;
      else if (Math.abs(this.car.speed) > 3 && this.car.steer < -0.28) this.blinker = 1;
      else if (Math.abs(this.car.speed) > 3 && this.car.steer > 0.28) this.blinker = 2;
      else this.blinker = 0;
      if (this.view === 'first') this.yaw += this.car.yaw - oldYaw;
      else if (this.time > this.lookUntil) this.yaw += Math.atan2(Math.sin(this.car.yaw - this.yaw), Math.cos(this.car.yaw - this.yaw)) * dt * 2;
    } else {
      this.frontDistance = 999; this.frontBlocked = false; this.skidding = false;
      this.blinker = 0; this.blinkerManual = false;
      this.boosting = false;
      this.boostDelay = Math.max(0, this.boostDelay - dt);
      if (this.boostDelay <= 0) this.boost = Math.min(100, this.boost + 14 * dt);
      // --- GTA combat (on foot, roam only): aim, fire, reload, regen ---
      this.aiming = this.armed && this.held('aim');
      if (this.armed && this.aiming) this.facing = this.yaw;
      if (this.hp < 50 && this.time - this.lastHurtAt > 6) this.hp = Math.min(50, this.hp + 10 * dt);
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.reloading = false;
          this.mags[this.gunIndex] = GUNS[this.gunIndex].mag;
        }
      }
      this.fireTimer = Math.max(0, this.fireTimer - dt);
      if (this.armed && !this.reloading && this.fireTimer <= 0) {
        const gun = GUNS[this.gunIndex];
        const wantFire = gun.auto ? this.held('fire') : this.triggerEdge;
        if (wantFire) {
          if (this.mags[this.gunIndex] <= 0) {
            this.drySeq++; this.fireTimer = 0.3; this.triggerEdge = false;
            this.startReload();
          } else {
            this.fireBullet();
            if (!gun.auto) this.triggerEdge = false;
          }
        }
      }
      // On foot the canal is a wall and ramps are walkable (1m step-up limit).
      // Mired starts (teleport only) may always step back to dry land.
      const groundHere = Math.max(0, groundHeight(this.x, this.z, this.y));
      const inDrink = groundHeight(this.x, this.z, this.y) < 0;
      const grounded = this.y <= groundHere + 0.02;
      const footBlocked = (px: number, pz: number): boolean => {
        if (!inDrink && groundHeight(px, pz, this.y) < 0) return true;
        if (groundHeight(px, pz, this.y) - this.y > 1.0) return true;
        return this.walkBlocked(px, pz);
      };
      const length = Math.max(1, Math.hypot(forward, side));
      const targetSpeed = this.aiming ? 2.6 : this.held('sprint') ? 8 : 4.6;
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
      const blocks = (px: number, pz: number) => footBlocked(px, pz);
      // Axis separation permits sliding along facades instead of sticking to corners.
      if (!intersects(x, this.z, 0.48) && !blocks(x, this.z)) this.x = x; else this.pvx = 0;
      if (!intersects(this.x, z, 0.48) && !blocks(this.x, z)) this.z = z; else this.pvz = 0;
      // Ramps carry the feet up; walking off the deck edge means falling.
      const groundNow = Math.max(0, groundHeight(this.x, this.z, this.y));
      if (this.y < groundNow && groundNow - this.y <= 1.0) { this.y = groundNow; this.vy = 0; }
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
      const ground = Math.max(0, groundHeight(this.x, this.z, this.y));
      if (this.jumpPressed && grounded) this.vy = 5.4;
      const fallVy = this.vy;
      this.vy -= 17 * dt; this.y = Math.max(ground, this.y + this.vy * dt);
      if (this.y === ground) {
        if (fallVy < -4) this.landDip = 1;
        if (fallVy < -9) this.hurtPlayer((-fallVy - 9) * 5, 'fall');
        this.vy = 0;
      }
      this.landDip = Math.max(0, this.landDip - 5 * dt);
    }
    this.syncCrowd(dt);
    this.jumpPressed = false;
    this.triggerEdge = false;
    // Burn fuses, wreck timers, FX pruning, respawn (every frame, any mode).
    this.tickBurning(dt);
    this.burners = this.collectBurners();
    if (this.shots.length > 40) this.shots.splice(0, this.shots.length - 40);
    this.shots = this.shots.filter(s => this.time - s.born < 0.25);
    this.booms = this.booms.filter(b => this.time - b.born < 0.9);
    for (const f of this.burners) {
      if (Math.hypot(this.x - f.x, this.z - f.z) >= 3) continue;
      if (Math.abs((this.driving ? this.carY : this.y) - f.y) >= 3) continue;
      this.hurtPlayer(9 * dt, 'fire');
    }
    if (this.dead && this.time - this.wastedAt > 4) this.respawn();
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
