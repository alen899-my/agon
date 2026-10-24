/** Shared physical beach bounds, access lane and recreation layout. */
export const BEACH = { x: -510, z: 190, halfWidth: 112, back: 140, shore: 238 };
export const BEACH_ROAD = [{ x: -510, z: 108 }, { x: -510, z: 182 }];
export const BEACH_COAST_ROAD = [{ x: -600, z: 182 }, { x: -420, z: 182 }];
export const BEACH_PALMS = [-609, -570, -450, -411].map(x => ({ x, z: 197, r: .45 }));
export const BEACH_PROPS = [-590, -555, -475, -440].map(x => ({ x, z: 210, r: 0.45 }));
export function beachDistance(x: number, z: number): number {
  return Math.min(112 - Math.abs(x + 510), z - 140, 230 - z);
}
export function beachHeight(x: number, z: number): number {
  return Math.abs(x + 510) < 114 && z > 140 ? -Math.max(0, z - 202) * 0.045 : 0;
}
export function beachClearing(x: number, z: number): boolean {
  return (Math.abs(x + 510) < 116 && z > 136) || (Math.abs(x + 510) < 11 && z > 98);
}
export function onBeachRoad(x: number, z: number, half = 6): boolean {
  return (Math.abs(x + 510) < half && z >= 103 && z <= 182) ||
    (Math.abs(z - 182) < half && x >= -600 && x <= -420) ||
    Math.hypot(x + 600, z - 182) < 11 || Math.hypot(x + 420, z - 182) < 11;
}
