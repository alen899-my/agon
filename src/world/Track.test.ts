import { describe, expect, it } from 'vitest';
import { CHECKPOINT_COUNT, gridSlots, MAX_RACERS, START_OFFSET, TRACK_LENGTH, trackProgress } from './Track';

describe('city loop track', () => {
  it('loop length is 608m', () => {
    expect(TRACK_LENGTH).toBeCloseTo(608, 5);
  });
  it('produces 8 grid slots on the road', () => {
    const slots = gridSlots();
    expect(slots).toHaveLength(MAX_RACERS);
    for (const s of slots) {
      expect(Math.abs(s.z)).toBeGreaterThan(60);
      expect(Number.isFinite(s.yaw)).toBe(true);
    }
  });
  it('start line maps to lapDist 0 and checkpoints advance', () => {
    const atStart = trackProgress(-38, -76);
    expect(atStart.lapDist).toBeLessThan(2);
    // East straight midpoint
    const east = trackProgress(76, 0);
    expect(east.dist).toBeGreaterThan(atStart.dist);
    expect(east.checkpoint).toBeGreaterThanOrEqual(0);
    expect(east.checkpoint).toBeLessThan(CHECKPOINT_COUNT);
  });
  it('START_OFFSET is on the south straight', () => {
    expect(START_OFFSET).toBe(38);
  });
});
