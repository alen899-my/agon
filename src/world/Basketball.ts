/** Free-throw practice sim. Local coords: rim center floor projection = origin,
 *  shooter stands at z=-4.2 heaving toward +z. No aim control — power decides all. */
export type BBPhase = 'hold' | 'flight' | 'done';
export interface BBEvent { kind: 'shoot' | 'bounce' | 'rim' | 'board' | 'swish' | 'score' | 'rimout'; speedKmh: number; detail?: string }
export interface BBSnapshot {
  ball: { x: number; y: number; z: number }; speedKmh: number;
  power: number; pumping: boolean; phase: BBPhase;
  makes: number; attempts: number; streak: number; best: number;
  message: string; rimShake: number; swish: number;
  spot: { x: number; z: number }; spotLabel: string;
  greenLo: number; greenHi: number;
}
export const BB = {
  GRAV: 9.81, DRAG: 0.12, MAGNUS: 0.12, BALL_R: 0.12,
  RIM_H: 3.05, RIM_R: 0.225, TUBE: 0.02,
  BOARD_Z: 0.45, BOARD_W: 1.8, BOARD_BOT: 2.9, BOARD_TOP: 3.95,
  SPOT_Z: -4.2, HAND_Y: 1.9, ANGLE: 53 * Math.PI / 180, BACKSPIN: 2.5,
  CHARGE_RATE: 0.85,
  SPOT_MIN: 3.0, SPOT_MAX: 6.25, SPOT_ANGLE: 50,
} as const;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const kmh = (x: number, y: number, z: number) => Math.round(Math.hypot(x, y, z) * 3.6);
// Rim ring sample points for rattle/roll realism.
const RIM_PTS: { x: number; z: number }[] = [];
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  RIM_PTS.push({ x: Math.cos(a) * BB.RIM_R, z: Math.sin(a) * BB.RIM_R });
}

export class BasketballSim {
  ball: { x: number; y: number; z: number } = { x: 0, y: BB.HAND_Y, z: BB.SPOT_Z };
  vel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  power = 0; private chargeDir = 1; pumping = false;
  phase: BBPhase = 'hold';
  makes = 0; attempts = 0; streak = 0; best = 0; swishes = 0;
  message = 'TAP SPACE / TAP SHOOT — TAP AGAIN TO THROW';
  // Randomized per-shot challenge: where you stand, how fast the meter pumps, where green sits.
  spot: { x: number; z: number } = { x: 0, z: -4.2 };
  spotLabel = 'FREE THROW · 4.2M';
  rate: number = BB.CHARGE_RATE;
  greenCenter: number = 0.78; greenHalf: number = 0.065;
  doneTimer = 0;
  rimShake = 0; swish = 0;
  rimTouched = false; boardTouched = false; scored = false; resolved = false;
  maxY = 0;
  events: BBEvent[] = [];

