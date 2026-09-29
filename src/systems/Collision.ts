import type { Hazard, Rect } from '../game/State';
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
/** Identical bounds for drawing and damage. Crushers telegraph before dropping. */
export function hazardBounds(hazard: Hazard, time: number, level: number): Rect {
  if (hazard.kind === 'saw') return { ...hazard, y: hazard.y + Math.sin(time * (1.7 + Math.min(level, 12) * 0.05) + hazard.offset) * 65 };
  if (hazard.kind === 'crusher') {
    const cycle = (time + hazard.offset) % 3.8;
    const extension = cycle < 1.7 ? 0 : cycle < 2 ? (cycle - 1.7) / 0.3 : cycle < 2.7 ? 1 : Math.max(0, 1 - (cycle - 2.7) / 0.6);
    return { ...hazard, h: hazard.h + extension * 230 };
  }
  return hazard;
}
