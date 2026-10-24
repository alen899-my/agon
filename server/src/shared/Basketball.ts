/** Free-throw practice sim. Local coords: rim center floor projection = origin,
 *  shooter stands at z=-4.2 heaving toward +z. No aim control — power decides all. */
export type BBStyle = 'jump' | 'arc' | 'quick';
export const BB_RACKS = [{distance:3.2,angle:-40},{distance:4.2,angle:-20},{distance:5.2,angle:0},{distance:6,angle:20},{distance:6.75,angle:40}] as const;
export type BBPhase = 'hold' | 'flight' | 'done';
export interface BBEvent { kind: 'shoot' | 'bounce' | 'rim' | 'board' | 'swish' | 'score' | 'rimout'; speedKmh: number; detail?: string }
export interface BBSnapshot {
  ball: { x: number; y: number; z: number }; speedKmh: number;
  power: number; pumping: boolean; phase: BBPhase;
  makes: number; attempts: number; streak: number; best: number;
  message: string; rimShake: number; swish: number;
  spot: { x: number; z: number }; spotLabel: string;
  sound: (BBEvent & {id:number}) | null;
  greenLo: number; greenHi: number;
  style: BBStyle; aim: number; points: number; shotValue: number; release: string; lastPower: number; rack: number; challengeOver: boolean;
}
export const BB = {
  GRAV: 9.81, DRAG: 0.12, MAGNUS: 0.12, BALL_R: 0.12,
  RIM_H: 3.05, RIM_R: 0.225, TUBE: 0.02,
  BOARD_Z: 0.45, BOARD_W: 1.8, BOARD_BOT: 2.9, BOARD_TOP: 3.95,
  SPOT_Z: -4.2, HAND_Y: 1.9, ANGLE: 53 * Math.PI / 180, BACKSPIN: 2.5,
  CHARGE_RATE: 0.85, MIN_SPEED: 4.8, SPEED_RANGE: 10,
  SPOT_MIN: 3.0, SPOT_MAX: 6.25, SPOT_ANGLE: 50,
} as const;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const kmh = (x: number, y: number, z: number) => Math.round(Math.hypot(x, y, z) * 3.6);
export class BasketballSim {
  style: BBStyle = 'jump';
  aim = 0; points = 0; release = ''; lastPower = 0;
  challenge = false; challengeOver = false;
  get shotValue(): number { return Math.hypot(this.spot.x,this.spot.z) >= 6.6 ? 3 : 2; }
  get angle(): number { return (this.style === 'arc' ? 62 : this.style === 'quick' ? 45 : 53) * Math.PI/180; }
  configure(style: BBStyle, aim: number): void {
    if(this.phase !== 'hold' || this.pumping) return;
    if(!['jump','arc','quick'].includes(style) || !Number.isFinite(aim)) return;
    const changed=style!==this.style; this.style=style; this.aim=clamp(aim,-1,1);
    this.rate=style==='quick'?0.95:style==='arc'?0.6:0.75;
    if(changed) this.solveGreen();
  }
  setRack(index: number): void { const r=BB_RACKS[clamp(Math.floor(index/2),0,4)]; this.setSpot(r.distance,r.angle); }
  startChallenge(): void { this.challenge=true; this.resetStats(); }
  private flightTime = 0;
  private static greenCache = new Map<string, number>();
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
  sound: (BBEvent & {id:number}) | null = null;
  private soundSequence=0;
  private emitEvent(event:BBEvent):void { this.events.push(event);this.sound={...event,id:++this.soundSequence}; }

  constructor(solve = true) { if (solve) this.solveGreen(); }

