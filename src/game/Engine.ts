import { hazardBounds } from '../systems/Collision';
import { GameLoop } from './GameLoop';
import { Run } from './Run';
import { WORLD, type Action, type Snapshot, type Theme } from './State';

const COLORS = {
  dark: { sky: '#111111', far: '#1b1b1b', mid: '#292929', ground: '#303030', edge: '#777777', ink: '#eeeeee', accent: '#ffffff', danger: '#ffffff', muted: '#999999' },
  light: { sky: '#ffffff', far: '#eeeeee', mid: '#dddddd', ground: '#cccccc', edge: '#777777', ink: '#111111', accent: '#000000', danger: '#000000', muted: '#666666' },
};
type Palette = typeof COLORS.dark;

/** Browser adapter: simulation, fixed RAF loop, camera rendering, and HUD snapshots. */
export class Engine {
  readonly run = new Run();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly loop: GameLoop;
  private theme: Theme = 'dark';
  private suspended = false;
  private hudTime = 0;
  private scale = 1; private dpr = 1; private offsetX = 0; private offsetY = 0;
  constructor(private canvas: HTMLCanvasElement, private publish: (snapshot: Snapshot) => void) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser does not support Canvas 2D.');
    this.ctx = context;
    this.loop = new GameLoop(dt => {
      const phase = this.run.phase, health = this.run.player.health;
      this.run.update(dt); this.hudTime += dt;
      if (this.hudTime >= 0.1 || phase !== this.run.phase || health !== this.run.player.health) {
        this.hudTime = 0; this.emit();
      }
    }, this.render);
    this.emit();
  }
  get snapshot(): Snapshot { return this.run.snapshot; }
  private emit(): void { this.publish(this.snapshot); }
  start(): void { if (!this.suspended) this.loop.start(); }
  destroy(): void { this.loop.stop(); this.clearInput(); }
  setTheme(theme: Theme): void { this.theme = theme; this.render(1); }
  setSuspended(suspended: boolean): void {
    this.suspended = suspended; this.clearInput();
    if (suspended) this.loop.stop(); else this.loop.start();
  }
  clearInput(): void { this.run.input.clear(); }
  input(action: Action, down: boolean, source: string): void {
    if (down && (this.suspended || this.run.paused || this.run.phase !== 'playing')) return;
    this.run.input.set(action, down, source);
  }
  begin(): void { this.run.begin(); this.emit(); }
  next(): void { this.run.next(); this.emit(); }
  retry(): void { this.run.retry(); this.emit(); }
  togglePause(): void { this.run.togglePause(); this.emit(); }
  resize(width: number, height: number, ratio = window.devicePixelRatio || 1): void {
    width = Math.max(1, width); height = Math.max(1, height);
    this.dpr = Math.min(2, Math.max(1, ratio));
    this.canvas.width = Math.round(width * this.dpr); this.canvas.height = Math.round(height * this.dpr);
    this.scale = Math.min(width / WORLD.viewWidth, height / WORLD.viewHeight);
    this.offsetX = (width - WORLD.viewWidth * this.scale) / 2;
    this.offsetY = (height - WORLD.viewHeight * this.scale) / 2;
    this.render(1);
  }
  private label(text: string, x: number, y: number, color: string, size = 12): void {
    this.ctx.fillStyle = color; this.ctx.font = `600 ${size}px system-ui`; this.ctx.fillText(text, x, y);
  }
  private drawHazards(p: Palette): void {
    const ctx = this.ctx;
    for (const hazard of this.run.course.hazards) {
      const b = hazardBounds(hazard, this.run.time, this.run.level);
      if (b.x + b.w < this.run.camera || b.x > this.run.camera + WORLD.viewWidth) continue;
      ctx.fillStyle = p.danger;
      if (hazard.kind === 'spikes') {
        for (let x = b.x; x < b.x + b.w; x += b.w / 4) {
          ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.w / 8, b.y);
          ctx.lineTo(x + b.w / 4, b.y + b.h); ctx.fill();
        }
      } else if (hazard.kind === 'saw') {
        ctx.strokeStyle = p.muted; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(b.x + b.w / 2, 270); ctx.lineTo(b.x + b.w / 2, WORLD.ground + 35); ctx.stroke();
        ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(this.run.time * 3);
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
          const angle = i / 24 * Math.PI * 2, radius = i % 2 ? 18 : 24;
          const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill(); ctx.fillStyle = p.sky; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      } else {
        const warning = (this.run.time + hazard.offset) % 3.8 > 1.2 && (this.run.time + hazard.offset) % 3.8 < 2.7;
        ctx.fillStyle = p.mid; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = p.muted; ctx.fillRect(b.x + 38, b.y, 14, b.h - 70);
        ctx.fillStyle = warning ? p.danger : p.muted; ctx.fillRect(b.x, b.y + b.h - 70, b.w, 70);
        ctx.strokeStyle = p.danger; ctx.lineWidth = 2; ctx.setLineDash([5, 8]);
        ctx.strokeRect(b.x, WORLD.ground - 8, b.w, 8); ctx.setLineDash([]);
        this.label(warning ? '!' : 'WAIT', b.x + 33, b.y + b.h - 25, p.sky, 14);
      }
    }
  }
  private render = (alpha: number): void => {
    const ctx = this.ctx, p = COLORS[this.theme], run = this.run;
    if (run.paused || run.phase !== 'playing') alpha = 1;
    const camera = run.previousCamera + (run.camera - run.previousCamera) * alpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = p.sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.offsetX * this.dpr, this.offsetY * this.dpr);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WORLD.viewWidth, WORLD.viewHeight); ctx.clip();
    // Quiet, flat parallax architecture creates depth without texture or gradients.
    ctx.fillStyle = p.far;
    for (let i = -1; i < 8; i++) {
      const x = i * 280 - camera * 0.16 % 280;
      ctx.fillRect(x, 255 + (i % 3) * 35, 130, 330);
    }
    ctx.strokeStyle = p.mid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 350); ctx.lineTo(1280, 350); ctx.stroke();
    this.label(String(run.level).padStart(2, '0'), 1030 - camera * 0.05, 300, p.mid, 160);
    ctx.translate(-camera, 0);
    for (const platform of run.course.platforms) {
      ctx.fillStyle = p.ground; ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.fillStyle = p.edge; ctx.fillRect(platform.x, platform.y, platform.w, 3);
    }
    for (let x = 120; x < run.course.width; x += 300) this.label('→', x, 567, p.edge, 20);
    for (const pickup of run.course.pickups) if (!pickup.collected) {
      ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = p.accent; ctx.fillRect(-9, -9, 18, 18); ctx.restore();
    }
    for (const wall of run.course.walls) {
      if (wall.hp <= 0) {
        ctx.fillStyle = p.muted; ctx.fillRect(wall.x, WORLD.ground - 9, 16, 9); ctx.fillRect(wall.x + 26, WORLD.ground - 6, 20, 6); continue;
      }
      ctx.fillStyle = p.muted; ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = p.sky; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wall.x + 28, wall.y);
      ctx.lineTo(wall.x + 18, wall.y + 42); ctx.lineTo(wall.x + 33, wall.y + 60); ctx.lineTo(wall.x + 14, wall.y + wall.h); ctx.stroke();
      ctx.fillStyle = p.accent; ctx.fillRect(wall.x, wall.y - 12, wall.w * wall.hp / wall.maxHp, 4);
      this.label('BREAK', wall.x - 1, wall.y - 25, p.muted, 10);
    }
    for (const x of run.course.checkpoints) {
      ctx.fillStyle = run.checkpointX >= x ? p.accent : p.muted;
      ctx.fillRect(x, WORLD.ground - 125, 3, 125);
      ctx.beginPath(); ctx.moveTo(x + 3, WORLD.ground - 125); ctx.lineTo(x + 45, WORLD.ground - 108); ctx.lineTo(x + 3, WORLD.ground - 91); ctx.fill();
      this.label('CHECKPOINT', x - 32, WORLD.ground + 32, p.muted, 10);
    }
    this.drawHazards(p);
    const finish = run.course.finish;
    ctx.strokeStyle = p.accent; ctx.lineWidth = 8; ctx.beginPath();
    ctx.moveTo(finish - 38, WORLD.ground); ctx.lineTo(finish - 38, WORLD.ground - 165);
    ctx.lineTo(finish + 38, WORLD.ground - 165); ctx.lineTo(finish + 38, WORLD.ground); ctx.stroke();
    this.label('NEXT LEVEL', finish - 45, WORLD.ground - 190, p.accent, 12);
    this.label('MOVE', 113, WORLD.ground + 35, p.muted);
    this.label('JUMP ↑', 575, WORLD.ground - 80, p.muted);
    run.player.draw(ctx, alpha, run.level, p.ink, p.accent, run.time, p.sky);
    ctx.restore();
  };
}
