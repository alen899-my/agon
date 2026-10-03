import { describe, expect, it } from 'vitest';
import { CHECKPOINT_COUNT, gridSlots, MAX_RACERS, START_OFFSET, TRACK_LENGTH, TRACK_POINTS, trackProgress } from './Track';
import { ROADS, onRoad, ROAD_HALF } from './Map';

describe('grand circuit track', () => {
  it('is a longer technical loop, not the old square', () => {
    expect(TRACK_LENGTH).toBeGreaterThan(900);
    expect(TRACK_LENGTH).toBeLessThan(1100);
    expect(TRACK_POINTS.length).toBeGreaterThanOrEqual(10);
  });
  it('rides driving asphalt on every leg', () => {
    for (let i = 0; i < TRACK_POINTS.length; i++) {
      const p = TRACK_POINTS[i];
      const q = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
      // Sample every 4m: midpoint of each sample must sit on a road band.
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      for (let d = 0; d <= len; d += 4) {
        const x = p.x + (q.x - p.x) * (d / len);
        const z = p.z + (q.z - p.z) * (d / len);
        expect(ROADS.some((r) => Math.abs(x - r) < ROAD_HALF || Math.abs(z - r) < ROAD_HALF)).toBe(true);
      }
    }
  });
  it('produces 8 grid slots on the road', () => {
    const slots = gridSlots();
    expect(slots).toHaveLength(MAX_RACERS);
    for (const s of slots) {
      expect(onRoad(s.x, s.z, ROAD_HALF)).toBe(true);
      expect(Number.isFinite(s.yaw)).toBe(true);
    }
  });
  it('start line maps to lapDist 0 and checkpoints advance', () => {
    const atStart = trackProgress(6, -136);
    expect(atStart.lapDist).toBeLessThan(2);
    // South straight midpoint, further along the lap
    const east = trackProgress(100, -136);
    expect(east.dist).toBeGreaterThan(atStart.dist);
    expect(east.checkpoint).toBeGreaterThanOrEqual(0);
    expect(east.checkpoint).toBeLessThan(CHECKPOINT_COUNT);
  });
  it('START_OFFSET is on the south straight', () => {
    expect(START_OFFSET).toBe(38);
  });
});
