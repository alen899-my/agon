import { WORLD, type Rect } from '../game/State';
import { physique } from '../systems/LevelManager';

export class Player {
  x = 160; y: number = WORLD.ground; previousX = this.x; previousY = this.y;
  vx = 0; vy = 0; facing = 1; grounded = true; health = 3;
  coyote = 0.1; jumpBuffer = 0; attack = 0; attackCooldown = 0; invincible = 0;
  stride = 0;
  get bounds(): Rect { return { x: this.x - 20, y: this.y - 112, w: 40, h: 112 }; }
  respawn(x: number): void {
    this.x = this.previousX = x; this.y = this.previousY = WORLD.ground;
    this.vx = this.vy = this.attack = this.jumpBuffer = 0;
    this.grounded = true; this.coyote = 0.1; this.invincible = 1.2;
  }
  draw(ctx: CanvasRenderingContext2D, alpha: number, level: number, ink: string, accent: string, time: number, trim = accent): void {
    const muscle = physique(level).muscle;
    const x = this.previousX + (this.x - this.previousX) * alpha;
    const y = this.previousY + (this.y - this.previousY) * alpha;
    const running = this.grounded && Math.abs(this.vx) > 10;
    const swing = running ? Math.sin(this.stride) : 0;
    const bob = running ? Math.abs(Math.cos(this.stride)) * 3 : Math.sin(time * 2) * 1.5;
    ctx.save(); ctx.translate(x, y); ctx.scale(this.facing, 1);
    if (this.invincible > 0 && Math.floor(this.invincible * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const limb = (points: number[], width: number, color = ink) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.stroke();
    };
    const leg = this.grounded ? swing * 23 : 20;
    limb([0, -49, -10 - leg / 2, -26, -15 - leg, -3], 9 + muscle * 8);
    limb([0, -49, 12 + leg / 2, -25, 15 + leg, -3], 10 + muscle * 8);
    limb([-4, -84 + bob, -20, -65 - swing * 12, -14 + swing * 16, -48], 8 + muscle * 13);
    ctx.fillStyle = ink; ctx.beginPath();
    ctx.moveTo(-13 - muscle * 17, -91 + bob); ctx.quadraticCurveTo(0, -100 + bob, 13 + muscle * 17, -91 + bob);
    ctx.lineTo(10 + muscle * 6, -49); ctx.lineTo(-10 - muscle * 6, -49); ctx.closePath(); ctx.fill();
    limb([5, -84 + bob, this.attack > 0 ? 36 : 21, this.attack > 0 ? -82 : -65 + swing * 12,
      this.attack > 0 ? 73 : 14 - swing * 16, this.attack > 0 ? -86 : -47], 9 + muscle * 13);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, -112 + bob, 17 + muscle * 2, 0, Math.PI * 2); ctx.fill();
    limb([-15, -116 + bob, 15, -116 + bob], 5, trim);
    limb([-16, -116 + bob, -27, -109 + bob], 4, accent);
    ctx.fillStyle = trim; ctx.fillRect(6, -109 + bob, 4, 3);
    limb([-10 - muscle * 6, -51, 10 + muscle * 6, -51], 5, trim);
    if (this.attack > 0) {
      ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath();
      ctx.arc(64, -83, 26, -0.9, 0.7); ctx.stroke();
    }
    ctx.restore();
  }
}
