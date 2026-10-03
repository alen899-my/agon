import { describe, expect, it } from 'vitest';
import { BUILDINGS, LAMPS, LIMIT, PARKED_CARS, PROPS, RACE_CLEARANCE, ROADS, ROAD_HALF, SOLIDS, TREES, BENCHES, onRoad } from './Map';

const CLEAR = RACE_CLEARANCE;
/** Buildings must clear the asphalt itself (ROAD_HALF); small props/lamps stay
 *  clear of the wider race line so traffic never clips them. */
const BUILD_CLEAR = ROAD_HALF;
function boxClearOfRoads(x: number, z: number, w: number, d: number): boolean {
  // All four corners + center must be off the asphalt (with margin).
  for (const [cx, cz] of [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]]) {
    if (onRoad(cx, cz, BUILD_CLEAR)) return false;
  }
  return true;
}

describe('phase-2 expansion invariants', () => {
  it('fits the announced size', () => {
    expect(LIMIT).toBe(160);
    expect(ROADS).toEqual([-140, -80, 0, 80, 140]);
  });
  it('keeps every solid box off driving asphalt and inside the wall', () => {
    for (const b of SOLIDS) {
      expect(boxClearOfRoads(b.x, b.z, b.w, b.d)).toBe(true);
      expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(LIMIT);
      expect(Math.abs(b.z) + b.d / 2).toBeLessThanOrEqual(LIMIT);
    }
  });
  it('keeps every prop/parked/bench/tree off driving asphalt', () => {
    for (const p of [...PROPS, ...PARKED_CARS]) expect(onRoad(p.x, p.z, CLEAR)).toBe(false);
    for (const [x, z] of [...TREES, ...BENCHES]) expect(onRoad(x, z, CLEAR)).toBe(false);
    for (const l of LAMPS) expect(onRoad(l.x, l.z, CLEAR)).toBe(false);
  });
  it('does not overlap buildings with each other', () => {
    for (let i = 0; i < BUILDINGS.length; i++) for (let j = i + 1; j < BUILDINGS.length; j++) {
      const a = BUILDINGS[i], b = BUILDINGS[j];
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
      expect(overlap).toBe(false);
    }
  });
});
