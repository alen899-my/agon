/** Realistic table tennis sim. Local coords: table center origin, play axis = Z.
 *  Player defends z>0, AI defends z<0. ITTF dims: L=2.74 (z), W=1.525 (x), H=0.76, net=0.1525. */
export type TTShot = 'drive' | 'topspin' | 'chop' | 'smash' | 'serve';
export type TTPhase = 'serve' | 'rally' | 'point' | 'over';
export type TTSide = 'you' | 'ai';
export interface TTEvent { kind: 'paddle' | 'table' | 'net' | 'edge' | 'point' | 'smash' | 'topspin' | 'serve'; speedKmh: number; side?: TTSide; detail?: string }
export interface TTSnapshot {
  ball: { x: number; y: number; z: number }; ballSpeedKmh: number;
  player: { x: number; y: number; z: number }; ai: { x: number; y: number; z: number };
  you: number; aiScore: number; server: TTSide; phase: TTPhase;
  message: string; rally: number; pointTimer: number;
  serveSide: TTSide; matchOver: boolean; winner: TTSide | null;
  swingYou: number; swingAi: number;
}
export const TT = { L: 2.74, W: 1.525, H: 0.76, NET_H: 0.1525, BALL_R: 0.05, GRAV: 9.81, DRAG: 0.11, MAGNUS: 0.28 } as const;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const kmh = (vx: number, vy: number, vz: number) => Math.round(Math.hypot(vx, vy, vz) * 3.6);

export class TableTennisSim {
  ball = { x: 0, y: 1.3, z: 1.0 };
  vel = { x: 0, y: 0, z: 0 };
  spin = 0; // +topspin dips, -backspin floats
  sideSpin = 0;
  player = { x: 0, y: 1.02, z: TT.L / 2 + 0.55 };
  ai = { x: 0, y: 1.02, z: -TT.L / 2 - 0.55 };
  playerVelX = 0;
  you = 0; aiScore = 0; server: TTSide = 'you';
  phase: TTPhase = 'serve';
  message = 'SPACE / TAP TO SERVE';
  rally = 0; pointTimer = 0;
  winner: TTSide | null = null;
  lastHitter: TTSide | null = null;
  bouncesThisShot = 0; serveBounces = 0;
  swingYou = 0; swingAi = 0;
  events: TTEvent[] = [];
  flags = { topspin: false, smash: false, netCord: false, edge: false };
  aiLevel = 1; // 0 easy 1 normal 2 pro
  autoMove = true; // paddle tracks the ball on its own; player focuses on shots
  trail: { x: number; y: number; z: number }[] = [];
  private serveCount = 0;