  resetStats(): void {
    this.events.length=0;this.sound=null;
    this.points=0; this.release=''; this.challengeOver=false; this.style='jump'; this.aim=0; this.flightTime=0;
    this.setRack(0);
    this.makes = 0; this.attempts = 0; this.streak = 0; this.best = 0; this.swishes = 0;
    this.setupHold();
  }
  /** Fixed spot (used by tests); re-solves the green window for it. */
  setSpot(dist: number, angleDeg: number): void {
    dist=clamp(dist,2.5,7); angleDeg=clamp(angleDeg,-60,60);
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
    const dist = [3.2, 4.2, 5.2, 6][Math.floor(Math.random() * 4)];
    const angle = [-40, -20, 0, 20, 40][Math.floor(Math.random() * 5)];
    this.setSpot(dist, angle);
  }
  /** Find the meter power that drops clean for the current spot by probing the real physics. */
  private solveGreen(): void {
    const distance=Math.hypot(this.spot.x,this.spot.z);
    const key=distance.toFixed(3)+':'+this.style;
    const cached=BasketballSim.greenCache.get(key);
    if(cached!==undefined) {this.greenCenter=cached;return;}
    // Solve the descending rim-plane crossing directly, without creating simulations,
    // events or collision probes. Uses exactly the live drag and backspin equations.
    const range=(speed:number):number=>{
      let x=0,y=BB.HAND_Y,vx=speed*Math.cos(this.angle),vy=speed*Math.sin(this.angle);
      const h=1/240;
      for(let i=0;i<960;i++) {
        const oldY=y,oldX=x,sp=Math.hypot(vx,vy);
        vy+=(-BB.GRAV-BB.DRAG*sp*vy+BB.MAGNUS*BB.BACKSPIN*Math.abs(vx))*h;
        vx+=-BB.DRAG*sp*vx*h; x+=vx*h;y+=vy*h;
        if(vy<0 && oldY>=BB.RIM_H && y<=BB.RIM_H) return oldX+(x-oldX)*(oldY-BB.RIM_H)/(oldY-y);
        if(y<0) return 0;
      }
      return x;
    };
    let lo: number = BB.MIN_SPEED, hi: number = BB.MIN_SPEED + BB.SPEED_RANGE;
    for(let i=0;i<22;i++) {const mid=(lo+hi)/2;if(range(mid)<distance) lo=mid;else hi=mid;}
    this.greenCenter=clamp(((lo+hi)/2-BB.MIN_SPEED)/BB.SPEED_RANGE,0.05,0.98);
    if(BasketballSim.greenCache.size>=256) BasketballSim.greenCache.clear();
    BasketballSim.greenCache.set(key,this.greenCenter);
  }
  private velocityFor(power: number, wobble: number): { x: number; y: number; z: number } {
    const p = clamp(power, 0.05, 1);
    const speed = BB.MIN_SPEED + p * BB.SPEED_RANGE;
    const d = Math.max(0.5, Math.hypot(this.spot.x, this.spot.z));
    const dx = -this.spot.x / d, dz = -this.spot.z / d; // toward the rim
    const wob = this.aim * 0.65; // Intentional lateral aim; no random release penalty.
    void wobble;
    return {
      x: (dx * speed + -dz * wob) * Math.cos(this.angle),
      y: speed * Math.sin(this.angle),
      z: (dz * speed + dx * wob) * Math.cos(this.angle),
    };
  }
  setupHold(keepSpot = false): void {
    this.phase = 'hold'; this.power = 0; this.chargeDir = 1; this.pumping = false;
    if (!keepSpot && this.challenge && this.attempts >= 10) {this.challengeOver=true;this.phase='done';this.message=`CONTEST COMPLETE ? ${this.points} POINTS`;return;}
    if (!keepSpot && this.challenge) this.setRack(this.attempts);
    else if (!keepSpot && this.attempts > 0) this.randomizeSpot();
    // Meter quickens as you heat up; green shrinks with the streak.
    this.rate = this.style === 'quick' ? 0.95 : this.style === 'arc' ? 0.6 : 0.75;
    this.greenHalf = 0.025;
    this.ball = { x: this.spot.x, y: BB.HAND_Y, z: this.spot.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.rimTouched = false; this.boardTouched = false; this.scored = false; this.resolved = false;
    this.maxY = BB.HAND_Y; this.doneTimer = 0; this.flightTime=0; this.release='';
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
    this.lastPower=clamp(power,0,1);
    const error=this.lastPower-this.greenCenter;
    this.release=Math.abs(error)<=this.greenHalf?'PERFECT RELEASE':error<0?'EARLY RELEASE':'LATE RELEASE';
    const assisted=Math.abs(error)<=this.greenHalf?this.greenCenter:this.lastPower;
    this.power=this.lastPower; this.pumping=false;
    this.vel = this.velocityFor(assisted, 0.025 * (BB.MIN_SPEED + clamp(power, 0, 1) * BB.SPEED_RANGE) * 0.3);
    this.ball = { x: this.spot.x, y: BB.HAND_Y, z: this.spot.z };
    this.phase = 'flight'; this.attempts += 1;
    this.maxY = BB.HAND_Y;
    this.rimTouched = false; this.boardTouched = false; this.scored = false; this.resolved = false;
    this.emitEvent({ kind: 'shoot', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
    this.message = this.release;
  }
  update(dt: number): void {
    if(!Number.isFinite(dt) || dt<=0 || this.challengeOver) return;
    dt=Math.min(dt,0.05);
    if(this.events.length>48) this.events.splice(0,this.events.length-48);
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
    this.flightTime+=dt;
    if(this.flightTime>7) {this.onMiss('SHOT CLOCK ? BALL RESET');return;}
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps && this.phase === 'flight'; i++) this.integrate(h);
  }
  private integrate(h: number): void {
    const prevX=this.ball.x, prevY = this.ball.y, prevZ = this.ball.z;
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
      const crossing=(prevY-BB.RIM_H)/(prevY-this.ball.y);
      const hd = Math.hypot(prevX+(this.ball.x-prevX)*crossing, prevZ+(this.ball.z-prevZ)*crossing);
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
      this.emitEvent({ kind: 'board', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
    }
    // Rim ring points: bounce with tangential damping for rattles and roll-arounds.
    // Closest point on a continuous torus: one contact instead of 12 discrete spheres.
    const radial=Math.hypot(this.ball.x,this.ball.z);
    if(Math.abs(this.ball.y-BB.RIM_H)<BB.BALL_R+BB.TUBE && radial>1e-6) {
      const rp={x:this.ball.x/radial*BB.RIM_R,z:this.ball.z/radial*BB.RIM_R};
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
          if (!this.rimTouched) this.emitEvent({ kind: 'rim', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
          this.rimTouched = true; this.rimShake = 1;
        }
      }
    }
    // Floor: lively bounce, then roll-out friction.
    if (this.ball.y <= BB.BALL_R && this.vel.y < 0) {
      this.ball.y = BB.BALL_R;
      const impact = Math.abs(this.vel.y);
      this.vel.y = -this.vel.y * 0.78;
      if (Math.abs(this.vel.y) < 0.6) this.vel.y = 0;
      this.vel.x *= 0.86; this.vel.z *= 0.86;
      if (impact > 1.2) this.emitEvent({ kind: 'bounce', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z) });
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
    this.points+=this.shotValue;
    this.makes += 1; this.streak += 1; this.best = Math.max(this.best, this.streak);
    this.message = clean ? `SWISH! · STREAK ${this.streak}` : `BUCKET! · STREAK ${this.streak}`;
    this.emitEvent({ kind: clean ? 'swish' : 'score', speedKmh: 0, detail: this.message });
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
    this.resolved=true; this.streak=0;
    this.message = msg;
    this.emitEvent({ kind: 'rimout', speedKmh: 0, detail: msg });
    this.phase = 'done'; this.doneTimer = 1.3;
  }
  get snapshot(): BBSnapshot {
    return {
      sound:this.sound, style:this.style, aim:this.aim, points:this.points, shotValue:this.shotValue, release:this.release, lastPower:this.lastPower, rack:Math.min(5,Math.floor(this.attempts/2)+1),challengeOver:this.challengeOver,
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
