import { describe, expect, it } from 'vitest';
import { SkidMarks, SKID_LIFE, type SkidSample } from './SkidMarks';

const sample = (time: number, active: boolean, angle = 0): SkidSample => ({
  active,
  x: Math.cos(angle) * 8, z: Math.sin(angle) * 8, yaw: angle,
  slip: 5, time, rearOff: 1.4, trackHalf: 0.9,
});

describe('skid marks', () => {
  it('lays twin ribbons while drifting and clears them after a minute', () => {
    const skids = new SkidMarks();
    expect(skids.livePoints()).toBe(0);
    // Two seconds of donut drifting at 60Hz.
    for (let i = 0; i < 120; i++) skids.update(sample(i / 60, true, i * 0.06));
    const laid = skids.livePoints();
    expect(laid).toBeGreaterThan(50);
    // Still there just before expiry, gone a minute after the last mark.
    skids.update(sample(SKID_LIFE - 1, false));
    expect(skids.livePoints()).toBeGreaterThan(0);
    skids.update(sample(SKID_LIFE + 5, false));
    expect(skids.livePoints()).toBe(0);
  });

  it('fades marks in and out instead of popping', () => {
    const skids = new SkidMarks();
    for (let i = 0; i < 120; i++) skids.update(sample(i / 60, true, i * 0.06));
    const peak = (mesh: number): number => {
      const attr = (skids.group.children[mesh] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } })
        .geometry.getAttribute('aAlpha').array;
      let m = 0;
      for (const v of attr) m = Math.max(m, v);
      return m;
    };
    const fresh = Math.max(peak(0), peak(1));
    expect(fresh).toBeGreaterThan(0.3);
    // Near the end of life the same marks are almost transparent.
    skids.update(sample(SKID_LIFE - 2, false));
    const faded = Math.max(peak(0), peak(1));
    expect(faded).toBeLessThan(fresh * 0.6);
  });
});