  reset(): void {
    this.you = 0; this.aiScore = 0; this.server = 'you'; this.winner = null;
    this.serveCount = 0; this.rally = 0;
    this.flags = { topspin: false, smash: false, netCord: false, edge: false };
    this.setupServe('you');
  }
  setupServe(server: TTSide): void {
    this.server = server; this.phase = 'serve'; this.pointTimer = 0;
    this.lastHitter = null; this.bouncesThisShot = 0; this.serveBounces = 0; this.rally = 0;
    const z = server === 'you' ? 1.0 : -1.0;
    this.ball = { x: server === 'you' ? this.player.x * 0.5 : this.ai.x * 0.5, y: TT.H + 0.35, z };
    this.vel = { x: 0, y: 0, z: 0 }; this.spin = 0; this.sideSpin = 0;
    this.message = server === 'you' ? 'YOUR SERVE — SPACE / TAP' : 'AI SERVES — GET READY';
    this.events.push({ kind: 'serve', speedKmh: 0, side: server });
  }
  get matchOver(): boolean { return this.phase === 'over'; }
  movePlayer(dx: number): void {
    if (this.autoMove) return;
    const target = clamp(this.player.x + dx, -1.25, 1.25);
    this.playerVelX = clamp((target - this.player.x) * 10, -6, 6);
    this.player.x = target;
  }
  setPlayerX(x: number): void {
    if (this.autoMove) return;
    const nx = clamp(x, -1.25, 1.25);
    this.playerVelX = clamp((nx - this.player.x) * 10, -6, 6);
    this.player.x = nx;
  }
  /** Paddle follows the incoming ball; drifts home when the ball is away. */
  private autoTrack(dt: number): void {
    const incoming = this.vel.z > 0.2 || this.ball.z > 0;
    const target = incoming
      ? clamp(this.ball.x + this.vel.x * 0.18, -1.25, 1.25)
      : clamp(this.ball.x * 0.2, -0.5, 0.5);
    const speed = incoming ? 4.2 : 1.6;
    const nx = this.player.x + clamp(target - this.player.x, -speed * dt, speed * dt);
    this.playerVelX = clamp((nx - this.player.x) * 10, -6, 6);
    this.player.x = nx;
  }
  /** Attempt a player swing. Returns true if paddle connected. */
  swingPlayer(shot: TTShot): boolean {
    if (this.phase === 'over') return false;
    if (this.phase === 'point') return false;
    const kind: TTShot = this.phase === 'serve' && this.server === 'you' ? 'serve' : shot;
    return this.tryHit('you', kind);
  }
  private paddlePos(side: TTSide): { x: number; y: number; z: number } {
    return side === 'you' ? this.player : this.ai;
  }
  private tryHit(side: TTSide, shot: TTShot): boolean {
    const p = this.paddlePos(side);
    const dx = this.ball.x - p.x, dy = this.ball.y - p.y, dz = this.ball.z - p.z;
    const dist = Math.hypot(dx, dy, dz);
    // Serve: ball is held, always connects.
    const serving = this.phase === 'serve' && this.server === side;
    const reach = serving ? 99 : side === 'you' ? 1.0 : 1.05;
    // No volley camping across the net: you must be on your half (plus small overlap).
    if (!serving) {
      if (side === 'you' && this.ball.z < -0.35) return false;
      if (side === 'ai' && this.ball.z > 0.35) return false;
      if (dist > reach) return false;
      // Volley fault: hitting before the incoming ball bounced on your side.
      if (this.lastHitter && this.lastHitter !== side && this.bouncesThisShot === 0 && this.phase === 'rally') {
        this.awardPoint(this.lastHitter, `${side === 'you' ? 'You' : 'AI'} volleyed — point ${this.lastHitter === 'you' ? 'you' : 'AI'}`);
        return false;
      }
    }
    // Aim: pick landing spot on opponent half with error.
    const err = side === 'ai' ? [0.28, 0.16, 0.08][this.aiLevel] : 0.12;
    const aimX = clamp((side === 'you' ? -this.ball.x * 0.4 : -this.ball.x * 0.5) + (Math.random() - 0.5) * 2 * err, -TT.W / 2 + 0.1, TT.W / 2 - 0.1);
    const aimZ = side === 'you' ? -(TT.L / 4 + Math.random() * TT.L / 4) : TT.L / 4 + Math.random() * TT.L / 4;
    const target = { x: aimX, y: TT.H, z: aimZ };
    // Shot character.
    let power = 1, spin = 0, sideAmt = 0;
    if (shot === 'serve') { power = 0.62; spin = 1.2; }
    else if (shot === 'drive') { power = 1.0; spin = 0.8; }
    else if (shot === 'topspin') { power = 1.12; spin = 3.2; this.flags.topspin = true; }
    else if (shot === 'chop') { power = 0.8; spin = -2.6; }
    else if (shot === 'smash') { power = 1.55; spin = 1.6; this.flags.smash = true; }
    sideAmt = this.sideSpin * 0.3 + (p === this.player ? this.playerVelX * 0.12 : 0);
    // Ballistic aim: choose flight time from power, solve velocity with gravity comp.
    const T = clamp(0.55 / power, 0.28, 0.7);
    const from = serving ? { x: p.x * 0.6, y: TT.H + 0.3, z: p.z * 0.75 } : { ...this.ball };
    if (serving) this.ball = { ...from };
    const vx = (target.x - from.x) / T + sideAmt * 0.4;
    const vz = (target.z - from.z) / T;
    const vy = (target.y - from.y) / T + 0.5 * TT.GRAV * T - (spin > 0 ? 0.35 : spin < 0 ? -0.3 : 0);
    // Serve must be gentle lob over net; ensure clearance.
    const clearance = serving ? 0.35 : shot === 'chop' ? 0.42 : 0.28;
    this.vel = { x: vx, y: Math.max(vy, clearance + 1.2), z: vz };
    this.spin = clamp(spin, -4, 4.5); this.sideSpin = clamp(sideAmt, -2, 2);
    this.lastHitter = side; this.bouncesThisShot = 0; this.serveBounces = 0;
    if (this.phase === 'serve') this.phase = 'rally';
    this.rally += 1;
    if (side === 'you') this.swingYou = 1; else this.swingAi = 1;
    const s = kmh(this.vel.x, this.vel.y, this.vel.z);
    this.events.push({ kind: shot === 'smash' ? 'smash' : shot === 'topspin' ? 'topspin' : 'paddle', speedKmh: s, side, detail: shot });
    if (shot === 'smash') this.message = s > 60 ? `SMASH! ${s} KM/H` : `SMASH ${s} KM/H`;
    return true;
  }
  awardPoint(to: TTSide, message: string): void {
    if (to === 'you') this.you += 1; else this.aiScore += 1;
    this.phase = 'point'; this.pointTimer = 1.4; this.message = message;
    this.events.push({ kind: 'point', speedKmh: 0, side: to, detail: message });
    // Win check: 11+, lead by 2.
    if ((this.you >= 11 || this.aiScore >= 11) && Math.abs(this.you - this.aiScore) >= 2) {
      this.phase = 'over'; this.winner = to;
      this.message = to === 'you' ? `YOU WIN ${this.you}–${this.aiScore}!  R FOR REMATCH` : `AI WINS ${this.aiScore}–${this.you}.  R FOR REMATCH`;
      this.events.push({ kind: 'point', speedKmh: 0, side: to, detail: 'match' });
      return;
    }
    // Serve rotation: every 2 points, every 1 after deuce.
    this.serveCount += 1;
    const deuce = this.you >= 10 && this.aiScore >= 10;
    const rotateEvery = deuce ? 1 : 2;
    const nextServer = Math.floor(this.serveCount / rotateEvery) % 2 === 0 ? 'you' as TTSide : 'ai' as TTSide;
    // Store pending server; setupServe runs after pointTimer elapses.
    this.server = nextServer;
  }
  update(dt: number): void {
    // Fixed-substep integration for stable bounces at high smash speeds.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(h);
    // Timers / AI / anim decay.
    this.swingYou = Math.max(0, this.swingYou - dt * 4);
    this.swingAi = Math.max(0, this.swingAi - dt * 4);
    this.pointTimer -= dt;
    if (this.phase === 'point' && this.pointTimer <= 0 && !this.matchOver) this.setupServe(this.server);
    if ((this.phase === 'rally' || this.phase === 'serve') && !this.matchOver) this.updateAI(dt);
    if (this.autoMove && !this.matchOver && (this.phase === 'rally' || this.phase === 'serve')) this.autoTrack(dt);
    // Serve idle: ball gently bobs at hand.
    if (this.phase === 'serve') {
      const p = this.paddlePos(this.server);
      this.ball.x += (p.x * 0.6 - this.ball.x) * Math.min(1, 6 * dt);
      this.ball.z += (p.z * 0.75 - this.ball.z) * Math.min(1, 6 * dt);
      this.ball.y = TT.H + 0.35 + Math.sin(performance.now() / 300) * 0.01;
      // AI auto-serves after a beat.
      if (this.server === 'ai') {
        this.pointTimer += dt; // reuse as serve delay (setupServe reset it to 0)
        if (this.pointTimer > 1.1) { this.pointTimer = 0; this.tryHit('ai', 'serve'); }
      }
    }
    // Trail.
    this.trail.push({ ...this.ball });
    if (this.trail.length > 14) this.trail.shift();
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }
  private integrate(h: number): void {
    if (this.phase === 'point' || this.phase === 'over') return;
    const prevY = this.ball.y, prevZ = this.ball.z;
    const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    // Drag + Magnus (topspin dips, backspin floats, sidespin curves).
    const vH = Math.hypot(this.vel.x, this.vel.z);
    const ax = -TT.DRAG * sp * this.vel.x + -TT.MAGNUS * this.sideSpin * this.vel.z * 0.4;
    const az = -TT.DRAG * sp * this.vel.z + TT.MAGNUS * this.sideSpin * this.vel.x * 0.4;
    const ay = -TT.GRAV - TT.DRAG * sp * this.vel.y - TT.MAGNUS * this.spin * vH * 0.45;
    this.vel.x += ax * h; this.vel.y += ay * h; this.vel.z += az * h;
    this.ball.x += this.vel.x * h; this.ball.y += this.vel.y * h; this.ball.z += this.vel.z * h;
    // Net plane z=0.
    if (prevZ !== 0 && Math.sign(prevZ) !== Math.sign(this.ball.z)) {
      const t = Math.abs(prevZ) / (Math.abs(prevZ) + Math.abs(this.ball.z) + 1e-9);
      const yAt = prevY + (this.ball.y - prevY) * t;
      const xAt = this.ball.x; // approx
      if (Math.abs(xAt) <= 0.915 + TT.BALL_R && yAt < TT.H + TT.NET_H + TT.BALL_R && yAt > TT.H - 0.3) {
        const cord = Math.abs(yAt - (TT.H + TT.NET_H)) < 0.035;
        this.vel.z *= cord ? -0.15 : -0.28;
        this.vel.x *= 0.45; this.vel.y *= cord ? 0.6 : 0.35;
        this.spin *= 0.5; this.sideSpin *= 0.5;
        this.ball.z = prevZ > 0 ? 0.02 : -0.02;
        this.flags.netCord = true;
        this.events.push({ kind: 'net', speedKmh: kmh(this.vel.x, this.vel.y, this.vel.z), detail: cord ? 'cord' : 'net' });
        if (cord) this.vel.y = Math.abs(this.vel.y) * 0.5 + 0.4;
      }
    }
    // Table bounce.
    const overTable = Math.abs(this.ball.x) <= TT.W / 2 && Math.abs(this.ball.z) <= TT.L / 2;
    const nearEdgeX = Math.abs(Math.abs(this.ball.x) - TT.W / 2) < 0.05 && Math.abs(this.ball.z) <= TT.L / 2 + 0.05;
    const nearEdgeZ = Math.abs(Math.abs(this.ball.z) - TT.L / 2) < 0.05 && Math.abs(this.ball.x) <= TT.W / 2 + 0.05;
    const edge = !overTable && (nearEdgeX || nearEdgeZ);
    if (this.vel.y < 0 && prevY >= TT.H + TT.BALL_R && this.ball.y <= TT.H + TT.BALL_R && (overTable || edge)) {
      this.ball.y = TT.H + TT.BALL_R;
      const edgeFactor = edge ? 0.62 : 0.89;
      this.vel.y = -this.vel.y * edgeFactor;
      this.vel.x *= 0.985; this.vel.z *= 0.985;
      // Spin kick along travel direction.
      this.vel.z += Math.sign(this.vel.z || 1) * this.spin * 0.12;
      this.vel.x += this.sideSpin * 0.08;
      if (edge) { this.flags.edge = true; this.vel.y *= 0.85; }
      this.spin *= 0.86; this.sideSpin *= 0.9;
      this.onTableBounce(this.ball.z > 0 ? 'you' : 'ai', edge);
      return;
    }
    // Floor bounce.
    if (this.ball.y <= TT.BALL_R && this.vel.y < 0) {
      this.ball.y = TT.BALL_R;
      this.vel.y = -this.vel.y * 0.45; this.vel.x *= 0.7; this.vel.z *= 0.7;
      this.spin *= 0.7; this.sideSpin *= 0.7;
      this.onFloorTouch();
    }
    // Safety: ball lost far away → award point.
    if (Math.abs(this.ball.x) > 8 || Math.abs(this.ball.z) > 8 || this.ball.y < -1) {
      const to: TTSide = this.lastHitter === 'you' ? 'ai' : 'you';
      this.awardPoint(to, this.lastHitter ? `${this.lastHitter === 'you' ? 'Your' : 'AI'} shot went long` : 'Ball lost');
      this.ball = { x: 0, y: 1.2, z: 0 };
      this.vel = { x: 0, y: 0, z: 0 };
    }
  }
  private onTableBounce(bounceSide: TTSide, edge: boolean): void {
    const s = kmh(this.vel.x, this.vel.y, this.vel.z);
    this.events.push({ kind: edge ? 'edge' : 'table', speedKmh: s, side: bounceSide, detail: edge ? 'edge!' : undefined });
    if (!this.lastHitter) {
      // Serve phase: first bounce must be server's own side.
      if (this.phase === 'serve') {
        if (bounceSide !== this.server) {
          this.awardPoint(this.server === 'you' ? 'ai' : 'you', 'Serve fault — missed your side');
          return;
        }
        this.serveBounces = 1; this.lastHitter = this.server; this.bouncesThisShot = 1;
        return;
      }
      return;
    }
    // Serve second bounce: must be receiver side.
    if (this.phase === 'serve' || (this.rally === 1 && this.serveBounces === 1)) {
      if (this.serveBounces === 1) {
        const receiver: TTSide = this.server === 'you' ? 'ai' : 'you';
        if (bounceSide !== receiver) {
          this.awardPoint(receiver, 'Serve fault — missed far side');
          return;
        }
        this.serveBounces = 2; this.phase = 'rally'; this.bouncesThisShot = 1;
        return;
      }
    }
    const hitter = this.lastHitter;
    const expectSide: TTSide = hitter === 'you' ? 'ai' : 'you';
    this.bouncesThisShot += 1;
    if (bounceSide !== expectSide) {
      // Hit into own side / wrong half.
      this.awardPoint(expectSide, hitter === 'you' ? 'You hit it wide' : 'AI hit it wide');
      return;
    }
    if (this.bouncesThisShot === 2) {
      // Double bounce — receiver failed.
      this.awardPoint(hitter, hitter === 'you' ? `Clean winner! ${s} km/h` : 'AI placed a winner');
    }
  }
  private onFloorTouch(): void {
    if (!this.lastHitter || this.phase === 'point' || this.phase === 'over') return;
    if (this.phase === 'serve') {
      // Serve bouncing on floor before both table bounces → fault.
      if (this.serveBounces < 2) {
        this.awardPoint(this.server === 'you' ? 'ai' : 'you', 'Serve into the net / out');
      }
      return;
    }
    if (this.bouncesThisShot === 0) {
      // Never landed — missed table entirely.
      this.awardPoint(this.lastHitter === 'you' ? 'ai' : 'you', this.lastHitter === 'you' ? 'Long / wide — AI point' : 'AI missed — your point');
    }
    // If it already bounced twice on table, point was awarded; floor repeats are harmless.
  }
  private updateAI(dt: number): void {
    const cfg = [{ speed: 1.6, react: 0.35 }, { speed: 2.6, react: 0.18 }, { speed: 3.6, react: 0.08 }][this.aiLevel];
    // Predict landing x when ball heads toward AI.
    if (this.vel.z < -0.3 && this.ball.z > -1.2) {
      const tHit = (this.ai.z - this.ball.z) / (this.vel.z || -0.001);
      if (tHit > 0 && tHit < 2) {
        const predX = clamp(this.ball.x + this.vel.x * tHit + this.sideSpin * 0.1 * tHit, -1.25, 1.25);
        const dx = clamp(predX - this.ai.x, -cfg.speed * dt, cfg.speed * dt);
        this.ai.x += dx;
      }
    } else {
      // Recover to home with slight bias to player's position.
      const home = clamp(this.ball.x * 0.25, -0.5, 0.5);
      this.ai.x += clamp(home - this.ai.x, -1.4 * dt, 1.4 * dt);
    }
    // Auto swing when close.
    const dx = this.ball.x - this.ai.x, dy = this.ball.y - this.ai.y, dz = this.ball.z - this.ai.z;
    if (Math.hypot(dx, dy, dz) < 0.95 && this.vel.z < 0.5 && (this.phase === 'rally' || (this.phase === 'serve' && this.server === 'ai'))) {
      if (Math.random() < (1 - cfg.react * 2)) {
        const high = this.ball.y > 1.25;
        const r = Math.random();
        const shot: TTShot = this.phase === 'serve' ? 'serve' : high && r < 0.4 ? 'smash' : r < 0.55 ? 'topspin' : r < 0.8 ? 'drive' : 'chop';
        this.tryHit('ai', shot);
      }
    }
  }
  get snapshot(): TTSnapshot {
    return {
      ball: { ...this.ball }, ballSpeedKmh: kmh(this.vel.x, this.vel.y, this.vel.z),
      player: { ...this.player }, ai: { ...this.ai },
      you: this.you, aiScore: this.aiScore, server: this.server, phase: this.phase,
      message: this.message, rally: this.rally, pointTimer: Math.max(0, this.pointTimer),
      serveSide: this.server, matchOver: this.phase === 'over', winner: this.winner,
      swingYou: this.swingYou, swingAi: this.swingAi,
    };
  }
}
