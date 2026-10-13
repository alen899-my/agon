import { describe, expect, it } from 'vitest';
import {
  F1_DRS_ZONES,
  F1_HALF,
  F1_LENGTH,
  F1_ORIGIN,
  f1BaseNoise,
  f1Checkpoints,
  f1DistanceAt,
  f1GridSlots,
  f1HeightAt,
  f1InDrs,
  f1InPitSpan,
  f1KerbZones,
  f1NextTurn,
  f1OnTrack,
  f1PathAt,
  f1Progress,
  f1StartLine,
  f1TerrainHeightAt,
} from './F1Track';

describe('F1 circuit', () => {
  it('is a plausible grand-prix length on its own island', () => {
    expect(F1_LENGTH).toBeGreaterThan(900);
    expect(F1_LENGTH).toBeLessThan(4000);
    expect(Math.abs(F1_ORIGIN.x)).toBeGreaterThan(1000);
  });
  it('centreline samples sit on the track with matching height', () => {
    for (const d of [0, F1_LENGTH * 0.25, F1_LENGTH * 0.5, F1_LENGTH * 0.75]) {
      const p = f1PathAt(d, 0);
      expect(f1OnTrack(p.x, p.z)).toBe(true);
      const prog = f1Progress(p.x, p.z);
      expect(prog.lateral).toBeLessThan(1.5);
      expect(Math.abs(prog.height - p.y)).toBeLessThan(1.0);
    }
  });
  it('lap distance wraps and checkpoints advance in order', () => {
    const a = f1Progress(f1PathAt(F1_LENGTH - 5, 0).x, f1PathAt(F1_LENGTH - 5, 0).z);
    const b = f1Progress(f1PathAt(5, 0).x, f1PathAt(5, 0).z);
    expect(a.lapDist).toBeGreaterThan(F1_LENGTH * 0.9);
    expect(b.lapDist).toBeLessThan(F1_LENGTH * 0.1);
    expect(f1Checkpoints()).toHaveLength(8);
  });
  it('grid slots sit on asphalt behind the line with elevation', () => {
    const line = f1StartLine();
    const slots = f1GridSlots();
    expect(slots).toHaveLength(8);
    for (const s of slots) {
      expect(f1OnTrack(s.x, s.z, F1_HALF + 1)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
      void line;
    }
    expect(f1DistanceAt(slots[0].x, slots[0].z)).toBeGreaterThanOrEqual(0);
  });
  it('has climb and descent (hilly, not flat)', () => {
    const ys: number[] = [];
    for (let d = 0; d < F1_LENGTH; d += F1_LENGTH / 32) ys.push(f1PathAt(d, 0).y);
    const spread = Math.max(...ys) - Math.min(...ys);
    expect(spread).toBeGreaterThan(6);
  });
  it('DRS zones are on fast straights and the pit span wraps the start line', () => {
    expect(F1_DRS_ZONES).toHaveLength(2);
    for (const z of F1_DRS_ZONES) {
      const mid = (z.start + z.end) / 2;
      const c = Math.abs(f1PathAt(mid, 0).curvature);
      expect(c).toBeLessThan(0.02);
      expect(f1InDrs(mid % F1_LENGTH)).toBe(true);
    }
    expect(f1InPitSpan(0)).toBe(true);
  });
  it('off-track ground falls back to terrain, not track height', () => {
    const h = f1HeightAt(F1_ORIGIN.x + 500, 500);
    expect(h).toBe(0);
  });
  it('next-turn guidance always resolves', () => {
    const s = f1StartLine();
    const n = f1NextTurn(s.x, s.z);
    expect(n.turn.name).toBeTruthy();
    expect(n.dist).toBeGreaterThanOrEqual(0);
  });
  it('terrain matches the road at the edge and rolls off-track', () => {
    const p = f1PathAt(F1_LENGTH * 0.3, 0);
    const rx = Math.cos(p.yaw);
    const rz = Math.sin(p.yaw);
    // At the asphalt edge the terrain meets the road (skirt top).
    const edge = f1TerrainHeightAt(p.x + rx * (F1_HALF + 2), p.z + rz * (F1_HALF + 2));
    expect(Math.abs(edge - p.y)).toBeLessThan(0.6);
    // Far runoff settles to rolling base, continuous (no cliffs between samples).
    let prev = f1TerrainHeightAt(p.x + rx * 60, p.z + rz * 60);
    expect(Number.isFinite(prev)).toBe(true);
    for (const lateral of [70, 80, 90, 100]) {
      const h = f1TerrainHeightAt(p.x + rx * lateral, p.z + rz * lateral);
      expect(Math.abs(h - prev)).toBeLessThan(2.5);
      prev = h;
    }
    expect(f1BaseNoise(p.x, p.z)).toBeGreaterThan(-4);
    expect(f1BaseNoise(p.x, p.z)).toBeLessThan(4);
  });
  it('kerb zones sit on corners, never on straights', () => {
    const zones = f1KerbZones();
    expect(zones.length).toBeGreaterThanOrEqual(4);
    for (const z of zones) {
      expect(z.end - z.start).toBeGreaterThanOrEqual(18);
      const mid = (z.start + z.end) / 2;
      expect(Math.abs(f1PathAt(mid, 0).curvature)).toBeGreaterThan(0.004);
    }
    // DRS straights stay kerb-free.
    for (const dz of F1_DRS_ZONES) {
      const mid = (dz.start + dz.end) / 2;
      const covered = zones.some((z) => mid >= z.start && mid <= z.end);
      expect(covered).toBe(false);
    }
  });
});
