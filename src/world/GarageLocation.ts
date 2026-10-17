/** West motor works, off the z=0 avenue. Front door faces south (+Z). */
export const GARAGE = { x: -118, z: -19, w: 18, d: 22, h: 7 };
export const GARAGE_BAY = { x: GARAGE.x, z: -14 };
export const GARAGE_WALLS = [
  { x: GARAGE.x - 9, z: GARAGE.z, w: 0.5, d: 22, h: 7 },
  { x: GARAGE.x + 9, z: GARAGE.z, w: 0.5, d: 22, h: 7 },
  { x: GARAGE.x, z: GARAGE.z - 11, w: 18, d: 0.5, h: 7 },
];
export function atGarage(x: number, z: number): boolean {
  return Math.abs(x - GARAGE_BAY.x) < 7 && Math.abs(z - GARAGE_BAY.z) < 6;
}
