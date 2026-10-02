import { describe, expect, it } from 'vitest';
import { AUDIBLE_RADIUS, TIMBRES, TRAFFIC_VOICES, flavorFor, gainFromDistance, gearFor, nearestTraffic, rpmHz } from './VehicleAudio';
import { VEHICLES } from '../world/Vehicles';

describe('vehicle audio helpers', () => {
  it('maps electrics to a quiet whine, everyone else to their category', () => {
    expect(flavorFor('egt')).toBe('ev');
    expect(flavorFor('esedan')).toBe('ev');
    expect(flavorFor('hummer')).toBe('ev');
    expect(flavorFor('super')).toBe('sport');
    expect(flavorFor('bus')).toBe('bus');
    expect(flavorFor('car')).toBe('car');
    expect(TIMBRES.ev.wave).toBe('sine');
    expect(TIMBRES.ev.baseGain).toBeLessThan(TIMBRES.car.baseGain);
  });

  it('shifts stepped gears with an audible drop at each boundary', () => {
    const t = TIMBRES.sport; // 6 gears
    const top = VEHICLES.super.topSpeed;
    expect(gearFor(0, top, t.gears)).toBe(0);
    expect(gearFor(top * 0.5, top, t.gears)).toBe(3);
    expect(gearFor(top, top, t.gears)).toBe(t.gears - 1);
    expect(gearFor(0, top, 1)).toBe(0); // single-speed never shifts
    // Just below the 1→2 boundary screams near redline; just above it drops.
    const boundary = top / t.gears;
    const before = rpmHz(boundary * 0.99, top, t);
    const after = rpmHz(boundary * 1.01, top, t);
    expect(before).toBeGreaterThan(after * 1.3);
    // Still idles at standstill and tops out at full speed.
    expect(rpmHz(0, top, t)).toBe(t.baseHz);
    expect(rpmHz(top, top, t)).toBe(t.topHz);
    // Clamped past the top speed, mirrored in reverse.
    expect(rpmHz(999, top, t)).toBe(t.topHz);
    expect(rpmHz(-top, top, t)).toBe(t.topHz);
  });

  it('glides electrics continuously with no steps', () => {
    const t = TIMBRES.ev;
    const top = VEHICLES.egt.topSpeed;
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const f = rpmHz((i / 40) * top, top, t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(rpmHz(top, top, t)).toBe(t.topHz);
  });

  it('fades gain with distance to silence at the audible edge', () => {
    expect(gainFromDistance(0)).toBe(1);
    expect(gainFromDistance(6)).toBe(1);
    expect(gainFromDistance(AUDIBLE_RADIUS)).toBe(0);
    expect(gainFromDistance(999)).toBe(0);
    const mid = gainFromDistance((6 + AUDIBLE_RADIUS) / 2);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  });

  it('picks the nearest traffic up to the pool size', () => {
    const items = [
      { key: 'far', kind: 'bus' as const, x: 100, z: 0, speed: 5 },
      { key: 'near', kind: 'car' as const, x: 3, z: 0, speed: 8 },
      { key: 'mid', kind: 'taxi' as const, x: 20, z: 0, speed: 6 },
    ];
    const picked = nearestTraffic(items, 0, 0, TRAFFIC_VOICES);
    expect(picked.map(p => p.key)).toEqual(['near', 'mid']);
    expect(picked[0].dist).toBeCloseTo(3, 5);
    expect(nearestTraffic(items, 0, 0, 1).map(p => p.key)).toEqual(['near']);
    expect(nearestTraffic(items, 500, 500, TRAFFIC_VOICES)).toEqual([]);
  });
});