  resetStats(): void {
    this.makes = 0; this.attempts = 0; this.streak = 0; this.best = 0; this.swishes = 0;
    this.setupHold();
  }
  /** Fixed spot (used by tests); re-solves the green window for it. */
  setSpot(dist: number, angleDeg: number): void {
    const a = angleDeg * Math.PI / 180;
    this.spot = { x: dist * Math.sin(a), z: -dist * Math.cos(a) };
    this.labelSpot(dist, angleDeg);
    this.solveGreen();
  }
  private labelSpot(dist: number, angleDeg: number): void {
    const zone = Math.abs(angleDeg) < 12 ? 'TOP' : Math.abs(angleDeg) < 35 ? 'WING' : 'CORNER';
    this.spotLabel = `${zone} · ${dist.toFixed(1)}M`;
  }
  private randomizeSpot(): void {
    const dist = BB.SPOT_MIN + Math.random() * (BB.SPOT_MAX - BB.SPOT_MIN);
    const angle = (Math.random() - 0.5) * 2 * BB.SPOT_ANGLE;
    this.setSpot(dist, angle);
  }
  /** Find the meter power that drops clean for the current spot by probing the real physics. */
  private solveGreen(): void {
    const scores = (v: number): boolean => {
      const probe = new BasketballSim();
      probe.spot = { ...this.spot };
      probe.phase = 'flight';
      probe.ball = { x: this.spot.x, y: BB.HAND_Y, z: this.spot.z };
      const d = Math.max(0.5, Math.hypot(this.spot.x, this.spot.z));
      probe.vel = { x: -this.spot.x / d * v * Math.cos(BB.ANGLE), y: v * Math.sin(BB.ANGLE), z: -this.spot.z / d * v * Math.cos(BB.ANGLE) };
      for (let i = 0; i < 450 && probe.phase === 'flight'; i++) probe.update(1 / 60);
      return probe.makes > 0;
    };
    // Coarse scan, then refine around the first make.
    let seed = -1;
    for (let v = 5; v <= 12; v += 0.25) {
      if (scores(v)) { seed = v; break; }
    }
    if (seed < 0) return;
    const band: number[] = [];
    for (let v = seed - 0.4; v <= seed + 0.4; v += 0.05) {
      if (v >= 5 && v <= 12 && scores(v)) band.push(v);
    }
    if (band.length > 0) {
      const mean = band.reduce((a, b) => a + b, 0) / band.length;
      this.greenCenter = clamp((mean - 4.8) / 6.0, 0.05, 0.98);
    }
  }
  private velocityFor(power: number, wobble: number): { x: number; y: number; z: number } {
    const p = clamp(power, 0.05, 1);
    const speed = 4.8 + p * 6.0;
    const d = Math.max(0.5, Math.hypot(this.spot.x, this.spot.z));
    const dx = -this.spot.x / d, dz = -this.spot.z / d; // toward the rim
    const wob = (Math.random() - 0.5) * wobble;
    return {
      x: (dx * speed + -dz * wob) * Math.cos(BB.ANGLE),
      y: speed * Math.sin(BB.ANGLE),
      z: (dz * speed + dx * wob) * Math.cos(BB.ANGLE),
    };
  }
  setupHold(keepSpot = false): void {
    this.phase = 'hold'; this.power = 0; this.chargeDir = 1; this.pumping = false;
    if (!keepSpot && (this.attempts > 0 || this.makes > 0)) this.randomizeSpot();
    // Meter quickens as you heat up; green shrinks with the streak.
    this.rate = Math.min(1.7, 0.75 + this.attempts * 0.03 + Math.random() * 0.15);
    this.greenHalf = Math.max(0.03, 0.065 - this.streak * 0.004);
    this.ball = { x: this.spot.x, y: BB.HAND_Y, z: this.spot.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.rimTouched = false; this.boardTouched = false; this.scored = false; this.resolved = false;
    this.maxY = BB.HAND_Y; this.doneTimer = 0;
    this.message = 'TAP SPACE / TAP SHOOT — TAP AGAIN TO THROW';
  }
  /** Tap once: meter pumps up/down. Tap again: throw at the shown power. */
  pressMeter(): void {
    if (this.phase !== 'hold') return;
    if (!this.pumping) { this.pumping = true; this.power = 0; this.chargeDir = 1; }
    else { this.pumping = false; this.shoot(this.power); }
  }
  shoot(power: number): void {
    if (this.phase !== 'hold') return;
    // Fixed aim at the rim; tiny release wobble keeps edge makes/misses organic.
    this.vel = this.velocityFor(power, 0.05 * (4.8 + clamp(power, 0, 1) * 6.0) * 0.3);
    this.ball = { x: this.spot.x, y: BB.HAND_Y, z: this.spot.z };
    this.phase = 'flight'; this.attempts += 1;
    this.maxY = BB.HAND_Y;
    this.rimTouched = false; this.boardTouched = false; this.scored = false; this.resolved = false;
    this.events.push({ kind: 'shoot', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
    this.message = '';
  }
  update(dt: number): void {
    this.rimShake = Math.max(0, this.rimShake - dt * 3);
    this.swish = Math.max(0, this.swish - dt * 1.5);
    if (this.phase === 'hold' && this.pumping) {
      this.power += this.chargeDir * this.rate * dt;
      if (this.power >= 1) { this.power = 1; this.chargeDir = -1; }
      if (this.power <= 0) { this.power = 0; this.chargeDir = 1; }
      return;
    }
    if (this.phase !== 'flight') {
      if (this.phase === 'done') {
        this.doneTimer -= dt;
        if (this.doneTimer <= 0) this.setupHold();
      }
      return;
    }
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(h);
  }
  private integrate(h: number): void {
    const prevY = this.ball.y, prevZ = this.ball.z;
    const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    const vH = Math.hypot(this.vel.x, this.vel.z);
    // Drag + backspin lift (floats the arc, realistic free-throw shape).
    const ax = -BB.DRAG * sp * this.vel.x;
    const az = -BB.DRAG * sp * this.vel.z;
    const ay = -BB.GRAV - BB.DRAG * sp * this.vel.y + BB.MAGNUS * BB.BACKSPIN * vH;
    this.vel.x += ax * h; this.vel.y += ay * h; this.vel.z += az * h;
    this.ball.x += this.vel.x * h; this.ball.y += this.vel.y * h; this.ball.z += this.vel.z * h;
    this.maxY = Math.max(this.maxY, this.ball.y);
    // Swish/make: crossing rim plane downward inside the hole.
    if (this.vel.y < 0 && prevY > BB.RIM_H && this.ball.y <= BB.RIM_H) {
      const hd = Math.hypot(this.ball.x, this.ball.z);
      if (hd < BB.RIM_R - BB.BALL_R + 0.02 && !this.scored) {
        this.onScore(!this.rimTouched && !this.boardTouched);
        // Let it fall through: keep going, floor handles the rest.
      }
    }
    // Backboard front face.
    if (this.vel.z > 0 && prevZ < BB.BOARD_Z - BB.BALL_R && this.ball.z >= BB.BOARD_Z - BB.BALL_R &&
        Math.abs(this.ball.x) < BB.BOARD_W / 2 && this.ball.y > BB.BOARD_BOT && this.ball.y < BB.BOARD_TOP) {
      this.ball.z = BB.BOARD_Z - BB.BALL_R;
      // Speed-sensitive glass: soft banks drop, hard heaves rocket back out.
      const e = clamp(0.3 + this.vel.z * 0.08, 0.3, 0.9);
      this.vel.z = -this.vel.z * e; this.vel.x *= 0.8; this.vel.y *= 0.92;
      this.boardTouched = true;
      this.events.push({ kind: 'board', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
    }
    // Rim ring points: bounce with tangential damping for rattles and roll-arounds.
    for (const rp of RIM_PTS) {
      const dx = this.ball.x - rp.x, dy = this.ball.y - BB.RIM_H, dz = this.ball.z - rp.z;
      const d = Math.hypot(dx, dy, dz), minD = BB.BALL_R + BB.TUBE;
      if (d < minD && d > 1e-6) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
        // Push out of the tube.
        this.ball.x = rp.x + nx * minD; this.ball.y = BB.RIM_H + ny * minD; this.ball.z = rp.z + nz * minD;
        if (vn < 0) {
          const e = 0.5;
          this.vel.x -= (1 + e) * vn * nx;
          this.vel.y -= (1 + e) * vn * ny;
          this.vel.z -= (1 + e) * vn * nz;
          this.vel.x *= 0.94; this.vel.y *= 0.94; this.vel.z *= 0.94;
          if (!this.rimTouched) this.events.push({ kind: 'rim', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
          this.rimTouched = true; this.rimShake = 1;
        }
        break;
      }
    }
    // Floor: lively bounce, then roll-out friction.
    if (this.ball.y <= BB.BALL_R && this.vel.y < 0) {
      this.ball.y = BB.BALL_R;
      const impact = Math.abs(this.vel.y);
      this.vel.y = -this.vel.y * 0.78;
      if (Math.abs(this.vel.y) < 0.6) this.vel.y = 0;
      this.vel.x *= 0.86; this.vel.z *= 0.86;
      if (impact > 1.2) this.events.push({ kind: 'bounce', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
      this.onFloorTouch();
    }
    if (this.ball.y <= BB.BALL_R + 0.004 && this.vel.y === 0) {
      // Rolling friction.
      const f = Math.max(0, 1 - 1.6 * h);
      this.vel.x *= f; this.vel.z *= f;
      if (Math.hypot(this.vel.x, this.vel.z) < 0.15 && !this.resolved) this.onFloorTouch();
    }
    // Safety: ball escaped the court → resolve as miss.
    if (Math.abs(this.ball.x) > 14 || Math.abs(this.ball.z) > 14 || this.ball.y > 12) {
      if (!this.resolved) {
        if (this.scored) { this.resolved = true; this.phase = 'done'; this.doneTimer = 1.2; }
        else this.onMiss(this.rimTouched ? 'RIM OUT' : this.boardTouched ? 'OFF THE BOARD' : 'WAY OFF');
      }
      this.ball = { x: this.spot.x, y: 1, z: this.spot.z }; this.vel = { x: 0, y: 0, z: 0 };
    }
  }
  private onScore(clean: boolean): void {
    this.scored = true; // flight continues: the ball drops through the net to the floor
    this.makes += 1; this.streak += 1; this.best = Math.max(this.best, this.streak);
    this.message = clean ? `SWISH! · STREAK ${this.streak}` : `BUCKET! · STREAK ${this.streak}`;
    this.events.push({ kind: clean ? 'swish' : 'score', speedKmh: 0, detail: this.message });
    if (clean) { this.swish = 1; this.swishes += 1; }
  }
  private onFloorTouch(): void {
    if (this.resolved || this.phase !== 'flight') return;
    if (this.scored) {
      // Scored ball came down through the net and hit the floor: reset for the next shot.
      this.resolved = true; this.phase = 'done'; this.doneTimer = 1.2;
      return;
    }
    // Still live if it may yet drop in (above rim near the hoop, moving down slowly counts as live briefly).
    const nearHoop = Math.hypot(this.ball.x, this.ball.z) < 1.2 && this.ball.y > BB.RIM_H - 0.3;
    if (nearHoop && Math.hypot(this.vel.x, this.vel.z) > 0.4) return; // rattling around, give it a chance
    this.resolved = true; this.streak = 0;
    let msg = 'SHORT';
    if (this.rimTouched) msg = 'RIM OUT';
    else if (this.boardTouched) msg = 'OFF THE BOARD';
    else if (this.ball.z > 1.6) msg = 'LONG — EASE OFF';
    else if (this.maxY < 2.6) msg = 'SHORT — MORE POWER';
    else if (Math.abs(this.ball.x) > 1.2) msg = 'OFF LINE';
    else msg = 'NO GOOD';
    this.onMiss(msg);
  }
  private onMiss(msg: string): void {
    this.message = msg;
    this.events.push({ kind: 'rimout', speedKmh: 0, detail: msg });
    this.phase = 'done'; this.doneTimer = 1.3;
  }
  get snapshot(): BBSnapshot {
    return {
      ball: { ...this.ball }, speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z),
      power: this.power, pumping: this.pumping, phase: this.phase,
      makes: this.makes, attempts: this.attempts, streak: this.streak, best: this.best,
      message: this.message, rimShake: this.rimShake, swish: this.swish,
      spot: { ...this.spot }, spotLabel: this.spotLabel,
      greenLo: clamp(this.greenCenter - this.greenHalf, 0, 1),
      greenHi: clamp(this.greenCenter + this.greenHalf, 0, 1),
    };
  }
}
