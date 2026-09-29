import { Player } from '../entities/Player';
import { clamp, hazardBounds, overlaps } from '../systems/Collision';
import { createCourse, physique } from '../systems/LevelManager';
import { Input } from './Input';
import { WORLD, type Course, type Phase, type Snapshot } from './State';

/** Pure fixed-step simulation: no React, Canvas, browser APIs or wall-clock reads. */
export class Run {
  player = new Player();
  course: Course = createCourse(1);
  readonly input = new Input();
  level = 1; phase: Phase = 'ready'; paused = false; time = 0; gains = 0;
  checkpointX = 160;
  camera = 0; previousCamera = 0;
  private collected = new Set<number>();
  get snapshot(): Snapshot {
    const body = physique(this.level);
    return { level: this.level, phase: this.phase, paused: this.paused, health: this.player.health,
      progress: clamp((this.player.x - 160) / (this.course.finish - 160), 0, 1),
      strength: body.strength, physique: body.name, gains: this.gains,
      checkpoint: this.checkpointX > 160, time: Math.floor(this.time), title: this.course.name, subtitle: this.course.subtitle };
  }
  begin(): void { if (this.phase === 'ready') { this.phase = 'playing'; this.input.clear(); } }
  togglePause(): void { if (this.phase === 'playing') { this.paused = !this.paused; this.input.clear(); } }
  retry(): void {
    if (this.phase !== 'defeat') return;
    this.player.health = 3; this.player.respawn(this.checkpointX);
    this.camera = this.previousCamera = clamp(this.player.x - 340, 0, this.course.width - WORLD.viewWidth);
    this.phase = 'playing'; this.paused = false; this.input.clear();
  }
  next(): void {
    if (this.phase !== 'complete') return;
    this.level++; this.course = createCourse(this.level); this.player = new Player();
    this.time = 0; this.checkpointX = 160; this.camera = this.previousCamera = 0;
    this.collected.clear(); this.input.clear(); this.phase = 'playing';
  }
  private hurt(): void {
    if (this.player.invincible > 0) return;
    this.player.health--; this.input.clear();
    if (this.player.health <= 0) this.phase = 'defeat';
    else this.player.respawn(this.checkpointX);
    this.camera = this.previousCamera = clamp(this.player.x - 340, 0, this.course.width - WORLD.viewWidth);
  }
  update(dt: number): void {
    if (this.phase !== 'playing' || this.paused) return;
    this.time += dt;
    const p = this.player;
    p.previousX = p.x; p.previousY = p.y; this.previousCamera = this.camera;
    p.invincible = Math.max(0, p.invincible - dt);
    p.attack = Math.max(0, p.attack - dt); p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
    if (this.input.consume('jump')) p.jumpBuffer = 0.14;
    const direction = Number(this.input.held('right')) - Number(this.input.held('left'));
    const speed = 285 + Math.min(this.level - 1, 15) * 2;
    p.vx += clamp(direction * speed - p.vx, -2100 * dt, 2100 * dt);
    if (direction) p.facing = direction;
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = -690; p.grounded = false; p.coyote = p.jumpBuffer = 0;
    }
    if (this.input.held('punch') && p.attackCooldown <= 0) {
      p.attack = 0.18; p.attackCooldown = 0.38;
      const fist = { x: p.facing > 0 ? p.x : p.x - 95, y: p.y - 108, w: 95, h: 86 };
      for (const wall of this.course.walls) if (wall.hp > 0 && overlaps(fist, wall)) wall.hp = Math.max(0, wall.hp - physique(this.level).strength);
    }
    p.x = clamp(p.x + p.vx * dt, 24, this.course.width - 24);
    for (const wall of this.course.walls) {
      if (wall.hp > 0 && overlaps(p.bounds, wall)) {
        p.x = p.vx > 0 ? wall.x - 20 : p.vx < 0 ? wall.x + wall.w + 20 : p.x;
        p.vx = 0;
      }
    }
    p.vy = Math.min(1000, p.vy + 1800 * dt);
    p.y += p.vy * dt; p.grounded = false;
    const solids = [...this.course.platforms, ...this.course.walls.filter(w => w.hp > 0)];
    for (const platform of solids) {
      if (p.vy >= 0 && p.previousY <= platform.y + 0.5 && p.y >= platform.y &&
        p.x + 16 > platform.x && p.x - 16 < platform.x + platform.w) {
        p.y = platform.y; p.vy = 0; p.grounded = true;
      }
    }
    p.stride += p.vx * dt * 0.065;
    if (p.y > WORLD.viewHeight + 80) { p.invincible = 0; this.hurt(); return; }
    for (const hazard of this.course.hazards) {
      if (overlaps(p.bounds, hazardBounds(hazard, this.time, this.level)) && p.invincible <= 0) { this.hurt(); return; }
    }
    this.course.pickups.forEach((pickup, index) => {
      if (!this.collected.has(index) && overlaps(p.bounds, { x: pickup.x - 14, y: pickup.y - 14, w: 28, h: 28 })) {
        this.collected.add(index); pickup.collected = true; this.gains++;
        if (this.gains % 4 === 0) p.health = Math.min(3, p.health + 1);
      }
    });
    for (const x of this.course.checkpoints) if (p.x >= x && p.grounded) this.checkpointX = Math.max(this.checkpointX, x);
    if (p.x >= this.course.finish && p.grounded) { this.phase = 'complete'; this.input.clear(); }
    const target = clamp(p.x - 340, 0, this.course.width - WORLD.viewWidth);
    this.camera += (target - this.camera) * (1 - Math.exp(-7 * dt));
  }
}
